# 独立环境监测与数据接口设计

日期：2026-08-04  
状态：产品与页面设计继续有效；旧云认证和 GitHub Actions 采集路线已被替换

> 2026-08-04 修订：小米官方 Xiaomi Home `v0.4.7` 已在大阪服务器的 Home Assistant `2026.7.4` 中通过真实设备验证，两只 `miaomiaoce.sensor_ht.t2` 均能读取温度、湿度和电量。本文第 4.1–4.7 节和第 7 节记录的 `ssecurity`、浏览器捕获及 GitHub Actions 云采集路线不再实施，由 [Home Assistant 环境数据导出设计](./2026-08-04-home-assistant-environment-export-design.md) 取代。数据库、独立页面、主题、公开 API、30 天历史和 VRChat 契约继续有效。

## 1. 背景与目标

用户已有两只小米米家蓝牙温湿度计 2，型号均为 `LYWSD03MMC`，分别放置在家中的室内和室外。设备绑定在中国大陆区米家账号下，并且家中已有米家蓝牙网关；关闭手机蓝牙后，米家 App 仍能看到更新，说明网关已将读数上传到小米云。

本功能要完成以下目标：

1. 每 10 分钟左右从中国大陆区小米云读取两只设备的温度、湿度和电量。
2. 将读数写入现有 Supabase，但与旧 ESP32 的 `sensor_readings` 完全分开。
3. 在 `https://shawn1300.cc.cd/environment` 提供一个独立环境页面。
4. 页面不出现在博客导航或 sitemap 中，并声明 `noindex, nofollow`；知道 URL 的访客仍可直接访问。
5. 页面沿用博客的暖白默认主题与深色可切换主题，但不加载博客 Header、Footer 或音乐播放器。
6. 提供稳定的只读 JSON 接口，为未来 VRChat OSC 聊天框播报复用同一份数据。
7. 仅保留最近 30 天的历史读数。

## 2. 非目标

本轮不包含：

- 不修改两只温湿度计的固件。
- 不采购或部署 ESP32、树莓派或家中 Home Assistant 主机；已使用现有大阪云服务器运行最小化 Home Assistant Container。
- 不复用或迁移旧 ESP32 环境检测数据。
- 不在本轮交付 VRChat Windows 桥接程序；只保证它未来所需的接口稳定可用。
- 不通过隐藏 URL 提供真正的访问控制。页面是公开的，只是不主动收录和导航。
- 不提供超过 30 天的长期归档、月报或年报。

## 3. 已验证的产品事实

- 硬件型号：`LYWSD03MMC`。
- MIoT 型号：`miaomiaoce.sensor_ht.t2`。
- MIoT 规范状态：released。
- 可读属性：
  - 温度：`siid=2, piid=1`，单位摄氏度，规范范围 `-30..100`，步长 `0.1`。
  - 相对湿度：`siid=2, piid=2`，单位百分比，规范范围 `0..100`，步长 `0.1`。
  - 电量：`siid=3, piid=1`，单位百分比，规范范围 `0..100`。
- 小米不同区域的云数据相互隔离；本项目固定使用中国大陆区，不迁移账号区域。
- 小米官方 Home Assistant 集成的真实账号云读取验证已经通过；两只目标设备均提供温度、湿度和电量实体。
- `LYWSD03MMC` 不是防雨型户外探头。室外设备需要通风、遮雨并避开阳光直射；这属于部署注意事项，不由软件保证。

## 4. 关键设计决策

> 历史说明：第 4.1–4.7 节是已经失败并停止的旧认证探索，不再作为实施依据。当前采集决策见 [Home Assistant 环境数据导出设计](./2026-08-04-home-assistant-environment-export-design.md)。

### 4.1 采集路线

采用“现有蓝牙网关 → 中国大陆小米云 → GitHub Actions → Supabase”。

原因：

