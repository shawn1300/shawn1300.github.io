#include <Adafruit_PM25AQI.h>
#include <Adafruit_SHT31.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

#include "secrets.h"
#include "trusted-roots.h"

namespace {
constexpr int kPmsRxPin = 16;
constexpr int kPmsTxPin = 17;
constexpr int kSdaPin = 21;
constexpr int kSclPin = 22;

constexpr char kIngestUrl[] =
    "https://shawn1300.cc.cd/api/environment/v2/ingest";
constexpr char kDeviceSlug[] = "dormitory-air-station";

constexpr unsigned long kPmsWarmupMs = 30UL * 1000UL;
constexpr unsigned long kPmsReadIntervalMs = 2UL * 1000UL;
constexpr unsigned long kShtReadIntervalMs = 30UL * 1000UL;
constexpr unsigned long kUploadIntervalMs = 10UL * 60UL * 1000UL;
constexpr unsigned long kReconnectIntervalMs = 30UL * 1000UL;
constexpr unsigned long kStatusIntervalMs = 60UL * 1000UL;
constexpr uint32_t kHttpTimeoutMs = 8000;
constexpr time_t kMinimumValidEpoch = 1704067200;  // 2024-01-01 UTC

HardwareSerial pmsSerial(2);
Adafruit_PM25AQI pms5003;
Adafruit_SHT31 sht30;

struct Average {
  double sum = 0;
  uint32_t count = 0;

  void add(float value) {
    sum += value;
    ++count;
  }

  float value() const {
    return count == 0 ? NAN : static_cast<float>(sum / count);
  }

  void clear() {
    sum = 0;
    count = 0;
  }
};

Average temperature;
Average humidity;
Average pm25;

bool shtReady = false;
bool pmsReady = false;
uint8_t shtAddress = 0;
unsigned long bootAt = 0;
unsigned long lastPmsReadAt = 0;
unsigned long lastShtReadAt = 0;
unsigned long windowStartedAt = 0;
unsigned long lastReconnectAt = 0;
unsigned long lastStatusAt = 0;
time_t lastSampleAt = 0;

bool clockReady() {
  return time(nullptr) >= kMinimumValidEpoch;
}

bool validCredentials() {
  return strcmp(WIFI_SSID, "PASTE_WIFI_NAME_HERE") != 0 &&
         strcmp(WIFI_PASSWORD, "PASTE_WIFI_PASSWORD_HERE") != 0 &&
         strcmp(SOURCE_TOKEN, "PASTE_SOURCE_TOKEN_HERE") != 0 &&
         strlen(WIFI_SSID) > 0 && strlen(SOURCE_TOKEN) >= 32;
}

bool beginSht30() {
  for (const uint8_t address : {0x44, 0x45}) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0 && sht30.begin(address)) {
      shtAddress = address;
      return true;
    }
  }
  return false;
}

void beginWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
}

void maintainWiFi(unsigned long nowMs) {
  static bool ntpConfigured = false;
  if (WiFi.status() == WL_CONNECTED) {
    if (!ntpConfigured) {
      configTime(0, 0, "time.cloudflare.com", "time.google.com", "pool.ntp.org");
      ntpConfigured = true;
      Serial.print("Wi-Fi connected, IP: ");
      Serial.println(WiFi.localIP());
      Serial.println("UTC clock synchronization requested");
    }
    return;
  }

  if (nowMs - lastReconnectAt >= kReconnectIntervalMs) {
    lastReconnectAt = nowMs;
    Serial.println("Wi-Fi disconnected; requesting reconnect");
    WiFi.reconnect();
  }
}

void readSht30(unsigned long nowMs) {
  if (!shtReady || nowMs - lastShtReadAt < kShtReadIntervalMs) return;
  lastShtReadAt = nowMs;

  float temperatureC = NAN;
  float humidityPercent = NAN;
  if (!sht30.readBoth(&temperatureC, &humidityPercent)) {
    Serial.println("SHT30 read failed");
    return;
  }

  bool accepted = false;
  if (isfinite(temperatureC) && temperatureC >= -30 && temperatureC <= 100) {
    temperature.add(temperatureC);
    accepted = true;
  }
  if (isfinite(humidityPercent) && humidityPercent >= 0 &&
      humidityPercent <= 100) {
    humidity.add(humidityPercent);
    accepted = true;
  }
  if (accepted && clockReady()) lastSampleAt = time(nullptr);
}

void readPms5003(unsigned long nowMs) {
  if (!pmsReady || nowMs - bootAt < kPmsWarmupMs ||
      nowMs - lastPmsReadAt < kPmsReadIntervalMs) {
    return;
  }
  lastPmsReadAt = nowMs;

  PM25_AQI_Data data;
  if (!pms5003.read(&data)) return;
  if (data.pm25_env <= 5000) {
    pm25.add(static_cast<float>(data.pm25_env));
    if (clockReady()) lastSampleAt = time(nullptr);
  }
}

bool utcTimestamp(time_t value, char *output, size_t outputSize) {
  if (value < kMinimumValidEpoch || outputSize < 25) return false;
  struct tm utc;
  if (gmtime_r(&value, &utc) == nullptr) return false;
  return strftime(output, outputSize, "%Y-%m-%dT%H:%M:%S.000Z", &utc) > 0;
}

