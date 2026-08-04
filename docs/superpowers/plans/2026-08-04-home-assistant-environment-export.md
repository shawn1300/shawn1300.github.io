# Home Assistant Environment Export — Completed Record

日期：2026-08-05
设计来源：`docs/superpowers/specs/2026-08-04-home-assistant-environment-export-design.md`
状态：生产采集链路已完成并通过用户验收

## 已完成

- 大阪 Home Assistant Container 只绑定 `127.0.0.1:8123`，通过 SSH 隧道管理。
- Xiaomi Home 官方集成固定中国大陆区，并通过包含过滤只保留两只温湿度计。
- 两只设备的温度、湿度和电量均正常，温度使用摄氏度。
- migration `006_environment_monitoring.sql` 已在生产 Supabase 执行。
- 三张环境表、RLS、两个角色种子、`pg_cron` 与每日 30 天清理任务均验证通过。
- 私有 `POST /api/environment/ingest` 已部署，匿名请求返回 `401`。
- Vercel 与 Home Assistant 使用同一枚专用写入令牌；令牌未进入仓库或聊天。
- Home Assistant 每 10 分钟发送一次包含两个固定角色的版本 1 JSON。
- 手动写入和连续自动写入均成功，室内外各形成三个不同时间桶。
- 同一时间桶的重复手动触发没有新增记录，幂等行为通过。
- Home Assistant 配置检查、重启、HTTP 健康、内存限制和错误日志检查均正常。

## 未作为页面开发阻塞项的附加验证

- 可在维护窗口临时模拟单个实体不可用，复核另一角色仍可写入。
- 可延长观察窗口并定期检查源时间与接收时间差。
- 可审计 Vercel 和 Home Assistant 的长期日志保留策略。

这些项目不改变已经通过的采集契约，也不要求恢复旧采集器。

## 运维与下一阶段

- 当前运维：`docs/environment-operations.md`
- 明日恢复入口：`docs/environment-next-steps.md`
- 剩余页面/API计划：`docs/superpowers/plans/2026-08-04-environment-monitoring.md`
