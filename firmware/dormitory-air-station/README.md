# 宿舍空气站 ESP32 固件

这套固件用于 ESP32-WROOM-32、PMS5003 和 SHT30。设备持续采样并分别计算温度、湿度、PM2.5 的平均值，每 10 分钟通过 HTTPS 上传一次。

## 固定接线

| 设备 | 设备引脚 | ESP32 |
| --- | --- | --- |
| PMS5003 | VCC | 5V |
| PMS5003 | GND | GND |
| PMS5003 | TX | GPIO16 / RX2 |
| PMS5003 | RX | GPIO17 / TX2 |
| SHT30 | VCC | 3V3 |
| SHT30 | GND | GND |
| SHT30 | SDA | GPIO21 |
| SHT30 | SCL | GPIO22 |

PMS5003 的电源必须是 5V，UART 通信电平是 3.3V。不要再次把 VCC 和 GND 接反。

## Arduino IDE 设置

1. 开发板选择 `ESP32 Dev Module`。
2. 端口选择实际出现的 CP2102 串口，例如 `COM4`。
3. 安装 `Adafruit SHT31 Library` 和 `Adafruit PM25 AQI Sensor`。
4. 打开 `dormitory-air-station.ino`。

## 私密配置

同目录下的 `secrets.h` 只保存在本机，Git 已忽略它。Wi-Fi 使用有序列表：

- `WIFI_NETWORKS`：一项或多项 2.4 GHz Wi-Fi 名称与密码，首项优先。
- `SOURCE_TOKEN`：`dormitory-esp32` 的独立上传令牌。

```cpp
constexpr WiFiCredential WIFI_NETWORKS[] = {
    {"首选网络", "首选网络密码"},
    {"备用网络", "备用网络密码"},
};
```

每个网络最多连接三次，每次等待十五秒。三次失败后切换到下一项；所有网络都失败后停止联网尝试，只有重启 ESP32 才会重新开始。已经连接的网络后来断开时，也会从列表第一项重新尝试。联网尝试和停止状态都不影响传感器采样。

不要把 Wi-Fi 密码或令牌发到聊天、截图或提交到 Git。如果 `secrets.h` 丢失，可以复制 `secrets.example.h` 并改名后重新填写。

## 首次刷机与验证

1. 上传时如果一直停在 `Connecting...`，按住 BOOT，轻按一下 RST，看到开始写入后松开 BOOT。
2. 打开串口监视器，波特率设为 `115200`。
3. 确认出现 SHT30、PMS5003 和 Wi-Fi 就绪信息。
4. UTC 时间同步后会自动执行一次三线路自检：
   - 当前网站：DNS、TCP 443 和 TLS；
   - Supabase：DNS、TCP 443 和 TLS；
   - 大阪服务器：TCP 80 和不含凭据的 `HEAD /` 请求。
5. 看到 `Probe summary` 后，根据 `DNS_FAIL`、`TCP_FAIL`、`TLS_FAIL`、`HTTP_FAIL` 或 `OK` 判断每条线路在哪一层失败。大阪的 `HTTP_OK` 只表示线路可达，不代表已经具备正式 HTTPS 上传接口。
6. PMS5003 开机前 30 秒的数据会被丢弃，这是正常预热。
7. 每分钟会打印一次状态；约 10 分钟后应出现 `Upload HTTP status: 200`。
8. 浏览 `/environment/dormitory`，确认温度、湿度和 PM2.5 出现。

程序不会在日志中打印 Wi-Fi 密码或上传令牌。某个传感器临时失败时，其他有效指标仍会独立上传。断网窗口不会补传，恢复联网后会从下一个 10 分钟窗口继续。

## 只测试传感器

需要排除 Wi-Fi 和服务器因素时，使用：

`diagnostics/sensor-diagnostics/sensor-diagnostics.ino`

该程序只读取传感器，不连接网络、不上传数据。
