#include "environment-uploader.h"
#include "sensor-adapter.h"

#include "device-config.h"
#include "secrets.h"
#include "trusted-roots.h"

namespace {
constexpr size_t kNetworkCount =
    sizeof(ENV_WIFI_NETWORKS) / sizeof(ENV_WIFI_NETWORKS[0]);

EnvironmentUploader uploader({
    ENV_DEVICE_SLUG,
    ENV_WIFI_NETWORKS,
    kNetworkCount,
    ENV_SOURCE_TOKEN,
    HTTPS_TRUSTED_ROOTS,
    ENV_UPLOAD_INTERVAL_MS,
});

Sht30Pms5003Adapter sensors({
    ENV_PMS_RX_PIN,
    ENV_PMS_TX_PIN,
    ENV_SHT_SDA_PIN,
    ENV_SHT_SCL_PIN,
    ENV_ENABLE_TEMPERATURE,
    ENV_ENABLE_HUMIDITY,
    ENV_ENABLE_PM25,
    ENV_PMS_WARMUP_MS,
    ENV_PMS_SAMPLE_INTERVAL_MS,
    ENV_SHT_SAMPLE_INTERVAL_MS,
});
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("Reusable environment station template");

  const unsigned long nowMs = millis();
  sensors.begin(nowMs);
  uploader.begin(nowMs);
}

void loop() {
  uploader.loop(millis(), sensors);
  delay(10);
}
