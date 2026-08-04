# 独立环境监测页面与公开接口设计

日期：2026-08-04
更新：2026-08-05
状态：产品设计已确认；采集与存储已上线，公开 API 和页面待实现

## 1. 目标

- 两只 `LYWSD03MMC` 分别代表“室内”和“室外”，约每 10 分钟保存温度、湿度和电量。
- 数据只保留最近 30 天，与旧环境检测器和博客内容表完全隔离。
- `https://shawn1300.cc.cd/environment` 提供独立页面。
- 页面不出现在博客导航或 sitemap 中，并设置 `noindex, nofollow`；知道地址的人仍可直接访问。
- 页面默认使用博客暖白亮色主题，可切换现有深色主题，但不加载博客 Header、Footer、音乐播放器或返回顶部组件。
- 提供安全的公开只读 JSON，为页面和未来 VRChat OSC 桥接共用。

## 2. 当前数据链路

```text
LYWSD03MMC × 2
  → LX06 蓝牙网关
  → 中国大陆小米云
  → Xiaomi Home 官方 Home Assistant 集成
  → Home Assistant 每 10 分钟自动化
  → POST /api/environment/ingest
  → Supabase 私有环境表
  → latest/history 公开投影
  → /environment 与未来 VRChat
```

生产链路不使用 `micloud`、MiService、`ssecurity`、浏览器捕获或 GitHub Actions 采集器。

## 3. 已实现数据边界

Supabase 表：

- `environment_locations`：当前只启用 `home`，时区为 `Australia/Perth`。
- `environment_sensors`：每个场所固定 `indoor`、`outdoor` 两个角色。
- `environment_readings`：保存摄氏温度、湿度、电量、源更新时间、接收时间和十分钟幂等键。

约束：

- 温度 `-30..100 °C`，湿度和可选电量 `0..100%`。
- `(sensor_id, idempotency_key)` 唯一。
- 三张表启用 RLS，不提供匿名直读或写入策略。
- Supabase Cron 每日删除 `collected_at < now() - interval '30 days'` 的读数。
- 数据库不保存小米 DID 或 Home Assistant 实体 ID。

私有写入 API 独立验证室内外读数；一个角色无效时允许另一个角色写入。公开消费者永远不接触写入令牌或 Service Role Key。

## 4. 公开 API

### 4.1 最新值

```text
GET /api/environment/latest?location=home
```

返回：

- 场所 slug 和三语言显示名称。
- `indoor`、`outdoor` 各自最新温度、湿度、电量、源时间和派生新鲜度。
- 顶层更新时间和总体新鲜度。

不返回数据库 ID、小米标识、Home Assistant 实体 ID、账号信息、令牌或内部错误。

### 4.2 历史值

```text
GET /api/environment/history?location=home&range=24h|7d
```

- `24h` 返回按时间排序的原始十分钟读数。
- `7d` 返回按小时聚合的温湿度趋势。
- 只接受 `24h`、`7d` 白名单，不接受任意起止时间。
- 单个角色缺失时返回安全的部分结果，而不是整体失败。

### 4.3 缓存与错误

- latest 公共缓存不超过 60 秒。
- history 公共缓存不超过 5 分钟。
- 非法参数返回固定 `400`，未知或禁用场所返回固定 `404`，服务端错误返回通用 `500/503`。
- 日志和响应不得包含原始数据库错误或私有字段。

## 5. 页面结构

### 5.1 路由隔离

- 在 `[locale]` 下建立与 `(blog)` 并列的独立 `(environment)` 路由组。
- 支持 `/environment`、`/en/environment`、`/ja/environment`。
- 独立 layout 只复用主题能力。
- 不修改主页、桌面导航、移动导航或 sitemap。
- metadata 明确设置 `robots: { index: false, follow: false }`。

### 5.2 信息层级

1. 最大层级是场所切换器，当前只有“家”；不展示无数据的宿舍、公司等占位项。
2. 第二层级是“室内”和“室外”。
3. 展示各自当前温度、湿度、电量、数据时间与新鲜度。
4. 展示真实计算的室内外温差和湿度差。
5. 提供 `24 小时 / 7 天` 范围切换。
6. 分别绘制温度和湿度趋势。

### 5.3 视觉语言

- 延续博客暖白、留白、细线和克制排版，支持现有深炭蓝暗色主题。
- 避免通用后台 Dashboard 式圆角卡片堆叠。
- 图表使用项目内轻量 SVG，不增加大型图表依赖。
- 室内外同时依靠文字、实线/虚线和颜色区分，不能只靠颜色。
- 尊重 `prefers-reduced-motion`；移动端上下排列且不产生横向页面溢出。

## 6. 新鲜度与刷新

- 页面每 60 秒请求一次 latest，切换范围时请求 history。
- `source_updated_at` 表示小米云状态时间，`collected_at` 只用于链路诊断。
- 源时间超过 25 分钟标记为延迟；历史数据不得伪装成实时数据。
- 刷新失败时保留浏览器内最后一次有效快照并明确提示。
- 一个角色异常不影响另一个角色显示。
- 没有真实数据时显示空状态，不渲染占位折线或假读数。

## 7. 多语言与可访问性

- 中文、英文、日文使用独立 `Environment` 消息命名空间。
- 时间按场所的 `Australia/Perth` 时区展示，API 时间保持标准 ISO 8601。
- 范围切换、主题切换和图表信息均可键盘操作并具有可见焦点。
- 图表提供文本摘要或可访问标签，状态不只通过颜色表达。

## 8. VRChat 扩展

未来 Windows 本地桥接程序只调用 latest：

1. 数据新鲜时生成不超过 144 字符的室内外播报。
2. 通过 UDP 向 `127.0.0.1:9000` 的 `/chatbox/input` 发送 OSC。
3. 数据延迟时停止播报或明确标记过期。

VRChat 桥接是页面上线后的独立子项目，不阻塞本阶段。

## 9. 验收

- latest/history 只返回批准的公开字段，并正确处理非法参数、未知场所和部分数据。
- `/environment` 三种语言路径均可直接访问。
- 页面默认亮色、暗色切换持久化，桌面与手机布局正常。
- 页面没有博客壳层，不出现在导航和 sitemap，并包含 `noindex, nofollow`。
- 图表只使用真实数据，24 小时与 7 天范围正确。
- 自动测试、TypeScript、ESLint 和生产构建全部通过。
- 生产环境不向浏览器、日志或响应泄漏任何写入凭据或内部标识。
