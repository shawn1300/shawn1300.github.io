#pragma once

#include <Adafruit_PM25AQI.h>
#include <Adafruit_SHT31.h>
#include <HardwareSerial.h>

#include "environment-uploader.h"

struct EnvironmentSensorConfig {
  int pmsRxPin;
  int pmsTxPin;
  int shtSdaPin;
  int shtSclPin;
  bool enableTemperature;
  bool enableHumidity;
  bool enablePm25;
  unsigned long pmsWarmupMs;
  unsigned long pmsSampleIntervalMs;
  unsigned long shtSampleIntervalMs;
};

class Sht30Pms5003Adapter : public EnvironmentSampleProvider {
 public:
  explicit Sht30Pms5003Adapter(const EnvironmentSensorConfig &config);

  void begin(unsigned long nowMs);
  void sample(unsigned long nowMs) override;
  size_t readWindow(EnvironmentMetricValue *output,
                    size_t capacity) const override;
  time_t sourceUpdatedAt() const override;
  void clearWindow() override;
  void printStatus() const override;

 private:
  struct Average {
    double sum = 0;
    uint32_t count = 0;

    void add(float value);
    float value() const;
    void clear();
  };

  bool beginSht30();
  void readSht30(unsigned long nowMs);
  void readPms5003(unsigned long nowMs);
  void markSourceUpdated();

  EnvironmentSensorConfig config_;
  HardwareSerial pmsSerial_{2};
  Adafruit_PM25AQI pms5003_;
  Adafruit_SHT31 sht30_;
  bool shtReady_ = false;
  bool pmsReady_ = false;
  uint8_t shtAddress_ = 0;
  unsigned long bootAt_ = 0;
  unsigned long lastPmsReadAt_ = 0;
  unsigned long lastShtReadAt_ = 0;
  time_t lastSampleAt_ = 0;
  Average temperature_;
  Average humidity_;
  Average pm25_;
};
