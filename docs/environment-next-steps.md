# 环境监测项目：下次从这里继续

更新：2026-08-10

## 恢复指令

下一次对 Codex 说：

> 请先完整阅读 `docs/environment-next-steps.md`，然后按里面的下一步继续。

随后必须阅读本文件直接链接的当前设计和计划，不要恢复已经移除的旧 Xiaomi 登录实验。

## 当前完成状态

### 已部署的生产状态

数据链路已经真实上线：

```text
两只 LYWSD03MMC
→ LX06
→ 中国大陆小米云
→ Xiaomi Home / Home Assistant
→ 每 10 分钟私有 HTTPS POST
→ Vercel ingest Route Handler
→ Supabase 环境表与 30 天清理
```

宿舍空气站也已上线：

```text
SHT30 + PMS5003
→ ESP32 每 10 分钟聚合
→ Supabase Edge Function 中转
→ 网站 v2 ingest
→ Supabase 模块化环境表
→ /environment/dormitory
```

已确认：

- Home Assistant 不开放公网 `8123`，只通过 SSH 隧道管理。
- Xiaomi Home 中只保留室内、室外两只温湿度计。
- 两只设备的温度、湿度、电量均正常，温度为摄氏度。
- Supabase migration `006` 已执行，三张表、RLS、种子、`pg_cron` 和清理任务全部验证为正常。
- 专用 ingest 令牌已分别保存在 Vercel Production 与 Home Assistant secrets 中；仓库不含令牌。
- 生产私有接口匿名访问返回 `401`。
- 室内外真实读数各连续形成三个十分钟桶。
- 同一时间桶内重复手动上传没有新增记录。
- 当前运行资源正常，Home Assistant 启动日志无配置错误。
- 公开 latest/history 领域层与 Route Handlers 已完成，包含安全投影、新鲜度、室内外差值、24h 原始序列和 7d 小时聚合。
- 独立 `/environment` 页面已完成，支持中文、英文、日文、暖白/深色主题、60 秒 latest 刷新、24h/7d 切换、真实差值、项目内 SVG 图表（坐标轴标签在 SVG 外绘制，避免 `preserveAspectRatio="none"` 拉伸文字）。
- 切换 24h/7d 期间保留上一次有效快照，不闪现空态；温度轴单位与读数区一致（`°C`）；历史查询降序取最新上限，采集频率提高时丢旧不丢新。
- 55 个测试、TypeScript、ESLint 和 Next.js 16.2.7 生产构建均通过。
- 已部署到 Vercel Production（推送 main 自动部署），2026-08-05 生产验证通过：
  - `/environment`、`/en/environment`、`/ja/environment` 三路径均返回 `noindex, nofollow`。
  - sitemap 不含 `/environment`；页面 HTML 无博客 Header/Footer/导航，仅有静态资源链接。
  - `latest` 返回真实数据（室内外均 `fresh`，差值正常），24h/7d 均 `200`；公开 JSON 无私有字段。
  - 错误路径正确：缺参数 `400`、未知地点 `404`、非法范围 `400`。
- 模块化 v2 migration、来源令牌摘要、配置映射、写入与公开 API 已部署。
- `dormitory-esp32` 通过 Supabase 中转连续完成三个十分钟真实窗口，公开页面持续显示新鲜的温度、湿度和 PM2.5。
- Supabase 中转只转发有界请求，不持有 Supabase Key，日志不记录设备令牌或传感器正文。

不要再要求用户提供小米密码、验证码、Cookie、`ssecurity`、OAuth 材料、Supabase Key、SSH 私钥或 ingest token。

### 可复用模板

- 新来源统一从 `templates/environment/README.md` 开始。
- ESP32 模板把 Wi‑Fi、UTC、十分钟聚合和 Supabase 上传核心与 SHT30/PMS5003 适配器分开。
- Home Assistant 模板是一份 v2 package，会跳过不可用和非数字实体，不会把异常状态写成 `0`。
- 模板只供新来源复制；当前宿舍固件和“家”的 v1 自动化均保持不动。

## 下一步

1. 添加新场所或设备时，先读 `templates/environment/README.md` 和 `docs/environment-configuration-guide.md`，复制对应模板并执行三窗口验收。
2. VRChat 桥接仍是独立阶段，只消费公开 `latest` API。
3. 如果部署流程或运维方式变化，再更新 `docs/environment-operations.md`。

## 当前相关代码

- `app/api/environment/ingest/route.ts`
- `lib/environment/handler.ts`
- `lib/environment/ingest.ts`
- `lib/environment/store.ts`
- `lib/environment/supabase-store.ts`
- `lib/environment/public.ts`
- `lib/environment/public-handler.ts`
- `lib/environment/supabase-public.ts`
- `lib/environment/chart.ts`
- `types/environment.ts`
- `types/supabase.ts`
- `supabase/migrations/006_environment_monitoring.sql`
- `supabase/migrations/007_environment_monitoring_v2.sql`
- `supabase/functions/environment-ingest-relay/`
- `templates/environment/`
- `tests/environment-*.test.ts`
- `app/api/environment/latest/route.ts`
- `app/api/environment/history/route.ts`
- `app/[locale]/(environment)/environment/layout.tsx`
- `app/[locale]/(environment)/environment/page.tsx`
- `app/[locale]/(environment)/environment/environment-dashboard.tsx`
- `app/[locale]/(environment)/environment/environment.module.css`
- `messages/zh-CN.json`
- `messages/en.json`
- `messages/ja.json`

## 必须保持的边界

- `/environment` 不进入博客主页、Header、移动导航或 sitemap。
- 页面 metadata 使用 `noindex, nofollow`。
- 页面与博客壳层隔离，但复用暖白默认主题和现有深色主题。
- `/environment` 默认显示“家”，`/environment/dormitory` 是已上线场所；不要创建没有真实设备的空占位场所。
- 第二层固定显示室内和室外。
- 数据源只保留最近 30 天；页面第一版只提供 24h 和 7d。
- 当前宿舍 ESP32 与“家”的 v1 Home Assistant 自动化保持不动；新设备只从模板创建。
- 博客表和历史环境数据保持不动。
- VRChat 桥接留到页面完成后的独立阶段，只消费公开 latest API。
- 保留用户未跟踪的 `public/mom50ome-qr*` 文件，不提交也不删除。

## 今日清理结果

- 已删除无生产用途的 `collector/` Python 包、测试和依赖文件。
- 已删除两份 MiService 临时验证规格。
- 已把旧环境规格压缩为当前 Home Assistant 架构和页面/API契约。
- 已把旧采集实施计划替换为只包含剩余公开 API 与页面工作的计划。
- 已用当前 Home Assistant 运维流程替换旧登录、Cookie 和 `ssecurity` 操作说明。

删除内容仍可从 Git 历史恢复，但不得重新成为生产方案。
