#include "sensor-adapter.h"

#include <Wire.h>
#include <math.h>

namespace {
constexpr time_t kMinimumValidEpoch = 1704067200;  // 2024-01-01 UTC
}

void Sht30Pms5003Adapter::Average::add(float value) {
  sum += value;
  ++count;
}

float Sht30Pms5003Adapter::Average::value() const {
  return count == 0 ? NAN : static_cast<float>(sum / count);
}

void Sht30Pms5003Adapter::Average::clear() {
  sum = 0;
  count = 0;
}

Sht30Pms5003Adapter::Sht30Pms5003Adapter(
    const EnvironmentSensorConfig &config)
    : config_(config) {}

bool Sht30Pms5003Adapter::beginSht30() {
  for (const uint8_t address : {0x44, 0x45}) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0 && sht30_.begin(address)) {
      shtAddress_ = address;
      return true;
    }
  }
  return false;
}

void Sht30Pms5003Adapter::begin(unsigned long nowMs) {
  bootAt_ = nowMs;
  lastPmsReadAt_ = nowMs;
  lastShtReadAt_ = nowMs - config_.shtSampleIntervalMs;

  Wire.begin(config_.shtSdaPin, config_.shtSclPin);
  shtReady_ = beginSht30();
  if (shtReady_) {
    Serial.printf("SHT30 ready at 0x%02X\n", shtAddress_);
  } else {
    Serial.println("SHT30 not detected at 0x44 or 0x45");
  }

  pmsSerial_.begin(9600, SERIAL_8N1, config_.pmsRxPin, config_.pmsTxPin);
  pmsReady_ = pms5003_.begin_UART(&pmsSerial_);
  Serial.println(pmsReady_ ? "PMS5003 UART ready; warming up"
                           : "PMS5003 UART initialization failed");
}

void Sht30Pms5003Adapter::markSourceUpdated() {
  const time_t now = time(nullptr);
  if (now >= kMinimumValidEpoch) lastSampleAt_ = now;
}

void Sht30Pms5003Adapter::readSht30(unsigned long nowMs) {
  if (!shtReady_ || nowMs - lastShtReadAt_ < config_.shtSampleIntervalMs) {
    return;
  }
  lastShtReadAt_ = nowMs;

  float temperatureC = NAN;
  float humidityPercent = NAN;
  if (!sht30_.readBoth(&temperatureC, &humidityPercent)) {
    Serial.println("SHT30 read failed");
    return;
  }

  bool accepted = false;
  if (config_.enableTemperature && isfinite(temperatureC) &&
      temperatureC >= -30 && temperatureC <= 100) {
    temperature_.add(temperatureC);
    accepted = true;
  }
  if (config_.enableHumidity && isfinite(humidityPercent) &&
      humidityPercent >= 0 && humidityPercent <= 100) {
    humidity_.add(humidityPercent);
    accepted = true;
  }
  if (accepted) markSourceUpdated();
}

void Sht30Pms5003Adapter::readPms5003(unsigned long nowMs) {
  if (!config_.enablePm25 || !pmsReady_ ||
      nowMs - bootAt_ < config_.pmsWarmupMs ||
      nowMs - lastPmsReadAt_ < config_.pmsSampleIntervalMs) {
    return;
  }
  lastPmsReadAt_ = nowMs;

  PM25_AQI_Data data;
  if (!pms5003_.read(&data)) return;
  if (data.pm25_env <= 5000) {
    pm25_.add(static_cast<float>(data.pm25_env));
    markSourceUpdated();
  }
}

void Sht30Pms5003Adapter::sample(unsigned long nowMs) {
  readSht30(nowMs);
  readPms5003(nowMs);
}

size_t Sht30Pms5003Adapter::readWindow(EnvironmentMetricValue *output,
                                       size_t capacity) const {
  if (output == nullptr || capacity == 0) return 0;
  size_t used = 0;
  if (config_.enableTemperature && temperature_.count > 0 && used < capacity) {
    output[used++] = {"temperatureC", temperature_.value(),
                      temperature_.count};
  }
  if (config_.enableHumidity && humidity_.count > 0 && used < capacity) {
    output[used++] = {"humidityPercent", humidity_.value(), humidity_.count};
  }
  if (config_.enablePm25 && pm25_.count > 0 && used < capacity) {
    output[used++] = {"pm25UgM3", pm25_.value(), pm25_.count};
  }
  return used;
}

time_t Sht30Pms5003Adapter::sourceUpdatedAt() const {
  return lastSampleAt_;
}

void Sht30Pms5003Adapter::clearWindow() {
  temperature_.clear();
  humidity_.clear();
  pm25_.clear();
  lastSampleAt_ = 0;
}

void Sht30Pms5003Adapter::printStatus() const {
  Serial.printf("T/H/PM2.5 samples=%lu/%lu/%lu\n",
                static_cast<unsigned long>(temperature_.count),
                static_cast<unsigned long>(humidity_.count),
                static_cast<unsigned long>(pm25_.count));
}
