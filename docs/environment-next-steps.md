# 环境监测项目：下次从这里继续

更新：2026-08-05

## 恢复指令

下一次对 Codex 说：

> 请先完整阅读 `docs/environment-next-steps.md`，然后按里面的下一步继续。

随后必须阅读本文件直接链接的当前设计和计划，不要恢复已经移除的旧 Xiaomi 登录实验。

## 当前完成状态

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

不要再要求用户提供小米密码、验证码、Cookie、`ssecurity`、OAuth 材料、Supabase Key、SSH 私钥或 ingest token。

## 下一步

从公开只读数据层开始，暂时不要先做视觉页面：

1. 完整阅读：
   - `docs/superpowers/specs/2026-08-04-environment-monitoring-design.md`
   - `docs/superpowers/plans/2026-08-04-environment-monitoring.md`
   - `docs/environment-operations.md`
2. 按 `AGENTS.md` 要求，先阅读 `node_modules/next/dist/docs/` 中与 Route Handlers、缓存、layouts、metadata 相关的当前 Next.js 16.2.7 文档。
3. 先测试驱动实现公开 environment domain：安全类型、新鲜度、室内外差值、24h 原始数据和 7d 小时聚合。
4. 实现并测试：
   - `GET /api/environment/latest?location=home`
   - `GET /api/environment/history?location=home&range=24h|7d`
5. 确认公开 JSON 不包含数据库 ID、小米标识、Home Assistant 实体 ID或任何秘密。
6. API 验证通过后，再进入独立 `/environment` 三语言页面与图表设计。
7. 页面完成后做 Vercel 生产部署和隐藏性检查。

## 当前相关代码

- `app/api/environment/ingest/route.ts`
- `lib/environment/handler.ts`
- `lib/environment/ingest.ts`
- `lib/environment/store.ts`
- `lib/environment/supabase-store.ts`
- `types/environment.ts`
- `types/supabase.ts`
- `supabase/migrations/006_environment_monitoring.sql`
- `tests/environment-*.test.ts`

## 必须保持的边界

- `/environment` 不进入博客主页、Header、移动导航或 sitemap。
- 页面 metadata 使用 `noindex, nofollow`。
- 页面与博客壳层隔离，但复用暖白默认主题和现有深色主题。
- 当前只有“家”，不要创建宿舍、公司等空占位场所。
- 第二层固定显示室内和室外。
- 数据源只保留最近 30 天；页面第一版只提供 24h 和 7d。
- 现有旧 ESP32 数据和博客表保持不动。
- VRChat 桥接留到页面完成后的独立阶段，只消费公开 latest API。
- 保留用户未跟踪的 `public/mom50ome-qr*` 文件，不提交也不删除。

## 今日清理结果

- 已删除无生产用途的 `collector/` Python 包、测试和依赖文件。
- 已删除两份 MiService 临时验证规格。
- 已把旧环境规格压缩为当前 Home Assistant 架构和页面/API契约。
- 已把旧采集实施计划替换为只包含剩余公开 API 与页面工作的计划。
- 已用当前 Home Assistant 运维流程替换旧登录、Cookie 和 `ssecurity` 操作说明。

删除内容仍可从 Git 历史恢复，但不得重新成为生产方案。