- 不增加家中硬件。
- 5–10 分钟更新频率满足需求。
- 当前项目已经托管在 GitHub、Vercel 和 Supabase，新增运维面最小。
- 数据落入 Supabase 后，网页和 VRChat 不需要分别登录米家。

主要风险是小米云并非面向任意个人网站提供的稳定公共数据 API，登录或私有接口未来可能变化。ESP32 本地蓝牙采集保留为失败后的替代路线，但不在本轮实现。

### 4.2 可行性门

实现顺序必须从一个最小云读取探针开始：

1. 用户在自己的 GitHub Secrets 或本地环境中配置凭据，凭据不通过聊天发送。
2. 探针登录中国大陆区并列出账号可见设备。
3. 确认两台目标设备的 model 均为 `miaomiaoce.sensor_ht.t2`。
4. 分别读取温度、湿度和电量，并输出经过脱敏的成功摘要。
5. 检查云响应是否还提供源更新时间或在线状态，明确后续“新鲜度”的能力边界。
6. 只有六个核心属性全部得到合理值，才进入数据库和页面开发。

若共享给专用小米账号的家庭无法读取 BLE 属性，可以改用主账号的加密会话信息。若两种方式都失败，本轮停止在可行性报告，不构建假数据页面，并建议转向 ESP32 方案。

### 4.3 凭据策略

- 优先创建专用小米账号，并将“家”共享给该账号，降低主账号暴露面。
- 小米账号、密码、会话令牌、Supabase Service Role Key 只能保存在 GitHub Secrets 或服务端环境变量中。
- 不把任何小米凭据写入仓库、浏览器 bundle、公开 API 响应或 Supabase 可公开读取的表。
- 采集器的云客户端封装在独立适配器后；如果所选客户端失效，只替换适配器，不改变数据库和页面。

### 4.4 本地二次验证引导

中国大陆区小米账号可能在旧式云登录时要求短信、邮箱或设备验证。该验证只发生在本地 bootstrap 中，定时采集仍只使用成功登录后生成的会话材料，不保存或重复使用账号密码。

bootstrap 必须保持一次连续的登录会话：

1. 先执行普通账号密码登录。
2. 若小米响应包含 `notificationUrl`，仅接受 `https` 且主机名严格为 `account.xiaomi.com` 的地址；其他地址立即拒绝。
3. 在默认浏览器中打开完整验证地址，但控制台只显示不含查询参数的官方域名与路径。若无法自动打开，不把完整挑战地址写入日志或仓库，而是明确报告需要手动处理。
4. 用户在小米官方页面获取短信或邮箱验证码，再将一次性验证码输入仍在运行的 bootstrap。验证码输入不回显、不落盘。
5. bootstrap 在同一 HTTP 会话中提交验证码并继续登录；成功后才生成 `user_id`、`service_token` 和 `ssecurity`。
6. 密码错误、验证码错误、验证超时、图片验证码和网络失败必须使用不同的脱敏错误类别；不得打印原始登录响应、Cookie、完整验证地址、密码、验证码或令牌。

若密码步骤返回 `captchaUrl`，bootstrap 可以在同一次运行中处理一次图片验证码：

- 图片地址必须经过与验证地址相同的严格检查，只接受 `https://account.xiaomi.com`。
- 响应必须是非空图片且不超过 1 MiB；不接受 HTML、JSON 或其他响应类型。
- 图片只写入操作系统临时目录，使用随机文件名，并由系统默认查看器打开；不写入项目目录。
- 图片字符使用隐藏输入。无论用户输入、打开查看器或后续网络请求成功与否，临时文件都必须立即尝试删除；若 Windows 查看器短暂占用文件，则注册进程退出清理并明确报告清理失败。
- 每次 bootstrap 最多提交一次图片验证码。若小米再次要求图片验证码，视为验证码错误或已过期并安全停止，避免循环尝试触发账号风控。
- 图片验证码通过后，如果小米继续返回 `notificationUrl`，沿用同一个 HTTP 会话进入短信或邮箱验证。