bool appendMetric(char *output, size_t outputSize, size_t &used,
                  const char *key, float value, bool &first) {
  const int written = snprintf(output + used, outputSize - used,
                               "%s\"%s\":%.1f", first ? "" : ",", key,
                               value);
  if (written < 0 || static_cast<size_t>(written) >= outputSize - used) {
    return false;
  }
  used += static_cast<size_t>(written);
  first = false;
  return true;
}

bool buildPayload(char *output, size_t outputSize) {
  if (!clockReady() || lastSampleAt < kMinimumValidEpoch) return false;

  char sentAt[25];
  char sourceUpdatedAt[25];
  if (!utcTimestamp(time(nullptr), sentAt, sizeof(sentAt)) ||
      !utcTimestamp(lastSampleAt, sourceUpdatedAt, sizeof(sourceUpdatedAt))) {
    return false;
  }

  char metrics[192] = {};
  size_t used = 0;
  bool first = true;
  if (temperature.count > 0 &&
      !appendMetric(metrics, sizeof(metrics), used, "temperatureC",
                    temperature.value(), first)) {
    return false;
  }
  if (humidity.count > 0 &&
      !appendMetric(metrics, sizeof(metrics), used, "humidityPercent",
                    humidity.value(), first)) {
    return false;
  }
  if (pm25.count > 0 &&
      !appendMetric(metrics, sizeof(metrics), used, "pm25UgM3", pm25.value(),
                    first)) {
    return false;
  }
  if (first) return false;

  const int written = snprintf(
      output, outputSize,
      "{\"schemaVersion\":2,\"sentAt\":\"%s\",\"readings\":[{\"device\":\"%s\",\"sourceUpdatedAt\":\"%s\",\"metrics\":{%s}}]}",
      sentAt, kDeviceSlug, sourceUpdatedAt, metrics);
  return written > 0 && static_cast<size_t>(written) < outputSize;
}

void uploadWindow() {
  Serial.printf(
      "10-minute window: temperature=%lu, humidity=%lu, PM2.5=%lu samples\n",
      static_cast<unsigned long>(temperature.count),
      static_cast<unsigned long>(humidity.count),
      static_cast<unsigned long>(pm25.count));

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Upload skipped: Wi-Fi is disconnected");
    return;
  }
  if (!clockReady()) {
    Serial.println("Upload skipped: UTC clock is not synchronized");
    return;
  }

  char payload[512];
  if (!buildPayload(payload, sizeof(payload))) {
    Serial.println("Upload skipped: no timestamped sensor readings");
    return;
  }

  NetworkClientSecure client;
  client.setCACert(HTTPS_TRUSTED_ROOTS);
  client.setHandshakeTimeout(8);

  HTTPClient http;
  http.setConnectTimeout(kHttpTimeoutMs);
  http.setTimeout(kHttpTimeoutMs);
  if (!http.begin(client, kIngestUrl)) {
    Serial.println("Upload failed: HTTPS client initialization failed");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + SOURCE_TOKEN);
  const int status = http.POST(reinterpret_cast<uint8_t *>(payload),
                               strlen(payload));
  if (status > 0) {
    Serial.printf("Upload HTTP status: %d\n", status);
    String response = http.getString();
    if (response.length() > 300) response = response.substring(0, 300);
    if (response.length() > 0) {
      Serial.print("Server response: ");
      Serial.println(response);
    }
  } else {
    Serial.printf("Upload transport error: %s\n",
                  http.errorToString(status).c_str());
  }
  http.end();
}

void clearWindow(unsigned long nowMs) {
  temperature.clear();
  humidity.clear();
  pm25.clear();
  lastSampleAt = 0;
  windowStartedAt = nowMs;
}

void printStatus(unsigned long nowMs) {
  if (nowMs - lastStatusAt < kStatusIntervalMs) return;
  lastStatusAt = nowMs;
  Serial.printf(
      "Status: Wi-Fi=%s, UTC=%s, T/H/PM2.5 samples=%lu/%lu/%lu\n",
      WiFi.status() == WL_CONNECTED ? "connected" : "disconnected",
      clockReady() ? "ready" : "waiting",
      static_cast<unsigned long>(temperature.count),
      static_cast<unsigned long>(humidity.count),
      static_cast<unsigned long>(pm25.count));
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("Dormitory air station production firmware");

  if (!validCredentials()) {
    Serial.println("STOP: fill in secrets.h before flashing this firmware");
    while (true) delay(1000);
  }

  bootAt = millis();
  windowStartedAt = bootAt;
  lastPmsReadAt = bootAt;
  lastShtReadAt = bootAt - kShtReadIntervalMs;
  lastReconnectAt = bootAt;

  Wire.begin(kSdaPin, kSclPin);
  shtReady = beginSht30();
  if (shtReady) {
    Serial.printf("SHT30 ready at 0x%02X\n", shtAddress);
  } else {
    Serial.println("SHT30 not detected at 0x44 or 0x45");
  }

  pmsSerial.begin(9600, SERIAL_8N1, kPmsRxPin, kPmsTxPin);
  pmsReady = pms5003.begin_UART(&pmsSerial);
  Serial.println(pmsReady ? "PMS5003 UART ready; warming up for 30 seconds"
                          : "PMS5003 UART initialization failed");

  beginWiFi();
}

void loop() {
  const unsigned long nowMs = millis();
  maintainWiFi(nowMs);
  readSht30(nowMs);
  readPms5003(nowMs);
  printStatus(nowMs);

  if (nowMs - windowStartedAt >= kUploadIntervalMs) {
    uploadWindow();
    clearWindow(nowMs);
  }

  delay(10);
}
