# 宿舍 ESP32 空气站设计

更新：2026-08-09

## 目标

将一块长期 USB/5V 供电的 ESP32-WROOM-32 开发板接入现有模块化环境监测系统。设备使用 SHT30 采集温度、湿度，使用 PMS5003 采集 PM2.5；连续采样后每十分钟上传一次平均值，并在独立的“宿舍”页面公开展示。

## 硬件和接线

Arduino IDE 使用通用 `ESP32 Dev Module` 板型。现有开发板通过 CP2102 提供 USB 串口。

| 设备 | 设备引脚 | ESP32 引脚 | 说明 |
|---|---|---|---|
| PMS5003 | VCC | 5V | 传感器及风扇需要 4.5–5.5V，典型 5V |
| PMS5003 | GND | GND | 必须与 ESP32 共地 |
| PMS5003 | TX | GPIO16 / RX2 | 3.3V TTL |
| PMS5003 | RX | GPIO17 / TX2 | 3.3V TTL |
| SHT30 | VCC | 3V3 | 使用 3.3V 供电 |
| SHT30 | GND | GND | 必须与 ESP32 共地 |
| SHT30 | SDA | GPIO21 | I²C 数据 |
| SHT30 | SCL | GPIO22 | I²C 时钟 |

所有改线必须在拔掉 USB 电源后进行。PMS5003 的通信电平是 3.3V，但主电源是 5V，两者不得混淆。

## 系统架构

```text
SHT30 ─────┐
            ├→ ESP32 连续采样和十分钟平均
PMS5003 ───┘              │
                          ▼
       POST /api/environment/v2/ingest
                          │
                          ▼
       Supabase RLS 表 → 公开只读 API → /environment/dormitory
```

ESP32 不直接连接 Supabase，也不持有 Supabase publishable、secret、legacy anon 或 service-role key。设备只持有 `dormitory-esp32` 来源的独立 ingest 令牌，通过现有网站 HTTPS Route Handler 写入数据。

## 服务器元数据

新增以下配置：

- 场所：`dormitory`
  - 中文：宿舍
  - 英文：Dormitory
  - 日文：寮
  - 时区：`Australia/Perth`
  - 公开、启用，不配置室内外差值
- 来源：`dormitory-esp32`
  - 类型：`esp32`
  - 名称：Dormitory ESP32
- 设备：`dormitory-air-station`
  - 中文：宿舍空气站
  - 英文：Dormitory air station
  - 日文：寮の空気ステーション
  - 放置类型：`indoor`
  - 指标：`temperatureC`、`humidityPercent`、`pm25UgM3`
  - PM2.5 启用 `showAqi`，页面显示中国 HJ 633—2026 和美国 EPA 2026 两套参考

配置写入 `config/environment.ts`，再通过现有工具验证并生成可审阅的 Supabase 迁移。来源令牌摘要由管理员写入 `environment_sources`，令牌明文只存在于被 Git 忽略的本机 `secrets.h` 和 ESP32 闪存中，不进入受版本控制文件、迁移、数据库或终端日志。

## 固件文件

```text
firmware/dormitory-air-station/
├─ dormitory-air-station.ino
├─ secrets.example.h
└─ secrets.h
```

- `dormitory-air-station.ino`：传感器、网络、NTP、聚合和上传逻辑。
- `secrets.example.h`：可提交的占位符和填写说明。
- `secrets.h`：本机 Wi-Fi 名称、Wi-Fi 密码和来源令牌；由 `.gitignore` 明确排除。
- TLS 根证书是公开信任材料，可保存在固件源码中；禁止使用 `setInsecure()`。

## 采样和聚合

1. 启动串口、I²C、PMS5003 Serial2 和 SHT30。
2. PMS5003 上电后的前 30 秒是风扇稳定期，这段时间的 PM 数据不计入聚合。
3. 主循环持续解析 PMS5003 主动上报帧，使用厂家定义的环境口径 PM2.5 值；只有完整且校验有效的帧进入累加器。
4. SHT30 每 30 秒读取一次；只有有限值且处于服务器硬范围内的数据进入温度、湿度累加器。
5. 每个指标独立维护总和与有效样本数。每十分钟按 `总和 / 样本数` 得到平均值，并按服务端允许精度格式化。
6. 该十分钟窗口结束时的有效 UTC 时间同时作为 `sentAt` 和 `sourceUpdatedAt`。时间未同步时不上传。
7. 只发送至少有一个有效样本的指标；三个指标全部无效时跳过本周期。
8. 无论上传成功与否，每个十分钟窗口结束后都开始新的累加窗口，避免把二十分钟数据伪装成十分钟平均。失败窗口不补写。

