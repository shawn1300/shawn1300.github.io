# Supabase 环境数据接收中转设计

更新：2026-08-09

## 目标

为宿舍 ESP32 提供一个可从当前国内网络稳定建立 TLS 的 Supabase Edge Function 上传入口。ESP32 只连接 Supabase；Edge Function 把受限请求转发到现有网站 v2 ingest，由现有后端继续完成设备令牌验证、正文校验、设备与指标映射、十分钟去重和 Supabase 数据库写入。

首版优先复用已经测试和部署的写入逻辑，不在 Edge Function 中复制业务规则，也不向 ESP32 或 Edge Function 提供 Supabase 数据库密钥。

## 已验证前提

ESP32 在同一国内 Wi-Fi 上的启动探针结果为：

```text
Website=TLS_FAIL, Supabase=TLS_OK, Osaka=HTTP_OK
```

Supabase TLS 握手约 4.8 秒后成功；当前网站在 TCP 443 成功后于 TLS 阶段被重置。传感器在探针结束后继续采样，因此故障仅位于原上传网络路径。

## 系统架构

```text
ESP32
  POST /functions/v1/environment-ingest-relay
  Authorization: Bearer <现有来源令牌>
  Content-Type: application/json
       │
       ▼
Supabase Edge Function
  方法、媒体类型、Bearer 格式、32 KiB 正文限制
  固定目标转发，不记录令牌或正文
       │
       ▼
https://shawn1300.cc.cd/api/environment/v2/ingest
  令牌摘要匹配、v2 正文校验、来源/设备/指标映射
  十分钟幂等写入
       │
       ▼
现有 Supabase 表、公开 API 与 /environment/dormitory
```

ESP32 的上传入口是 Supabase。Supabase Edge Function 到现有网站的调用发生在云端，不再经过宿舍的国内网络路径。

## 保持不变的边界

- 继续使用 `dormitory-esp32` 的现有来源令牌，不生成第二枚设备秘密。
- ESP32 v2 JSON 正文格式不变。
- 网站 `POST /api/environment/v2/ingest` 的请求和响应契约不变。
- `environment_sources`、设备、指标和读数表结构与 RLS 不变。
- 网站公开 latest/history API、宿舍页面和 Home Assistant v1 ingest 不变。
- 现有按服务器接收时间生成的十分钟桶和 `(metric_id, ten_minute_bucket)` 去重边界不变。

## Edge Function 接口

函数名固定为 `environment-ingest-relay`，生产地址为：

```text
https://gbmxqegjkmzuvhisyxou.supabase.co/functions/v1/environment-ingest-relay
```

函数只接受：

- `POST`；
- `Content-Type: application/json`，允许标准参数如 `charset=utf-8`；
- `Authorization: Bearer <token>`，token 长度 32–256 字符且不得含空白；
- 不超过 32 KiB 的正文。

不满足上述外层要求的请求不转发。响应使用固定、无敏感数据的 JSON 代码：

| 情况 | HTTP | 代码 |
|---|---:|---|
| 非 POST | 405 | `METHOD_NOT_ALLOWED` |
| Bearer 格式缺失或无效 | 401 | `UNAUTHORIZED` |
| 非 JSON | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 正文超过 32 KiB | 413 | `PAYLOAD_TOO_LARGE` |
| 无法读取正文 | 400 | `INVALID_BODY` |
| 上游网络、超时或异常响应 | 503 | `INGEST_RELAY_UNAVAILABLE` |

外层检查通过后，函数只向写死的现有 v2 ingest URL 发起一个 POST。调用者不能通过查询参数、请求头或正文改变上游主机、路径或方法，因此该函数不是开放代理。

函数只转发以下内容：

- `Authorization`；
- 规范化的 `Content-Type: application/json`；
- 原始、有界的 JSON 字节正文。

客户端提供的 Host、Forwarded、Cookie、apikey 和其他任意请求头都不转发。

## 认证与密钥

Supabase Edge Function 默认会把 `Authorization` 当作 Supabase 用户 JWT 预检。设备现有 Bearer Token 不是 Supabase JWT，因此该函数必须单独配置：

```toml
[functions.environment-ingest-relay]
verify_jwt = false
```

关闭平台 JWT 预检不代表关闭设备认证。认证链如下：

1. Edge Function 拒绝格式无效的 Bearer 头；
2. Edge Function 把格式有效的 Bearer 头原样发给固定上游；
3. 现有 v2 ingest 对令牌做 SHA-256 摘要并匹配唯一、启用的来源；
4. 未知、错误或禁用令牌返回固定 `401 UNAUTHORIZED`，不会解析正文或写库。

Edge Function 不读取数据库，不持有 publishable、legacy anon、secret 或 service-role key。真实设备令牌不写入函数源码、Supabase 函数秘密、配置、日志、测试夹具或 Git；它继续只存在于数据库摘要、本机忽略的 `secrets.h` 和 ESP32 闪存。

## 上游响应与日志

