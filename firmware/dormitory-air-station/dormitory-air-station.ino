#include <Adafruit_PM25AQI.h>
#include <Adafruit_SHT31.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <Wire.h>
#include <time.h>

struct WiFiCredential {
  const char *ssid;
  const char *password;
};

#include "secrets.h"
#include "trusted-roots.h"

namespace {
constexpr int kPmsRxPin = 16;
constexpr int kPmsTxPin = 17;
constexpr int kSdaPin = 21;
constexpr int kSclPin = 22;

constexpr char kIngestUrl[] =
    "https://gbmxqegjkmzuvhisyxou.supabase.co/functions/v1/environment-ingest-relay";
constexpr char kWebsiteProbeHost[] = "shawn1300.cc.cd";
constexpr uint16_t kHttpsPort = 443;
constexpr char kSupabaseHost[] = "gbmxqegjkmzuvhisyxou.supabase.co";
constexpr char kOsakaHost[] = "217.142.225.118";
constexpr uint16_t kOsakaPort = 80;
constexpr char kDeviceSlug[] = "dormitory-air-station";

constexpr unsigned long kPmsWarmupMs = 30UL * 1000UL;
constexpr unsigned long kPmsReadIntervalMs = 2UL * 1000UL;
constexpr unsigned long kShtReadIntervalMs = 30UL * 1000UL;
constexpr unsigned long kUploadIntervalMs = 10UL * 60UL * 1000UL;
constexpr unsigned long kWifiAttemptTimeoutMs = 15UL * 1000UL;
constexpr unsigned long kWifiBetweenAttemptsMs = 250UL;
constexpr unsigned long kStatusIntervalMs = 60UL * 1000UL;
constexpr uint32_t kProbeTimeoutMs = 8000;
constexpr uint32_t kProbeTlsHandshakeTimeoutSeconds = 8;
constexpr uint32_t kUploadTimeoutMs = 20000;
constexpr uint32_t kUploadTlsHandshakeTimeoutSeconds = 12;
constexpr time_t kMinimumValidEpoch = 1704067200;  // 2024-01-01 UTC
constexpr uint8_t kWifiAttemptsPerNetwork = 3;
constexpr size_t kWifiNetworkCount =
    sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);

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

enum class WiFiPhase {
  starting,
  trying,
  betweenAttempts,
  connected,
  stopped,
};

enum class ProbeResult {
  notRun,
  dnsFail,
  tcpFail,
  tlsFail,
  httpFail,
  tlsOk,
  httpOk,
};

bool shtReady = false;
bool pmsReady = false;
uint8_t shtAddress = 0;
unsigned long bootAt = 0;
unsigned long lastPmsReadAt = 0;
unsigned long lastShtReadAt = 0;
unsigned long windowStartedAt = 0;
unsigned long lastStatusAt = 0;
time_t lastSampleAt = 0;
WiFiPhase wifiPhase = WiFiPhase::starting;
size_t wifiNetworkIndex = 0;
uint8_t wifiAttemptIndex = 0;
unsigned long wifiPhaseStartedAt = 0;
bool connectivityProbePending = false;
bool connectivityProbeCompleted = false;

bool clockReady() {
  return time(nullptr) >= kMinimumValidEpoch;
}