### 4.5 浏览器官方响应导入

若小米验证码接口限流，或验证完成后程序仍无法取得 `ssecurity`，bootstrap 提供一个不读取浏览器 Cookie 数据库的本地替代入口：

```powershell
.\.venv\Scripts\python.exe -m collector.environment_collector.browser_bootstrap
```

用户在已经登录并完成验证的同一浏览器中打开小米官方 `xiaomiio` service login 地址，将页面显示的一行 JSON 复制到程序的隐藏输入。原始响应可能带有 `&&&START&&&` 防劫持前缀，也可能被浏览器显示为直接从 `{` 开始的 JSON 对象；程序兼容两者。程序完成以下步骤：

1. 输入最大为 64 KiB；不回显、不写入命令历史、文件或日志。
2. 若存在则去掉固定前缀，并要求剩余内容为 JSON 对象；第一阶段只读取 `code`、`userId` 和 `passToken`。`passToken` 只允许存在于当前 Python 进程内，不写入客户端对象、文件、日志或错误信息。
3. 要求 `code` 为 `0`，且 `userId`、`passToken` 均存在；缺少任一字段时安全停止，不再尝试消费响应中的旧 `location`。
4. 程序创建新的本地 HTTP 会话，仅在一次发往 `https://account.xiaomi.com/pass/serviceLogin` 的请求上附带 `userId` 与 `passToken`。这两个值不得进入会话的持久 Cookie jar，因而不会被随后发往 `sts.api.io.mi.com` 或其他域名。
5. 刷新请求固定使用 `sid=xiaomiio&_json=true`。其响应必须为认证成功的 JSON，且返回的 `userId` 必须与导入值完全一致；否则视为会话过期或身份不一致并立即停止。
6. 第二阶段只接受刷新响应中的 `ssecurity` 和全新的 `location`。`location` 必须使用 HTTPS，且主机名属于已批准的小米登录完成域名；拒绝用户信息、非默认端口、伪造子域名和非小米地址。刷新响应若返回新的 `passToken`，程序也不得保存或打印。
7. 程序仅访问一次全新的 `location`，从响应 Cookie 取得 `serviceToken`。无论成功或失败，都立即释放原始 JSON、`passToken`、刷新响应和一次性地址的程序引用；Python 无法保证不可变字符串在内存中原地清零，因此安全承诺是“不持久化、不输出、最短生命周期”，而不是不可验证的内存擦除。
8. 取得 `userId`、`ssecurity`、`serviceToken` 后，显式确认客户端的 `pass_token` 属性为空，再复用普通 bootstrap 的设备列举、室内外选择、真实属性读取和 `.collector-credentials.json` 写入流程。最终凭证文件仍只包含长期采集所需的 `user_id`、`service_token` 和 `ssecurity`。
9. 成功或失败后均提醒用户清空系统剪贴板；程序不自动读取或覆盖整个剪贴板，也不访问 Chrome/Edge Cookie 数据库。

错误信息只能说明输入过长、JSON 无法解析、字段缺失、状态未认证、浏览器会话已过期、账号身份不一致、地址不可信或未返回 `serviceToken`，不得包含原始响应或任何字段值。自动化测试必须覆盖 `passToken` 缺失、仅随定向刷新请求发送、刷新身份不一致、恶意新 `location`、未返回 `serviceToken`、所有错误路径的秘密脱敏，以及成功后客户端不保留 `passToken`。

### 4.6 临时 Edge 登录捕获

若普通 bootstrap 和浏览器官方响应导入都无法取得 `ssecurity`，提供最终的本地交互式入口：

```powershell
.\.venv\Scripts\python.exe -m collector.environment_collector.edge_bootstrap
```

该入口使用固定版本的 Playwright 驱动 Windows 已安装的 Microsoft Edge，不执行 `playwright install`，也不下载或捆绑另一份 Chromium。它必须遵守以下边界：

