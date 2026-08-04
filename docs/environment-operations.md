# 环境监测运维说明

更新：2026-08-05
生产链路：Home Assistant → 私有写入 API → Supabase

## 安全边界

- Home Assistant 只监听大阪服务器的 `127.0.0.1:8123`，不得开放公网端口。
- 管理页面只通过 SSH 本地端口转发访问。
- 小米账号密码、OAuth 材料、写入令牌、Supabase Service Role Key 和 SSH 私钥不得进入仓库、聊天或日志。
- Home Assistant 只保存专用写入令牌，不保存 Supabase Service Role Key。
- Vercel 只保存服务端变量 `ENVIRONMENT_INGEST_TOKEN`；不得添加 `NEXT_PUBLIC_` 前缀。
- Xiaomi Home 使用包含过滤，只保留室内和室外两只温湿度计；导出自动化不调用任何家电控制动作。

旧的 `micloud`、MiService、`ssecurity`、浏览器捕获与 Edge 诊断路线已经失败并移除，不要恢复。

## 日常健康检查

登录大阪服务器后：

```bash
cd ~/homeassistant
docker compose ps
docker stats --no-stream homeassistant
curl --silent --show-error --output /dev/null \
  --write-out 'HTTP %{http_code}\n' \
  http://127.0.0.1:8123/
```

正常结果是容器为 `Up`、HTTP 为 `200`，内存明显低于 768 MiB 限制。

检查近期错误：

```bash
docker logs --since 30m homeassistant 2>&1 \
  | grep -E 'ERROR|CRITICAL|rest_command|environment_ingest|automations.yaml'
```

不要开启调试级网络日志，以免扩大请求正文或认证头的暴露面。

## 管理页面与 SSH 隧道

Windows `hosts` 中保留：

```text
127.0.0.1 homeassistant.local
```

使用自己的私钥建立隧道，私钥内容不得复制到聊天：

```powershell
ssh -i <private-key-path> -o ExitOnForwardFailure=yes `
  -N -L 8123:127.0.0.1:8123 ubuntu@<server-ip>
```

隧道保持运行时访问：

```text
http://homeassistant.local:8123
```

关闭本地隧道不会停止服务器上的 Home Assistant 或自动采集。

## 配置修改与重启

修改前为以下文件创建带时间戳的备份：

- `/home/ubuntu/homeassistant/config/secrets.yaml`
- `/home/ubuntu/homeassistant/config/configuration.yaml`
- `/home/ubuntu/homeassistant/config/automations.yaml`

每次修改后先检查配置：

```bash
docker exec homeassistant \
  python -m homeassistant --script check_config --config /config
```

只有检查成功才能重启：

```bash
cd ~/homeassistant
docker compose restart
```

重启后重新执行健康检查和近期日志检查。

## 手动上传与数据确认

在 Home Assistant 的“自动化与场景”中运行：

```text
环境监测：每 10 分钟上传
```

自动化正常情况下每个整十分钟触发一次。私有写入接口为：

```text
POST https://shawn1300.cc.cd/api/environment/ingest
```

匿名请求必须返回 `401`。不要使用真实令牌做终端回显测试。

在 Supabase SQL Editor 中检查最新读数：

```sql
SELECT DISTINCT ON (s.role)
  l.slug AS location,
  s.role,
  r.temperature_c,
  r.humidity_percent,
  r.battery_percent,
  r.source_updated_at,
  r.collected_at,
  r.idempotency_key
FROM environment_readings r
JOIN environment_sensors s ON s.id = r.sensor_id
JOIN environment_locations l ON l.id = s.location_id
WHERE l.slug = 'home'
ORDER BY s.role, r.collected_at DESC;
```

同一角色在同一 UTC 十分钟时间桶内重复运行不会新增行。

## 小米集成维护

- 登录地区固定为中国大陆。
- Home Assistant 单位系统和两个温度实体都应使用摄氏度。
- Xiaomi Home 配置使用设备包含过滤，只选择两只温湿度计。
- OAuth 失效时通过 SSH 隧道进入 Xiaomi Home 集成，使用小米官方 OAuth 页面重新认证。
- 不回退到账号密码脚本、Cookie 导出、`ssecurity` 或浏览器响应抓取。
- 重新认证或调整过滤后，再确认两只设备各有温度、湿度和电量三个实体。

## 写入令牌轮换

1. 在本机用密码学安全随机源生成至少 32 字节的新令牌，不在终端打印。
2. 更新 Vercel Production 的 `ENVIRONMENT_INGEST_TOKEN`。
3. 在 Home Assistant `/config/secrets.yaml` 更新完整的 `Bearer` 认证值。
4. 重新部署 Vercel，检查匿名请求仍为 `401`。
5. 检查 Home Assistant 配置、重启容器并手动运行一次自动化。
6. 在 Supabase 确认室内外均成功写入后，清除本机剪贴板和临时变量。

不要把 Supabase Service Role Key 或 Home Assistant 长期访问令牌引入这条路径。

## 30 天保留

Supabase 的 `pg_cron` 每天运行 `environment-readings-retention`，删除 30 天以前的环境读数。检查任务：

```sql
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'environment-readings-retention';
```

清理函数只处理 `environment_readings`，不得影响博客表或旧环境表。

## 回滚

如果配置修改导致启动失败：

1. 不删除 `/config`、`.storage` 或 Xiaomi OAuth 数据。
2. 从本次修改前的时间戳备份恢复三个 YAML 文件。
3. 运行配置检查。
4. 只重启 `homeassistant` 容器。
5. 检查日志、两个设备状态和自动上传。

## 设备放置

`LYWSD03MMC` 不防雨。室外设备必须通风、遮雨并避开阳光直射；异常高温不能由软件校正为真实环境温度。

## 后续消费者

网页和未来 VRChat 桥接只读取待实现的公开只读 API，不直接访问 Home Assistant。VRChat 桥接程序将运行在 Windows 本机，通过 UDP `127.0.0.1:9000` 的 `/chatbox/input` 输出不超过 144 字符的文本。
