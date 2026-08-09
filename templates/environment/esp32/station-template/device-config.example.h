#pragma once

// Copy to device-config.h. These values are not secrets.
constexpr char ENV_DEVICE_SLUG[] = "replace-with-device-slug";

constexpr int ENV_PMS_RX_PIN = 16;
constexpr int ENV_PMS_TX_PIN = 17;
constexpr int ENV_SHT_SDA_PIN = 21;
constexpr int ENV_SHT_SCL_PIN = 22;

constexpr bool ENV_ENABLE_TEMPERATURE = true;
constexpr bool ENV_ENABLE_HUMIDITY = true;
constexpr bool ENV_ENABLE_PM25 = true;

constexpr unsigned long ENV_PMS_WARMUP_MS = 30UL * 1000UL;
constexpr unsigned long ENV_PMS_SAMPLE_INTERVAL_MS = 2UL * 1000UL;
constexpr unsigned long ENV_SHT_SAMPLE_INTERVAL_MS = 30UL * 1000UL;
constexpr unsigned long ENV_UPLOAD_INTERVAL_MS = 10UL * 60UL * 1000UL;