1. 启动一个可见、非持久化的临时浏览器上下文，不指定或读取用户日常 Edge/Chrome 配置目录，不加载现有扩展，不导出 storage state。
2. 初始页面只能是 `https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio`，由小米官方重定向到其可交互登录页；不能附加 `_json=true`，否则只会显示原始 JSON。账号、密码、图片验证码和短信验证码均由用户直接输入小米官方网页；程序不在终端索取这些值，不读取表单字段，也不监听或保存请求体。
3. 程序只检查响应地址严格匹配 `https://account.xiaomi.com/pass/serviceLoginAuth2` 或 `https://account.xiaomi.com/pass/serviceLogin` 的响应；不使用后缀匹配，不接受子域名、用户信息、非 443 端口、HTTP 或其他路径。
4. 候选响应体最大为 64 KiB，只接受可去除可选 `&&&START&&&` 前缀后解析为 JSON 对象、且 `code=0` 的结果。只提取 `userId`、`ssecurity` 和 `location`；忽略并不保存 `passToken`、密码、验证码及其他字段。
5. `location` 继续复用严格的小米 HTTPS 登录完成地址校验。刷新响应的 `userId`、STS Cookie 中的 `userId` 若同时存在，必须完全一致。
6. 若同一临时浏览器上下文已经因页面跳转取得 `serviceToken`，程序不再次访问 `location`；否则仅在该上下文中消费一次经过校验的新 `location`。随后只从适用于 `https://sts.api.io.mi.com` 或 `https://api.io.mi.com` 的 Cookie 中读取 `serviceToken` 和可选 `userId`，不导出完整 Cookie 集合。
7. 取得 `userId`、`ssecurity`、`serviceToken` 后，立即关闭页面、上下文、浏览器和 Playwright，再把三项材料注入不含密码与 `passToken` 的 `MiCloud` 客户端，复用普通 bootstrap 的设备列举、真实属性读取、室内外选择和凭证写入流程。
8. 登录窗口最长等待 10 分钟。用户关闭窗口、按 Ctrl+C、超时、Edge 缺失、Playwright 缺失、响应不完整、身份不一致或无法取得 `serviceToken` 时均安全停止；不得自动重新登录、重复发送验证码或循环消费登录地址。
9. 所有退出路径都必须尝试关闭非持久化上下文和浏览器。程序不承诺浏览器进程从不使用操作系统临时缓存，但不得主动创建持久用户数据目录；由 Playwright 管理并清理其临时运行数据。
10. 错误和终端提示不得包含响应正文、Cookie 值、完整 `location`、带查询参数的 URL、账号或完整设备 DID。错误只报告安全分类及用户下一步。

实现拆分为三个可独立测试的单元：严格响应筛选与材料解析器、Playwright/Edge 会话协调器、复用现有 `run_authenticated_bootstrap` 的命令入口。协调器通过小接口接收浏览器事件，使单元测试能使用假浏览器覆盖成功、超时、用户关闭、恶意来源、过大或畸形响应、身份冲突、已有 Cookie、不重复消费 `location`、清理和秘密脱敏；自动化测试不得打开真实 Edge 或访问小米账号。

### 4.7 全账号源临时诊断模式

若临时 Edge 已完成验证并在页面显示 `ok`，但严格捕获仍未继续，提供独立的故障诊断入口：

```powershell
.\.venv\Scripts\python.exe -m collector.environment_collector.edge_diagnostic
```

该命令不替换或放宽正式 `edge_bootstrap` 的响应白名单。它只用于确定小米当前网页流程把最终会话材料放在哪个官方响应中，并遵守以下限制：