上传正文固定为：

```json
{
  "schemaVersion": 2,
  "sentAt": "2026-08-09T00:10:00Z",
  "readings": [{
    "device": "dormitory-air-station",
    "sourceUpdatedAt": "2026-08-09T00:10:00Z",
    "metrics": {
      "temperatureC": 23.4,
      "humidityPercent": 51.2,
      "pm25UgM3": 8.1
    }
  }]
}
```

## 网络和错误处理

- ESP32 连接普通 2.4GHz Wi-Fi，凭据只来自 `secrets.h`。
- 启动后通过 NTP 同步 UTC；时间无效时继续采样但不发 HTTPS。
- 上传前进行有界 Wi-Fi 重连，HTTPS 连接和响应超时均为 8 秒量级。
- `200`：记录成功和各指标结果，不记录 Authorization 内容。
- `401`：提示检查来源令牌或来源启用状态，等到下一周期。
- `422`：提示检查设备映射、时间和值域，等到下一周期。
- `413`、`415`：视为固件正文错误，不进行高频重试。
- `5xx`、Wi-Fi、DNS、TLS 或超时：记录简短状态，等到下一周期。
- 禁止无限循环重试，禁止在串口打印 Wi-Fi 密码、来源令牌或完整 Authorization 请求头。

## 分阶段实施

1. Arduino IDE 安装 Espressif 官方 ESP32 平台并选择 `ESP32 Dev Module`、CP2102 对应端口。
2. 通过 Arduino Library Manager 安装 `Adafruit SHT31 Library`、`Adafruit PM25 AQI Sensor` 及管理器自动提示的 Adafruit 依赖库。
3. 先刷传感器诊断程序，确认 SHT30 和 PMS5003 均能稳定输出。
4. 修改并验证 `config/environment.ts`，生成、审阅和执行配置迁移。
5. 为 `dormitory-esp32` 生成来源令牌，把摘要写入数据库，把明文仅粘贴到本机 `secrets.h`。
6. 刷入正式固件，通过串口观察 Wi-Fi、NTP、样本数和 HTTP 状态。
7. 等待完整十分钟窗口，检查生产 API 和 `/environment/dormitory`。

## 验证标准

- 传感器诊断阶段能持续显示温度、湿度、PM1.0、PM2.5 和 PM10，无持续校验错误。
- 正式固件连续三个十分钟周期返回成功，数据库不存在相同指标和十分钟桶的重复记录。
- `/environment/dormitory` 显示宿舍空气站的温度、湿度、PM2.5 和两套空气质量参考，不显示差值模块。
- 临时断开 Wi-Fi 后设备无需人工重启即可在后续周期恢复。
- `git status`、提交历史和代码搜索均不包含真实 Wi-Fi 密码、来源令牌或 Supabase 私钥。

## 非目标

- 不建设博客后台配置界面。
- 不让 ESP32 直接访问 Supabase Data API。
- 不增加电池指标、CO₂ 指标或第二台宿舍设备。
- 不实现深度睡眠或 PMS5003 周期断电。

## 参考资料

- Espressif Arduino-ESP32 安装指南：<https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html>
- Espressif Arduino IDE Tools 菜单：<https://docs.espressif.com/projects/arduino-esp32/en/latest/guides/tools_menu.html>
- Plantower PMS5003 产品页：<https://plantower.com/en/products_31/>
- Plantower PMS5003 V2.2 数据手册：<https://raspberrypi-tw.s3.amazonaws.com/datasheet/PMS5003%E9%A1%86%E7%B2%92%E7%89%A9%E5%82%B3%E6%84%9F%E5%99%A8%E4%B8%AD%E6%96%87%E8%AA%AA%E6%98%8E%E6%9B%B8V2.2.pdf>
- Adafruit SHT31 Arduino 库：<https://github.com/adafruit/Adafruit_SHT31>
- Adafruit PM25 AQI Arduino 库：<https://github.com/adafruit/Adafruit_PM25AQI>
