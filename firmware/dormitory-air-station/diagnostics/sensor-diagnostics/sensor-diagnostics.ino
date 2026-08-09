#include <Adafruit_PM25AQI.h>
#include <Adafruit_SHT31.h>
#include <Wire.h>

namespace {
constexpr int kPmsRxPin = 16;
constexpr int kPmsTxPin = 17;
constexpr int kSdaPin = 21;
constexpr int kSclPin = 22;
constexpr unsigned long kPrintIntervalMs = 2000;

HardwareSerial pmsSerial(2);
Adafruit_PM25AQI pms5003;
Adafruit_SHT31 sht30;

bool shtReady = false;
bool pmsReady = false;
uint8_t shtAddress = 0;
unsigned long lastPrintAt = 0;

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

void printSht30() {
  if (!shtReady) {
    Serial.println("SHT30: not detected (expected I2C address 0x44 or 0x45)");
    return;
  }

  const float temperatureC = sht30.readTemperature();
  const float humidityPercent = sht30.readHumidity();
  if (!isfinite(temperatureC) || !isfinite(humidityPercent)) {
    Serial.println("SHT30: read failed");
    return;
  }

  Serial.printf(
    "SHT30 [0x%02X]: temperature %.2f C, humidity %.2f %%\n",
    shtAddress,
    temperatureC,
    humidityPercent
  );
}

void printPms5003() {
  if (!pmsReady) {
    Serial.println("PMS5003: UART initialization failed");
    return;
  }

  PM25_AQI_Data data;
  if (!pms5003.read(&data)) {
    Serial.println("PMS5003: waiting for a valid frame");
    return;
  }

  Serial.printf(
    "PMS5003: PM1.0 %u, PM2.5 %u, PM10 %u ug/m3 (environmental)\n",
    data.pm10_env,
    data.pm25_env,
    data.pm100_env
  );
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("Dormitory air station sensor diagnostics");
  Serial.println("PMS5003 power must be 5V; UART logic remains 3.3V.");
  Serial.println("Allow the PMS5003 fan at least 30 seconds to stabilize.");

  Wire.begin(kSdaPin, kSclPin);
  shtReady = beginSht30();
  if (shtReady) {
    Serial.printf("SHT30 detected at I2C address 0x%02X\n", shtAddress);
  } else {
    Serial.println("SHT30 was not detected at 0x44 or 0x45");
  }

  pmsSerial.begin(9600, SERIAL_8N1, kPmsRxPin, kPmsTxPin);
  pmsReady = pms5003.begin_UART(&pmsSerial);
  Serial.println(pmsReady ? "PMS5003 UART ready" : "PMS5003 UART initialization failed");
}

void loop() {
  const unsigned long now = millis();
  if (now - lastPrintAt < kPrintIntervalMs) {
    delay(10);
    return;
  }

  lastPrintAt = now;
  Serial.println("---");
  printSht30();
  printPms5003();
}
