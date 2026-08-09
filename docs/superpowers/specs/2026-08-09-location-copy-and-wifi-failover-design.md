# 场所专属文案与 ESP32 多 Wi‑Fi 切换设计

更新：2026-08-09

## 目标

修正模块化环境页面在所有场所复用“家里与外面、两只传感器”文案的问题，让“家”和“宿舍”拥有各自的中、英、日标题文案，并为未来未配置文案的场所提供安全的通用备用内容。

同时把宿舍空气站固件从单组 Wi‑Fi 凭据改为有序凭据列表。每个网络最多尝试三次，每次等待十五秒；失败后切换下一网络；全部失败后停止联网尝试，直到 ESP32 重启。

## 页面文案

### 中文

家：

- 眉题：`家 · 气息`
- 标题：`屋里是生活，屋外的天气。`
- 说明：`冷暖与潮湿从不突然到来，它们在一次次读数里慢慢显现。`

宿舍：

- 眉题：`宿舍 · 气息`
- 标题：`方寸之间，空气自有流动。`
- 说明：`看不见的温湿与微尘，在这里留下经过的痕迹。`

通用备用：

- 眉题：`环境 · 记录`
- 标题：`此处的空气，正在静静流动。`
- 说明：`温度、湿度与空气中的微粒，在这里留下每一刻的痕迹。`

### English

Home:

- Eyebrow: `HOME · BREATH`
- Title: `Life within the walls, weather beyond them.`
- Subtitle: `Warmth and damp never arrive all at once. They reveal themselves, reading by reading.`

Dormitory:

- Eyebrow: `DORMITORY · BREATH`
- Title: `In a small room, the air still finds its way.`
- Subtitle: `Unseen warmth, moisture, and fine particles leave traces of their passing here.`

Default:

- Eyebrow: `ENVIRONMENT · OBSERVATIONS`
- Title: `The air here is always in motion.`
- Subtitle: `Temperature, humidity, and particles in the air leave a quiet record of each moment.`

### 日本語

自宅：

- 眉題：`自宅 · 空気の気配`
- 見出し：`壁の内側には暮らしが、外側には天気がある。`
- 説明：`暖かさも湿り気も、突然訪れるものではありません。ひとつひとつの記録の中で、ゆっくり姿を見せます。`

寮：

- 眉題：`寮 · 空気の気配`
- 見出し：`小さな空間にも、空気の流れがある。`
- 説明：`目には見えない温度や湿度、微粒子が、ここに通り過ぎた跡を残します。`

共通の予備文：

- 眉題：`環境 · 記録`
- 見出し：`この場所の空気は、静かに移ろう。`
- 説明：`温度や湿度、空気中の微粒子が、その時々の気配を残します。`

## 页面实现

`Environment` 翻译空间新增 `copy.home`、`copy.dormitory` 和 `copy.default` 三组 `eyebrow`、`title`、`subtitle`。

环境仪表板根据当前场所 slug 选择文案：

- `home` 使用 `copy.home`。
- `dormitory` 使用 `copy.dormitory`。
- 其他 slug 使用 `copy.default`。

场所下拉框仍显示 API 返回的本地化场所名称。无刷新切换场所成功后，当前数据、历史曲线和标题文案在同一次状态更新中切换。失败请求不把标题切换到并未成功加载的场所。

现有顶层 `eyebrow`、`title`、`subtitle` 翻译键删除，避免以后再次误用一套“家”的文案。页面结构和视觉样式不变；本次不改环境页元数据、场所选择器、状态标签或图表。

## Wi‑Fi 私密配置

本机且被 Git 忽略的 `secrets.h` 改为：

```cpp
constexpr WiFiCredential WIFI_NETWORKS[] = {
  {"preferred-ssid", "preferred-password"},
  {"backup-ssid", "backup-password"},
};

constexpr char SOURCE_TOKEN[] = "source-token";
```

可提交的 `secrets.example.h` 使用相同结构和占位值。凭据数量由数组长度决定，不设置人为上限；至少需要一项。SSID 不得为空，密码允许为空以兼容开放网络。真实密码和来源令牌不得出现在版本控制、串口日志或教程示例中；SSID 只允许出现在本机 `secrets.h` 和不包含其他凭据的连接状态日志中。

## Wi‑Fi 状态机

连接状态分为：

