#pragma once

#include <Arduino.h>
#include <stddef.h>
#include <time.h>

struct EnvironmentWiFiCredential {
  const char *ssid;
  const char *password;
};

struct EnvironmentMetricValue {
  const char *key;
  float value;
  uint32_t samples;
};

class EnvironmentSampleProvider {
 public:
  virtual ~EnvironmentSampleProvider() = default;
  virtual void sample(unsigned long nowMs) = 0;
  virtual size_t readWindow(EnvironmentMetricValue *output,
                            size_t capacity) const = 0;
  virtual time_t sourceUpdatedAt() const = 0;
  virtual void clearWindow() = 0;
  virtual void printStatus() const = 0;
};

struct EnvironmentUploaderConfig {
  const char *deviceSlug;
  const EnvironmentWiFiCredential *networks;
  size_t networkCount;
  const char *sourceToken;
  const char *caCertificate;
  unsigned long uploadIntervalMs;
};

class EnvironmentUploader {
 public:
  explicit EnvironmentUploader(const EnvironmentUploaderConfig &config);

  void begin(unsigned long nowMs);
  void loop(unsigned long nowMs, EnvironmentSampleProvider &provider);

 private:
  enum class WiFiPhase {
    starting,
    trying,
    betweenAttempts,
    connected,
    stopped,
  };

  bool validConfiguration() const;
  bool clockReady() const;
  const char *wifiPhaseName() const;
  void startWiFiAttempt(unsigned long nowMs);
  void advanceWiFiAttempt(unsigned long nowMs);
  void stopWiFiAttempts();
  void maintainWiFi(unsigned long nowMs);
  bool buildPayload(const EnvironmentSampleProvider &provider, char *output,
                    size_t outputSize) const;
  void uploadWindow(EnvironmentSampleProvider &provider);
  void printStatus(unsigned long nowMs,
                   const EnvironmentSampleProvider &provider);

  EnvironmentUploaderConfig config_;
  WiFiPhase wifiPhase_ = WiFiPhase::starting;
  size_t wifiNetworkIndex_ = 0;
  uint8_t wifiAttemptIndex_ = 0;
  unsigned long wifiPhaseStartedAt_ = 0;
  unsigned long windowStartedAt_ = 0;
  unsigned long lastStatusAt_ = 0;
};
