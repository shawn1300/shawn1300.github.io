# ESP32 环境站模板

这是一个自包含 Arduino 项目：公共上传核心负责 Wi‑Fi、UTC、十分钟窗口、v2 JSON 和 HTTPS；传感器适配器提供已经验证过的 SHT30 与 PMS5003 示例。复制后只需要准备公开设备配置和本地秘密配置。

它不会修改现有的 `firmware/dormitory-air-station`。不要把本目录直接覆盖到正在运行的宿舍固件。

## 硬件与库

默认接线：

| 设备 | 设备引脚 | ESP32 |
|---|---|---|
| PMS5003 | VCC | 5V |
| PMS5003 | GND | GND |
| PMS5003 | TX | GPIO16 / RX2 |
| PMS5003 | RX | GPIO17 / TX2 |
| SHT30 | VCC | 3V3 |
| SHT30 | GND | GND |
| SHT30 | SDA | GPIO21 |
| SHT30 | SCL | GPIO22 |

PMS5003 的供电是 5V，UART 通信电平是 3.3V；VCC 与 GND 不能接反。

Arduino IDE 安装：

- `ESP32 by Espressif Systems`
- `Adafruit SHT31 Library`
- `Adafruit PM25 AQI Sensor`

开发板选择 `ESP32 Dev Module`。

## 复制和配置

1. 复制整个 `station-template` 目录。
2. 将目录和 `station-template.ino` 改成同一个新项目名，这是 Arduino 的目录规则。
3. 复制 `device-config.example.h` 为 `device-config.h`：
   - `ENV_DEVICE_SLUG` 必须匹配 `config/environment.ts` 和已执行迁移中的设备 slug；
   - 按实际接线修改引脚；
   - 关闭不存在的指标；
   - 默认采样和十分钟上传周期通常无需修改。
4. 复制 `secrets.example.h` 为 `secrets.h`：
   - 按优先级填写一个或多个 2.4 GHz Wi‑Fi；
   - 填入该来源的独立令牌。

模板内的 `.gitignore` 同时忽略 `device-config.h` 和 `secrets.h`。新项目如果需要提交公开的 `device-config.h`，可以删除对应忽略行；`secrets.h` 必须始终忽略。

来源、设备和令牌准备步骤见 [`docs/environment-configuration-guide.md`](../../../../docs/environment-configuration-guide.md)。ESP32 不需要 Supabase Key。

## 运行行为

- 每个 Wi‑Fi 最多尝试三次，每次十五秒，然后切换下一项；全部失败后停止到重启。
- SHT30 默认每三十秒采样；PMS5003 预热三十秒后每两秒采样。
- 温度、湿度和 PM2.5 分别校验、分别平均，单项故障不影响其他指标。
- UTC 未同步或没有有效读数时跳过上传。
- 每十分钟向现有 Supabase 中转入口发送一份 v2 请求。
- TLS 握手最多十二秒，完整请求最多二十秒。
- 无论成功或失败，窗口都会清空；不会补传或高频重试。
- 日志不会打印密码、令牌或 Authorization 头。

## 编译与刷机

完成配置后在 Arduino IDE 点“验证”。命令行等价示例：

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 <新项目目录>
```

只有编译成功、目标 COM 端口确认无误后才能刷机。自动进入下载模式失败时，按住 BOOT、轻按 RST/EN、松开 BOOT，再重新上传。

## 验收

串口监视器使用 `115200`。依次确认：

1. SHT30 与 PMS5003 初始化；
2. Wi‑Fi connected 与 UTC ready；
3. 三类样本数持续增加；
4. 三个连续十分钟窗口出现 `Upload HTTP status: 200`；
5. 公开场所页面的数据时间和读数前进，状态为“新鲜”；
6. Supabase 中转日志不含令牌和传感器正文。

`401` 检查来源令牌，`422` 检查设备/指标映射，`503` 等待下一周期。网络错误先检查 Wi‑Fi 与 Supabase TLS，不要改成 `setInsecure()`。

## 添加其他传感器

保留 `environment-uploader.*`，替换或扩展 `sensor-adapter.*`。适配器通过 `EnvironmentMetricValue` 输出 v2 已支持的键：

- `temperatureC`
- `humidityPercent`
- `co2Ppm`
- `pm25UgM3`
- `batteryPercent`

新增数据库尚未支持的指标前，必须先单独设计并更新 schema、API、页面和教程，不能只在固件里发一个新键。

## 回滚

模板实例失败时，停止给新板供电或重新刷回该设备上一次已验证的固件。不要修改现有宿舍固件、数据库或 Home Assistant 来掩盖新模板配置错误。