- `trying`：正在等待当前连接尝试。
- `connected`：已经联网，可同步 UTC 并在窗口结束时上传。
- `between_attempts`：一次超时后的短暂断开整理阶段。
- `stopped`：所有配置网络都失败，本次启动不再尝试联网。

启动流程：

1. 禁用 ESP32 SDK 的无限自动重连，由固件状态机独占连接决策。
2. 从 `WIFI_NETWORKS[0]` 的第一次尝试开始。
3. 调用 `WiFi.begin` 后等待最多十五秒，同时主循环继续执行 SHT30、PMS5003 采样和状态输出。
4. 十五秒内进入 `WL_CONNECTED` 即成功；记录当前网络序号、请求 NTP 同步并进入 `connected`。
5. 超时后调用断开，短暂整理连接状态，再尝试同一网络；每个网络总计三次。
6. 当前网络第三次失败后移动到下一项并从第一次开始。
7. 最后一项第三次失败后进入 `stopped`。

运行期间如果已连接网络断开，状态机清空本轮网络序号和次数，从第一项重新执行上述完整流程。如果所有网络再次失败，同样进入 `stopped`。设备不会因为联网停止而停止传感器采样；十分钟窗口照常结束并清空，但因无连接而跳过上传，不补传旧窗口。

只有硬件复位、重新上电或用户主动重启 ESP32 才能离开 `stopped` 并重新开始连接。固件不会通过定时器自动恢复尝试。

## 串口信息与安全

允许输出当前 SSID、网络序号、总网络数、尝试次数、成功、超时、切换和最终停止状态，例如：

```text
Wi-Fi 1/2, attempt 1/3: Dormitory
Wi-Fi attempt timed out
Switching to next Wi-Fi
Wi-Fi 2/2, attempt 1/3: Phone hotspot
Wi-Fi connected
```

全部失败时固定输出：

```text
All configured Wi-Fi networks failed
Wi-Fi attempts stopped until reboot
```

严禁输出密码、来源令牌、Authorization 请求头或 `secrets.h` 全文。

## 错误处理

- 缺少 Wi‑Fi 项、空 SSID、未填写来源令牌：启动时输出固定配置错误并停止联网；传感器仍可初始化和输出诊断状态。
- 当前网络连接超时：只推进尝试次数，不重启设备，不清空正在进行的传感器平均窗口。
- 联网断开：取消本次 HTTPS 能力并从第一项重新开始连接策略。
- `stopped`：每分钟状态行显示联网已停止，避免看起来像程序卡死。
- 联网失败窗口：保持既有“不补传、不把更长窗口伪装为十分钟平均”的规则。

## 项目文件

预计修改：

- `messages/zh-CN.json`
- `messages/en.json`
- `messages/ja.json`
- `app/[locale]/(environment)/environment/environment-dashboard.tsx`
- 环境页面相关测试
- `firmware/dormitory-air-station/dormitory-air-station.ino`
- `firmware/dormitory-air-station/secrets.example.h`
- 本机忽略的 `firmware/dormitory-air-station/secrets.h`
- `firmware/dormitory-air-station/README.md`

## 验证标准

页面：

- 直接打开 `/environment` 显示“家”的专属文案。
- 直接打开 `/environment/dormitory` 显示“宿舍”的专属文案。
- 下拉切换场所后，文案与成功加载的数据一起切换且不刷新页面。
- 未配置文案的合法场所使用通用备用文案。
- 中、英、日翻译完整，现有测试、类型检查和生产构建通过。

固件：

- 使用当前 `ESP32 Dev Module`、Espressif ESP32 3.3.10-cn、Adafruit SHT31 与 Adafruit PM25 AQI Sensor 编译通过。
- 第一项无效、第二项有效时，第一项完成三次十五秒超时后切换并连接第二项。
- 所有项无效时，最后一次超时后进入 `stopped`，观察期间不再调用连接。
- 联网尝试期间传感器样本数持续增加。
- 重启后从第一项第一次尝试重新开始。
- `git status`、提交内容和代码搜索不包含真实凭据或令牌。

## 非目标

- 不增加网页配网、ESP32 热点或 Captive Portal。
- 不把 Wi‑Fi 凭据放入 Supabase、Vercel 或博客后台。
- 不自动循环所有网络，不在 `stopped` 后定时恢复。
- 不改变十分钟采样、平均、上传和失败窗口丢弃规则。
- 不改变场所卡片、AQI、曲线、差值或新鲜度判定。