1. 浏览器生命周期、非持久化上下文、10 分钟总期限、官方初始页面、Cookie 限制和清理行为与 4.6 完全相同。
2. 只观察精确 HTTPS 源 `https://account.xiaomi.com` 的响应；拒绝 HTTP、非 443 端口、用户信息、伪造子域名和其他主机。仍不读取表单字段、请求体、现有浏览器配置或 storage state。
3. 只读取媒体类型为 JSON 的响应体。声明的 `Content-Length` 超过 64 KiB 时不读取；未声明长度时最多读取一次，若实际内容超过 64 KiB 则立即丢弃且不解析。
4. 终端每条诊断只显示响应序号、经过脱敏的 URL 路径、HTTP 状态码，以及固定布尔标记：外层或单层 `data` 对象是否包含 `code=0`、`userId`、`ssecurity`、`location`、`passToken`。不显示查询参数、任意其他键名、字段值、响应正文、Cookie 值或账号。
5. 路径只在由 ASCII 字母、数字、点、下划线、连字符和斜杠组成且不超过 160 字符时显示；包含编码字符、其他字符或超长内容时统一显示 `[redacted-path]`。连续四位及以上数字在显示前替换为 `[number]`。
6. 诊断解析器只尝试外层对象及其单层 `data` 对象，不递归搜索，不保留其他字段。只有 `code=0`，且同一层同时存在合法 `userId`、`ssecurity` 和通过严格校验的 `location` 时，才形成候选会话。
7. 若候选会话与受限 STS/API Cookie 中的 `serviceToken` 和可选 `userId` 一致，诊断命令立即关闭 Edge，并直接复用普通真实设备 bootstrap，避免浪费本次验证码；最终凭证文件内容不变。
8. 若已经检测到 `serviceToken`，但 5 秒后仍没有完整候选会话，立即关闭 Edge 并输出“网页登录完成但未暴露完整云会话”的脱敏结论及已观察的安全摘要，不继续等待 10 分钟。
9. 诊断摘要只存在于终端；不写文件、日志、剪贴板、测试快照或浏览器 storage state。无论成功、失败、超时、关窗或 Ctrl+C，都不得输出或持久化响应正文与秘密字段。

公开小米前端代码显示密码提交使用 `/pass/serviceLoginAuth2`，而短信验证码完成使用 `/pass/serviceLoginTicketAuth`。诊断模式仍需通过真实的脱敏观察确认当前账号流程；确认后应把实际接口加入 4.6 的精确白名单并优先恢复正式入口，而不是长期依赖全账号源监听。

测试必须使用假响应和假浏览器，覆盖非小米源、非 HTTPS、恶意主机、非 JSON、声明与实际过大正文、顶层和单层 `data`、不递归、路径与数字脱敏、固定字段标记、完整材料直通、只有 `serviceToken` 的 5 秒快速失败、所有终端输出秘密扫描，以及每条退出路径的浏览器清理。测试不得访问真实小米账号。

## 5. 系统架构

```text
场所：家
├── 监测点：室内 · LYWSD03MMC
└── 监测点：室外 · LYWSD03MMC
        ↓ BLE
米家蓝牙网关
        ↓
中国大陆小米云
        ↓ 每 10 分钟
GitHub Actions 采集器
        ↓ service role
Supabase
├── environment_locations
├── environment_sensors
└── environment_readings
        ↓
Next.js 服务端只读层
├── /environment
├── /api/environment/latest
└── /api/environment/history
        ↓（未来）
VRChat 本地 OSC 桥接程序
```

## 6. 数据模型

### 6.1 `environment_locations`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `slug` | text | 稳定标识，当前为 `home`，唯一 |
| `display_names` | jsonb | `zh-CN`、`en`、`ja` 的显示名称 |
| `timezone` | text | 当前为 `Australia/Perth` |
| `sort_order` | integer | 场所切换顺序 |
| `enabled` | boolean | 是否对外展示 |
| `created_at` | timestamptz | 创建时间 |