bool validCredentials() {
  if (kWifiNetworkCount == 0 || strlen(SOURCE_TOKEN) < 32 ||
      strstr(SOURCE_TOKEN, "PASTE_") != nullptr) {
    return false;
  }
  for (const WiFiCredential &network : WIFI_NETWORKS) {
    if (strlen(network.ssid) == 0 ||
        strstr(network.ssid, "PASTE_") != nullptr ||
        strstr(network.password, "PASTE_") != nullptr) {
      return false;
    }
  }
  return true;
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

const char *wifiPhaseName() {
  switch (wifiPhase) {
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

void startWiFiAttempt(unsigned long nowMs) {
  const WiFiCredential &network = WIFI_NETWORKS[wifiNetworkIndex];
  Serial.printf("Wi-Fi %u/%u, attempt %u/%u: %s\n",
                static_cast<unsigned>(wifiNetworkIndex + 1),
                static_cast<unsigned>(kWifiNetworkCount),
                static_cast<unsigned>(wifiAttemptIndex + 1),
                static_cast<unsigned>(kWifiAttemptsPerNetwork), network.ssid);
  WiFi.begin(network.ssid, network.password);
  wifiPhase = WiFiPhase::trying;
  wifiPhaseStartedAt = nowMs;
}

void stopWiFiAttempts() {
  WiFi.disconnect(false, false);
  wifiPhase = WiFiPhase::stopped;
  Serial.println("All configured Wi-Fi networks failed");
  Serial.println("Wi-Fi attempts stopped until reboot");
}

void advanceWiFiAttempt(unsigned long nowMs) {
  WiFi.disconnect(false, false);
  if (wifiAttemptIndex + 1 < kWifiAttemptsPerNetwork) {
    ++wifiAttemptIndex;
  } else if (wifiNetworkIndex + 1 < kWifiNetworkCount) {
    ++wifiNetworkIndex;
    wifiAttemptIndex = 0;
    Serial.println("Switching to next Wi-Fi");
  } else {
    stopWiFiAttempts();
    return;
  }
  wifiPhase = WiFiPhase::betweenAttempts;
  wifiPhaseStartedAt = nowMs;
}

void beginWiFi(unsigned long nowMs) {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  wifiNetworkIndex = 0;
  wifiAttemptIndex = 0;
  wifiPhase = WiFiPhase::starting;
  wifiPhaseStartedAt = nowMs;
}

void maintainWiFi(unsigned long nowMs) {
  switch (wifiPhase) {
    case WiFiPhase::starting:
      startWiFiAttempt(nowMs);
      return;
    case WiFiPhase::trying:
      if (WiFi.status() == WL_CONNECTED) {
        wifiPhase = WiFiPhase::connected;
        if (!connectivityProbeCompleted) connectivityProbePending = true;
        configTime(0, 0, "time.cloudflare.com", "time.google.com",
                   "pool.ntp.org");
        Serial.print("Wi-Fi connected, IP: ");
        Serial.println(WiFi.localIP());
        Serial.println("UTC clock synchronization requested");
      } else if (nowMs - wifiPhaseStartedAt >= kWifiAttemptTimeoutMs) {
        Serial.println("Wi-Fi attempt timed out");
        advanceWiFiAttempt(nowMs);
      }
      return;
    case WiFiPhase::betweenAttempts:
      if (nowMs - wifiPhaseStartedAt >= kWifiBetweenAttemptsMs) {
        startWiFiAttempt(nowMs);
      }
      return;
    case WiFiPhase::connected:
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Wi-Fi disconnected; restarting configured network list");
        WiFi.disconnect(false, false);
        wifiNetworkIndex = 0;
        wifiAttemptIndex = 0;
        wifiPhase = WiFiPhase::betweenAttempts;
        wifiPhaseStartedAt = nowMs;
      }
      return;
    case WiFiPhase::stopped:
      return;
  }
}

ProbeResult probeHttps(const char *title, const char *host) {
  Serial.println();
  Serial.println(title);
  IPAddress address;
  if (WiFi.hostByName(host, address) != 1) {
    Serial.printf("DNS FAILED: %s\n", host);
    return ProbeResult::dnsFail;
  }
  Serial.printf("DNS OK: %s\n", address.toString().c_str());

  NetworkClient tcpClient;
  const unsigned long tcpStartedAt = millis();
  if (!tcpClient.connect(address, kHttpsPort, kProbeTimeoutMs)) {
    Serial.printf("TCP 443 FAILED after %lu ms\n", millis() - tcpStartedAt);
    return ProbeResult::tcpFail;
  }
  Serial.printf("TCP 443 OK: %lu ms\n", millis() - tcpStartedAt);
  tcpClient.stop();

  NetworkClientSecure tlsClient;
  tlsClient.setCACert(HTTPS_TRUSTED_ROOTS);
  tlsClient.setHandshakeTimeout(kProbeTlsHandshakeTimeoutSeconds);
  const unsigned long tlsStartedAt = millis();
  if (!tlsClient.connect(host, kHttpsPort)) {
    char errorText[160] = {};
    const int errorCode = tlsClient.lastError(errorText, sizeof(errorText));
    Serial.printf("TLS FAILED after %lu ms: %d (%s)\n",
                  millis() - tlsStartedAt, errorCode,
                  errorText[0] == '\0' ? "no TLS detail" : errorText);
    return ProbeResult::tlsFail;
  }
  Serial.printf("TLS OK: %lu ms\n", millis() - tlsStartedAt);
  tlsClient.stop();
  return ProbeResult::tlsOk;
}

ProbeResult probeOsakaHttp() {
  Serial.println();
  Serial.println("[3/3] Osaka HTTP");

  const IPAddress address(217, 142, 225, 118);
  NetworkClient client;
  const unsigned long tcpStartedAt = millis();
  if (!client.connect(address, kOsakaPort, kProbeTimeoutMs)) {
    Serial.printf("TCP 80 FAILED after %lu ms\n", millis() - tcpStartedAt);
    return ProbeResult::tcpFail;
  }
  Serial.printf("TCP 80 OK: %lu ms\n", millis() - tcpStartedAt);
  client.setTimeout(kProbeTimeoutMs);

  const size_t sent = client.printf(
      "HEAD / HTTP/1.1\r\n"
      "Host: %s\r\n"
      "User-Agent: dormitory-air-station-probe\r\n"
      "Connection: close\r\n\r\n",
      kOsakaHost);
  if (sent == 0) {
    Serial.println("HTTP FAILED: request could not be sent");
    client.stop();
    return ProbeResult::httpFail;
  }

  char statusLine[96] = {};
  size_t used = 0;
  bool lineComplete = false;
  const unsigned long responseStartedAt = millis();
  while (millis() - responseStartedAt < kProbeTimeoutMs &&
         used + 1 < sizeof(statusLine)) {
    while (client.available() > 0 && used + 1 < sizeof(statusLine)) {
      const int value = client.read();
      if (value < 0) break;
      if (value == '\n') {
        lineComplete = true;
        break;
      }
      if (value != '\r') statusLine[used++] = static_cast<char>(value);
    }
    if (lineComplete ||
        (used > 0 && !client.connected() && client.available() == 0)) {
      break;
    }
    delay(10);
  }
  statusLine[used] = '\0';
  client.stop();

  const char *statusSeparator = strchr(statusLine, ' ');
  const int statusCode =
      statusSeparator == nullptr ? 0 : atoi(statusSeparator + 1);
  if (strncmp(statusLine, "HTTP/", 5) != 0 || statusCode < 100 ||
      statusCode > 599) {
    Serial.println("HTTP FAILED: no valid status line");
    return ProbeResult::httpFail;
  }

  Serial.printf("HTTP OK: %d (%lu ms)\n", statusCode,
                millis() - responseStartedAt);
  return ProbeResult::httpOk;
}

const char *probeResultName(ProbeResult result) {
  switch (result) {
    case ProbeResult::notRun:
      return "NOT_RUN";
    case ProbeResult::dnsFail:
      return "DNS_FAIL";
    case ProbeResult::tcpFail:
      return "TCP_FAIL";
    case ProbeResult::tlsFail:
      return "TLS_FAIL";
    case ProbeResult::httpFail:
      return "HTTP_FAIL";
    case ProbeResult::tlsOk:
      return "TLS_OK";
    case ProbeResult::httpOk:
      return "HTTP_OK";
  }
  return "UNKNOWN";
}

void runConnectivityProbe() {
  if (!connectivityProbePending || connectivityProbeCompleted ||
      WiFi.status() != WL_CONNECTED || !clockReady()) {
    return;
  }
  connectivityProbePending = false;
  connectivityProbeCompleted = true;

  Serial.println();
  Serial.println("Connectivity probe starting");
  const ProbeResult website =
      probeHttps("[1/3] Website HTTPS", kWebsiteProbeHost);
  const ProbeResult supabase =
      probeHttps("[2/3] Supabase HTTPS", kSupabaseHost);
  const ProbeResult osaka = probeOsakaHttp();

  Serial.println();
  Serial.printf("Probe summary: Website=%s, Supabase=%s, Osaka=%s\n",
                probeResultName(website), probeResultName(supabase),
                probeResultName(osaka));
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
  client.setHandshakeTimeout(kUploadTlsHandshakeTimeoutSeconds);

  HTTPClient http;
  http.setConnectTimeout(kUploadTimeoutMs);
  http.setTimeout(kUploadTimeoutMs);
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
      wifiPhaseName(),
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

  bootAt = millis();
  windowStartedAt = bootAt;
  lastPmsReadAt = bootAt;
  lastShtReadAt = bootAt - kShtReadIntervalMs;

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

  if (validCredentials()) {
    beginWiFi(bootAt);
  } else {
    wifiPhase = WiFiPhase::stopped;
    Serial.println("Wi-Fi configuration invalid; attempts stopped until reboot");
  }
}

void loop() {
  const unsigned long nowMs = millis();
  maintainWiFi(nowMs);
  runConnectivityProbe();
  readSht30(nowMs);
  readPms5003(nowMs);
  printStatus(nowMs);

  if (nowMs - windowStartedAt >= kUploadIntervalMs) {
    uploadWindow();
    clearWindow(nowMs);
  }

  delay(10);
}
