#include "environment-uploader.h"

#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <math.h>
#include <string.h>

namespace {
constexpr char kIngestUrl[] =
    "https://gbmxqegjkmzuvhisyxou.supabase.co/functions/v1/environment-ingest-relay";
constexpr uint8_t kWifiAttemptsPerNetwork = 3;
constexpr unsigned long kWifiAttemptTimeoutMs = 15UL * 1000UL;
constexpr unsigned long kWifiBetweenAttemptsMs = 250UL;
constexpr unsigned long kStatusIntervalMs = 60UL * 1000UL;
constexpr uint32_t kUploadTimeoutMs = 20000;
constexpr time_t kMinimumValidEpoch = 1704067200;  // 2024-01-01 UTC
constexpr size_t kMaxMetrics = 5;

bool validSlug(const char *value) {
  if (value == nullptr) return false;
  const size_t length = strlen(value);
  if (length == 0 || length > 64 || value[0] == '-' || value[length - 1] == '-') {
    return false;
  }
  for (size_t index = 0; index < length; ++index) {
    const char character = value[index];
    if (!((character >= 'a' && character <= 'z') ||
          (character >= '0' && character <= '9') || character == '-')) {
      return false;
    }
  }
  return true;
}

bool supportedMetric(const char *key) {
  return key != nullptr &&
         (strcmp(key, "temperatureC") == 0 ||
          strcmp(key, "humidityPercent") == 0 ||
          strcmp(key, "co2Ppm") == 0 || strcmp(key, "pm25UgM3") == 0 ||
          strcmp(key, "batteryPercent") == 0);
}

bool utcTimestamp(time_t value, char *output, size_t outputSize) {
  if (value < kMinimumValidEpoch || outputSize < 25) return false;
  struct tm utc;
  if (gmtime_r(&value, &utc) == nullptr) return false;
  return strftime(output, outputSize, "%Y-%m-%dT%H:%M:%S.000Z", &utc) > 0;
}
}  // namespace

EnvironmentUploader::EnvironmentUploader(
    const EnvironmentUploaderConfig &config)
    : config_(config) {}

bool EnvironmentUploader::validConfiguration() const {
  if (!validSlug(config_.deviceSlug) || config_.networks == nullptr ||
      config_.networkCount == 0 || config_.sourceToken == nullptr ||
      config_.caCertificate == nullptr || config_.uploadIntervalMs == 0) {
    return false;
  }
  const size_t tokenLength = strlen(config_.sourceToken);
  if (tokenLength < 32 || tokenLength > 256 ||
      strstr(config_.sourceToken, "paste-") != nullptr) {
    return false;
  }
  for (size_t index = 0; index < config_.networkCount; ++index) {
    if (config_.networks[index].ssid == nullptr ||
        config_.networks[index].password == nullptr ||
        strlen(config_.networks[index].ssid) == 0) {
      return false;
    }
  }
  return true;
}

bool EnvironmentUploader::clockReady() const {
  return time(nullptr) >= kMinimumValidEpoch;
}

const char *EnvironmentUploader::wifiPhaseName() const {
  switch (wifiPhase_) {
    case WiFiPhase::starting:
      return "starting";
    case WiFiPhase::trying:
      return "trying";
    case WiFiPhase::betweenAttempts:
      return "between-attempts";
    case WiFiPhase::connected:
      return "connected";
    case WiFiPhase::stopped:
      return "stopped";
  }
  return "unknown";
}

void EnvironmentUploader::begin(unsigned long nowMs) {
  windowStartedAt_ = nowMs;
  lastStatusAt_ = nowMs;
  if (!validConfiguration()) {
    wifiPhase_ = WiFiPhase::stopped;
    Serial.println("Uploader configuration invalid; Wi-Fi stopped until reboot");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  wifiNetworkIndex_ = 0;
  wifiAttemptIndex_ = 0;
  wifiPhase_ = WiFiPhase::starting;
  wifiPhaseStartedAt_ = nowMs;
}

void EnvironmentUploader::startWiFiAttempt(unsigned long nowMs) {
  const EnvironmentWiFiCredential &network =
      config_.networks[wifiNetworkIndex_];
  Serial.printf("Wi-Fi %u/%u, attempt %u/%u: %s\n",
                static_cast<unsigned>(wifiNetworkIndex_ + 1),
                static_cast<unsigned>(config_.networkCount),
                static_cast<unsigned>(wifiAttemptIndex_ + 1),
                static_cast<unsigned>(kWifiAttemptsPerNetwork), network.ssid);
  WiFi.begin(network.ssid, network.password);
  wifiPhase_ = WiFiPhase::trying;
  wifiPhaseStartedAt_ = nowMs;
}

void EnvironmentUploader::stopWiFiAttempts() {
  WiFi.disconnect(false, false);
  wifiPhase_ = WiFiPhase::stopped;
  Serial.println("All configured Wi-Fi networks failed");
  Serial.println("Wi-Fi attempts stopped until reboot");
}

void EnvironmentUploader::advanceWiFiAttempt(unsigned long nowMs) {
  WiFi.disconnect(false, false);
  if (wifiAttemptIndex_ + 1 < kWifiAttemptsPerNetwork) {
    ++wifiAttemptIndex_;
  } else if (wifiNetworkIndex_ + 1 < config_.networkCount) {
    ++wifiNetworkIndex_;
    wifiAttemptIndex_ = 0;
    Serial.println("Switching to next Wi-Fi");
  } else {
    stopWiFiAttempts();
    return;
  }
  wifiPhase_ = WiFiPhase::betweenAttempts;
  wifiPhaseStartedAt_ = nowMs;
}

void EnvironmentUploader::maintainWiFi(unsigned long nowMs) {
  switch (wifiPhase_) {
    case WiFiPhase::starting:
      startWiFiAttempt(nowMs);
      return;
    case WiFiPhase::trying:
      if (WiFi.status() == WL_CONNECTED) {
        wifiPhase_ = WiFiPhase::connected;
        configTime(0, 0, "time.cloudflare.com", "time.google.com",
                   "pool.ntp.org");
        Serial.print("Wi-Fi connected, IP: ");
        Serial.println(WiFi.localIP());
        Serial.println("UTC clock synchronization requested");
      } else if (nowMs - wifiPhaseStartedAt_ >= kWifiAttemptTimeoutMs) {
        Serial.println("Wi-Fi attempt timed out");
        advanceWiFiAttempt(nowMs);
      }
      return;
    case WiFiPhase::betweenAttempts:
      if (nowMs - wifiPhaseStartedAt_ >= kWifiBetweenAttemptsMs) {
        startWiFiAttempt(nowMs);
      }
      return;
    case WiFiPhase::connected:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Wi-Fi disconnected; restarting configured network list");
        WiFi.disconnect(false, false);
        wifiNetworkIndex_ = 0;
        wifiAttemptIndex_ = 0;
        wifiPhase_ = WiFiPhase::betweenAttempts;
        wifiPhaseStartedAt_ = nowMs;
      }
      return;
    case WiFiPhase::stopped:
      return;
  }
}