### 6.2 `environment_sensors`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 主键 |
| `location_id` | uuid | 所属场所 |
| `key` | text | 当前为 `indoor` 或 `outdoor` |
| `display_names` | jsonb | 多语言显示名称 |
| `source_model` | text | `miaomiaoce.sensor_ht.t2` |
| `source_device_id` | text | 小米设备标识，仅服务端可读 |
| `sort_order` | integer | 二级监测点顺序 |
| `enabled` | boolean | 是否采集和展示 |
| `created_at` | timestamptz | 创建时间 |

同一场所下 `(location_id, key)` 唯一，`source_device_id` 唯一。

### 6.3 `environment_readings`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigint identity | 主键 |
| `sensor_id` | uuid | 传感器 |
| `temperature` | numeric | 摄氏温度 |
| `humidity` | numeric | 相对湿度百分比 |
| `battery` | smallint nullable | 电量百分比；云端缺失时允许为空 |
| `source_observed_at` | timestamptz nullable | 小米云若提供源更新时间则保存 |
| `source_online` | boolean nullable | 小米云若提供设备在线状态则保存 |
| `collected_at` | timestamptz | 采集器成功读取时间 |
| `idempotency_key` | text | 一次采集运行的稳定键 |

约束与索引：

- `(sensor_id, idempotency_key)` 唯一，保证 GitHub Actions 重试不会重复入库。
- 按 `(sensor_id, collected_at desc)` 建索引。
- 温度限制在 MIoT 规范范围内，湿度和电量限制在 `0..100`。
- 一只设备失败时，另一只设备仍可独立写入。

### 6.4 数据时间语义

如果小米云返回源更新时间，页面显示该时间；否则明确使用 `collected_at`，文案为“云端读取于”，不把轮询时间伪装成传感器实际广播时间。新鲜度优先使用源更新时间和在线状态计算。

若云接口既不提供源更新时间，也不提供可靠在线状态，页面只能判断“小米云读取链路是否新鲜”，不能证明传感器刚刚广播过数据。此时 UI 必须使用“云端读取于”而不是“传感器更新于”，并在规格实现记录中保留这一限制。

### 6.5 30 天保留策略

- 定时采集工作流每天额外运行一次清理任务。
- 删除 `collected_at < now() - interval '30 days'` 的读数。
- 清理只作用于 `environment_readings`，不删除场所和传感器配置。
- API 最大只允许查询 7 天，因此清理延迟不会扩大公开查询面。
- 若采集停止超过 30 天，历史记录最终为空，页面显示“最近 30 天没有数据”。

## 7. GitHub Actions 采集器

> 已废弃：本节不再实施。生产采集改为 Home Assistant 每 10 分钟调用私有写入 API，详见 [Home Assistant 环境数据导出设计](./2026-08-04-home-assistant-environment-export-design.md)。

### 7.1 调度

- 定时表达式以 10 分钟为目标。
- 提供 `workflow_dispatch`，便于首次验证和故障排查。
- GitHub 定时任务可能延迟，产品不承诺严格整点执行。
- 每日清理任务与采集逻辑分离，清理失败不阻止新读数写入。

### 7.2 单次运行

1. 读取 Secrets 和启用的传感器映射。
2. 登录或刷新中国大陆区小米云会话。
3. 并行读取两台设备的三个属性。
4. 规范化数值并校验范围。
5. 使用本次 GitHub run id 派生 `idempotency_key`。
6. 逐设备 upsert 到 Supabase。
7. 日志只记录场所、监测点、成功/失败和耗时，不记录令牌或完整设备 ID。

### 7.3 失败行为

- 登录失败：本次不写入；保留历史数据。
- 单设备失败：记录该设备失败，另一台继续。
- 属性部分缺失：不写入不完整的温湿度记录；电量允许为空。
- Supabase 暂时失败：工作流失败，可人工重跑；幂等键避免重复。
- 连续失败不向公开页面泄漏内部错误；页面只根据数据年龄显示过期状态。

## 8. 公开 API

### 8.1 最新读数