上游给出合法 HTTP 响应时，函数向 ESP32 透传：

- HTTP 状态；
- 响应正文；
- 规范化的 JSON `Content-Type`；
- `Cache-Control: no-store`。

合法上游响应必须使用 JSON 媒体类型且正文不超过 32 KiB；现有 v2 ingest 的所有预期成功与错误响应都满足该边界。非 JSON、超出上限或无法完整读取的上游响应不向设备透传。

不透传上游的 Cookie、服务器标识、转发链或其他无关响应头。上游网络失败、超时、非法响应或函数异常统一收敛为 `503 INGEST_RELAY_UNAVAILABLE`，不暴露内部 URL、异常栈或数据库信息。

日志只允许包含：

- 固定结果代码；
- 上游 HTTP 状态（若存在）；
- 请求总耗时；
- 正文长度。

日志不得包含 Authorization、令牌摘要、请求正文、响应正文、传感器数值或上游异常原文。

## 固件变更

正式上传 URL 改为 Supabase Edge Function。设备继续发送原 Bearer Token 和原 v2 JSON 正文，不添加 `apikey` 或 Supabase 数据库密钥。

启动时的三线路探针保留，作为后续网络诊断依据。探针不发送令牌或读数。

当前 Supabase TLS 握手实测约 4.8 秒。正式上传使用独立于启动探针的有界超时：TLS 握手和完整 HTTP 往返需要容纳当前实测延迟及 Edge Function 到上游的转发时间，同时仍禁止无限等待。具体常量在实施计划中通过编译和实机请求验证后确定。

正式上传只走 Supabase，不再在失败后尝试原网站，以避免每十分钟额外等待已知会失败的 TLS 路径。

## 窗口和失败策略

保持现有十分钟窗口语义：

- 每个窗口独立计算温度、湿度和 PM2.5 平均值；
- 成功返回 `200` 时输出原有指标结果；
- 任意网络或非 `200` 结果只记录固定状态；
- 失败窗口照常清空，不立即重试、不补传；
- 十分钟后上传新的平均值。

该策略避免把二十分钟数据伪装成十分钟平均，也避免补传与当前窗口争用同一服务器接收桶。

## 实施与部署顺序

1. 新增可依赖注入上游 fetch 的纯转发处理器和 Edge Function 入口。
2. 增加函数级 `verify_jwt = false` 配置。
3. 自动测试方法、Bearer 格式、媒体类型、流式正文上限、固定目标、头部白名单、上游响应透传、超时收敛和日志脱敏。
4. 运行现有全部环境监测测试，确认 v1/v2 后端契约未变。
5. 部署 Edge Function，尚不修改 ESP32。
6. 线上依次验证：
   - 无令牌返回外层 `401`；
   - 错误令牌由上游返回 `401`；
   - 有效令牌与无效正文由上游返回 `422` 且不产生读数。
7. 确认函数日志不包含秘密或正文。
8. 修改、编译 ESP32 正式上传 URL 和超时。
9. 用户刷入 COM4，等待一个完整十分钟窗口。
10. 同时确认串口 `HTTP 200`、函数成功调用、数据库新读数和宿舍页面更新时间。

任一阶段失败即停止，不提前切换下一组件。

## 验证标准

- ESP32 只连接 Supabase 正式上传地址且不持有 Supabase key。
- Edge Function 无法被用于转发到其他主机或路径。
- 无效外层请求不会到达网站 v2 ingest。
- 错误设备令牌无法读取来源信息、解析正文或写入数据库。
- 有效设备上传返回与现有 v2 ingest 相同的固定 JSON 结果。
- 同一十分钟桶重复到达时继续返回 duplicate 而不新增第二条读数。
- 连续三个十分钟窗口上传成功，温度、湿度和 PM2.5 在公开 API 与页面中更新。
- Edge Function、网站与设备日志均不出现真实令牌、Authorization 或完整请求正文。

## 回退

在 Edge Function 通过线上负面测试前不刷入新固件。若刷机后 Supabase 路径不稳定，可重新刷回提交 `07cd6bb` 的诊断固件；该版本仍持续采样，但原网站上传会保持失败。数据库和网站不需要回滚，因为本设计不改 schema 或现有 v2 接口。

## 非目标

- 不让 Edge Function 直接写数据库。
- 不在 Edge Function 中复制 v2 令牌、指标、设备映射或去重逻辑。
- 不增加失败窗口缓存、立即重试或历史补传。
- 不为浏览器调用增加 CORS；该入口只服务 ESP32。
- 不改变 Home Assistant、公开 API、环境页面或 AQI 计算。

## 参考资料

- Supabase Edge Function Authorization headers：<https://supabase.com/docs/guides/functions/auth-headers>
- Supabase Securing Edge Functions：<https://supabase.com/docs/guides/functions/auth>
- Supabase Function Configuration：<https://supabase.com/docs/guides/functions/function-configuration>
- Supabase Deploy to Production：<https://supabase.com/docs/guides/functions/deploy>