bool EnvironmentUploader::buildPayload(
    const EnvironmentSampleProvider &provider, char *output,
    size_t outputSize) const {
  if (!clockReady()) return false;

  char sentAt[25];
  char sourceUpdatedAt[25];
  if (!utcTimestamp(time(nullptr), sentAt, sizeof(sentAt)) ||
      !utcTimestamp(provider.sourceUpdatedAt(), sourceUpdatedAt,
                    sizeof(sourceUpdatedAt))) {
    return false;
  }

  EnvironmentMetricValue values[kMaxMetrics];
  const size_t valueCount = provider.readWindow(values, kMaxMetrics);
  char metrics[384] = {};
  size_t used = 0;
  bool first = true;
  for (size_t index = 0; index < valueCount && index < kMaxMetrics; ++index) {
    const EnvironmentMetricValue &metric = values[index];
    if (!supportedMetric(metric.key) || metric.samples == 0 ||
        !isfinite(metric.value)) {
      continue;
    }
    const int written = snprintf(metrics + used, sizeof(metrics) - used,
                                 "%s\"%s\":%.1f", first ? "" : ",",
                                 metric.key, metric.value);
    if (written < 0 || static_cast<size_t>(written) >= sizeof(metrics) - used) {
      return false;
    }
    used += static_cast<size_t>(written);
    first = false;
  }
  if (first) return false;

  const int written = snprintf(
      output, outputSize,
      "{\"schemaVersion\":2,\"sentAt\":\"%s\",\"readings\":[{\"device\":\"%s\",\"sourceUpdatedAt\":\"%s\",\"metrics\":{%s}}]}",
      sentAt, config_.deviceSlug, sourceUpdatedAt, metrics);
  return written > 0 && static_cast<size_t>(written) < outputSize;
}

void EnvironmentUploader::uploadWindow(EnvironmentSampleProvider &provider) {
  Serial.println("10-minute environment window complete");
  provider.printStatus();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Upload skipped: Wi-Fi is disconnected");
    return;
  }
  if (!clockReady()) {
    Serial.println("Upload skipped: UTC clock is not synchronized");
    return;
  }

  char payload[768];
  if (!buildPayload(provider, payload, sizeof(payload))) {
    Serial.println("Upload skipped: no timestamped sensor readings");
    return;
  }

  NetworkClientSecure client;
  client.setCACert(config_.caCertificate);
  client.setHandshakeTimeout(12);

  HTTPClient http;
  http.setConnectTimeout(kUploadTimeoutMs);
  http.setTimeout(kUploadTimeoutMs);
  if (!http.begin(client, kIngestUrl)) {
    Serial.println("Upload failed: HTTPS client initialization failed");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + config_.sourceToken);
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

void EnvironmentUploader::printStatus(
    unsigned long nowMs, const EnvironmentSampleProvider &provider) {
  if (nowMs - lastStatusAt_ < kStatusIntervalMs) return;
  lastStatusAt_ = nowMs;
  Serial.printf("Status: Wi-Fi=%s, UTC=%s, ", wifiPhaseName(),
                clockReady() ? "ready" : "waiting");
  provider.printStatus();
}

void EnvironmentUploader::loop(unsigned long nowMs,
                               EnvironmentSampleProvider &provider) {
  maintainWiFi(nowMs);
  provider.sample(nowMs);
  printStatus(nowMs, provider);
  if (nowMs - windowStartedAt_ >= config_.uploadIntervalMs) {
    uploadWindow(provider);
    provider.clearWindow();
    windowStartedAt_ = nowMs;
  }
}