`GET /api/environment/latest?location=home`

用途：页面首次加载和未来 VRChat 桥接。

响应只包含：场所标识与名称、室内外最新温湿度、电量、时间、新鲜度。每个监测点拥有独立新鲜度，顶层状态取两者中的较差状态。不得包含小米 DID、model、账号、网关或数据库内部错误。

示例：

```json
{
  "location": "home",
  "updatedAt": "2026-08-04T10:40:00+08:00",
  "freshness": "fresh",
  "indoor": {
    "temperature": 23.4,
    "humidity": 52,
    "battery": 86,
    "freshness": "fresh",
    "observedAt": "2026-08-04T10:40:00+08:00"
  },
  "outdoor": {
    "temperature": 18.7,
    "humidity": 68,
    "battery": 74,
    "freshness": "fresh",
    "observedAt": "2026-08-04T10:39:00+08:00"
  }
}
```

### 8.2 历史趋势

`GET /api/environment/history?location=home&range=24h|7d`

- 仅接受白名单范围 `24h` 和 `7d`。
- `24h` 返回原始 10 分钟读数。
- `7d` 按小时聚合平均温度和湿度，并保留每小时最后电量。
- 不接受任意起止时间，避免公开导出全部数据库。

### 8.3 缓存与访问

- Route Handler 默认是公开只读端点。
- 当前 Next.js 项目未启用 Cache Components；使用与 Next.js 16.2.7 当前配置匹配的显式短时缓存响应头或 `unstable_cache`，不使用 `use cache`。
- 最新数据缓存不超过 60 秒；历史数据可缓存 5 分钟。
- Supabase 原始环境表不授予匿名读写权限。公开 API 由服务端读取并投影安全字段。

## 9. 页面信息架构

### 9.1 路由与隔离

- 页面文件位于 `[locale]` 下新的独立路由组，与 `(blog)` 并列。
- 路由组不进入 URL，因此默认中文地址保持 `/environment`。
- 独立 layout 只加载 `ThemeProvider`，不加载 `MusicProvider`、Header、Footer、BackToTop 或博客通知组件。
- 支持 `/environment`、`/en/environment` 和 `/ja/environment`。
- 页面 metadata 设置 `robots: { index: false, follow: false }`。
- 不向现有手动 sitemap 白名单添加 `/environment`，也不向任何导航添加链接。

### 9.2 层级

第一级为“场所”，当前唯一选项为“家”。组件从数据读取选项；现在不显示无数据的宿舍、公司等占位项，未来新增场所后自动形成可切换列表。

第二级为“监测点”，当前为“室内”和“室外”。桌面并排，移动端上下排列。

### 9.3 页面内容

1. 独立标题“环境记录”、最新更新时间和主题切换。
2. 大字号场所切换器，当前显示“家”。
3. 室内外当前温度、湿度、电量和各自数据时间。
4. 真实派生的室内外温差与湿度差。
5. `24 小时 / 7 天` 范围切换。
6. 独立温度趋势图。
7. 独立湿度趋势图。
8. 数据过期、部分缺失、完全为空的状态说明。

### 9.4 视觉语言

- 复用 `app/globals.css` 的暖白默认主题与深炭蓝暗色主题。
- 主题选择由现有 `next-themes` 机制保存；默认亮色，不跟随系统自动切换。
- 不采用通用 Dashboard 的圆角卡片堆叠；使用博客已有的留白、细线分隔和克制排版。
- 温度、湿度图复用现有 chart token，不凭空引入品牌外颜色。
- 室内外同时用实线/虚线与文字图例区分，不只依赖颜色。
- 图表使用轻量的项目内 SVG 组件，避免仅为两张折线图增加大型依赖。
- 初次加载和数据更新只使用短暂、统一的过渡；尊重 `prefers-reduced-motion`。

### 9.5 刷新与状态

- 浏览器每 60 秒检查一次最新接口。
- 云采集目标间隔约 10 分钟。
- 源更新时间超过 25 分钟或云端明确标记设备离线时标记 `stale`，避免 GitHub 调度延迟造成过早误报。
- 如果云接口不提供源时间和在线状态，则以 25 分钟判断云读取链路是否中断，并将时间明确标注为“云端读取于”。
- 一只设备过期时仅标记该监测点，另一只继续正常显示。
- 请求暂时失败时保留页面内最后一次有效数据，并标记“刷新失败”。
- 最近 30 天无任何数据时显示明确空状态，不渲染虚构图表。

## 10. VRChat 扩展约定

未来桥接程序在运行 VRChat 的 Windows 电脑上执行：

1. 定期请求 `/api/environment/latest?location=home`。
2. 在数据新鲜时格式化不超过 144 字符的文本，例如：`🏠 室内 23.4°C · 52% ｜室外 18.7°C · 68%`。
3. 通过 UDP 向 `127.0.0.1:9000` 的 `/chatbox/input` 发送 OSC 消息。
4. 数据过期时停止自动播报或使用明确的“数据已过期”模板，不播报旧值为实时值。

桥接程序只消费公开 API，不包含小米或 Supabase 密钥。它是后续独立子项目，不阻塞本轮页面上线。

## 11. 测试设计

### 11.1 单元测试

- MIoT 属性到内部读数的转换。
- 数值范围校验和可空电量。
- 幂等键与重复写入处理。
- 室内外温湿度差计算。
- `fresh`、`stale`、`unavailable` 状态判断。
- 24 小时原始序列和 7 天小时聚合。
- Australia/Perth 时间格式化。

### 11.2 数据库与 API 测试

- 匿名用户不能插入、更新或删除读数。
- API 响应不包含 `source_device_id`。
- 未知场所和非法 range 返回明确的 4xx。
- 单设备缺失时 API 返回部分结果，而不是整体 500。
- 30 天清理只删除过期读数。

### 11.3 页面测试

- 亮色默认、暗色切换与刷新后保持。
- 不渲染博客 Header、Footer 和音乐播放器。
- 桌面并排、移动端堆叠。
- 24 小时与 7 天切换。
- 一台失败、两台过期、完全空数据和网络失败状态。
- 页面含 `noindex, nofollow`，且 sitemap 与博客导航不含 `/environment`。
- 键盘访问、可见焦点、非颜色图例和减少动态效果。

### 11.4 发布验证

- 运行现有测试、ESLint 和生产构建。
- 使用真实脱敏数据完成一次端到端采集。
- 在桌面和手机视口人工检查亮暗主题。
- 直接访问 `/environment` 成功，主页中不存在入口。
- 未配置小米 Secrets 的普通 Vercel 构建仍可完成；Secrets 只用于 GitHub 采集工作流。

## 12. 上线顺序

1. 云读取探针与真实设备验证。
2. Supabase migration、种子场所和两台传感器映射。
3. 定时采集与 30 天清理。
4. 安全只读 API。
5. 独立页面及三语言文案。
6. 自动测试、构建和视觉验证。
7. 配置生产 GitHub Secrets，手动触发首轮采集。
8. 发布 Vercel 并检查隐藏、索引和 stale 行为。

## 13. 验收标准

- 两台 `LYWSD03MMC` 能通过现有网关和中国大陆小米云写入真实读数。
- 正常情况下最新数据间隔约 10 分钟。
- `/environment` 默认展示“家”下的室内和室外。
- 页面默认亮色，可切换暗色，并与博客现有主题语言一致。
- 页面独立于博客布局，不在导航和 sitemap 中，且不可被正常搜索引擎索引。
- 24 小时与 7 天图表使用真实数据，过期和失败状态诚实可见。
- 数据库仅保留最近 30 天读数。
- 公开 API 不泄漏设备或账号内部信息，并可供未来 VRChat 桥接直接使用。
