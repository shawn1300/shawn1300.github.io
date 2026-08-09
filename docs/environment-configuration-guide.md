# 环境监测模块化配置教程

更新：2026-08-09

本教程说明如何在不增加后台管理页面的前提下，添加场所、Home Assistant 或 ESP32 数据源、温湿度计、CO₂ 和 PM2.5 设备。配置频率低，因此元数据写在 `config/environment.ts`，令牌永远不写入配置或 Git。

## 架构与安全边界

```text
米家设备 → Home Assistant ─┐
                           ├→ 私有 HTTPS ingest API → Supabase RLS 表 → 公开只读 API → /environment
DIY 传感器 → ESP32 ────────┘
```

- 旧 Home Assistant 请求继续使用 `POST /api/environment/ingest` 和服务端 `ENVIRONMENT_INGEST_TOKEN`。
- 新来源使用 `POST /api/environment/v2/ingest`，每个来源一枚独立令牌。
- ESP32 和 Home Assistant 都不能持有 Supabase Key，尤其不能持有 Service Role Key。
- 新表全部启用 RLS；浏览器只能通过公开 Route Handler 读取经过白名单投影的数据。
- 明文来源令牌只存在于生成时的本机剪贴板和对应设备的秘密存储中；数据库只保存 SHA-256 摘要。

## 第一次启用 v2

1. 备份现有环境表。
2. 完整审阅 `supabase/migrations/007_environment_monitoring_v2.sql`。
3. 在 Supabase SQL Editor 中一次性执行该文件。它在一个事务内创建新表、回填最近 30 天旧读数，并保留旧表用于回滚。
4. 先验证 v1/latest/history，再部署写入新表的应用代码。

备份查询示例：

```sql
SELECT * FROM environment_locations ORDER BY slug;
SELECT * FROM environment_sensors ORDER BY location_id, role;
SELECT * FROM environment_readings ORDER BY collected_at DESC;
```

不要在备份或诊断查询中选择 `environment_sources.token_digest`。

## 配置文件结构

先运行：

```bash
npm run environment:validate
```

编辑 `config/environment.ts`。场所、来源和设备 slug 只能使用小写字母、数字和连字符，并在各自集合中唯一。

### 添加场所

```ts
{
  slug: "greenhouse",
  name: { zh: "温室", en: "Greenhouse", ja: "温室" },
  timezone: "Australia/Perth",
  public: true,
  enabled: true,
  order: 10,
}
```

- `public: true`：允许公开只读 API 和页面显示，但页面仍是 `noindex, nofollow`，也不会进入 sitemap。
- `enabled: false`：停止展示和接收映射，不删除历史读数。
- 只有确实存在一对室内/室外设备时才设置 `comparison`。默认 `home` 保留温度、湿度差值；其他场所不配置就完全不显示差值模块。

### 添加来源

Home Assistant：

```ts
{ slug: "greenhouse-ha", name: "Greenhouse Home Assistant", type: "home_assistant", enabled: true }
```

ESP32：

```ts
{ slug: "greenhouse-esp32", name: "Greenhouse ESP32", type: "esp32", enabled: true }
```

一个来源可以拥有多台设备。不要把令牌或摘要写进 `config/environment.ts`。

### 添加设备和指标

```ts
{
  slug: "greenhouse-air",
  location: "greenhouse",
  source: "greenhouse-esp32",
  name: { zh: "空气站", en: "Air station", ja: "空気ステーション" },
  placement: "indoor",
  enabled: true,
  order: 0,
  metrics: [
    { key: "temperatureC", enabled: true, order: 0 },
    { key: "humidityPercent", enabled: true, order: 1 },
    { key: "co2Ppm", enabled: true, order: 2 },
    { key: "pm25UgM3", enabled: true, order: 3, showAqi: true },
    { key: "batteryPercent", enabled: true, order: 4 },
  ],
}
```

固定指标及硬范围：

| key | 单位 | 可接受范围 | 默认曲线 |
|---|---:|---:|---|
| `temperatureC` | °C | -30～100 | 是 |
| `humidityPercent` | % | 0～100 | 是 |
| `co2Ppm` | ppm | 1～50000 | 是 |
| `pm25UgM3` | µg/m³ | 0～5000 | 是 |
| `batteryPercent` | % | 0～100 | 否，仅设备健康 |

`showAqi` 只能用于 PM2.5。中国参考按 HJ 633—2026 当前一小时平均值计算，美国参考按 EPA 2026 NowCast 计算；两者各自执行完整性判断。消费级传感器结果不是官方监测结果。

## 生成并审阅配置迁移

修改配置后：

```bash
npm run environment:validate
npm run environment:generate-migration
```

生成器只在 `supabase/migrations/` 写入带内容指纹的新 SQL，不连接 Supabase；相同配置再次运行不会重复生成。逐行审阅后再备份、执行和验证。不要把未审阅 SQL 自动加入部署流程。

## 生成、保存和轮换来源令牌

```bash
npm run environment:generate-token -- greenhouse-esp32
```

命令使用 32 个随机字节生成令牌：

- 明文只复制到本机剪贴板，不在终端显示；剪贴板不可用时命令失败。
- 终端只显示来源 slug、SHA-256 摘要和非秘密说明。
- 把摘要写入数据库，把明文立即写入设备或 Home Assistant secret。

```sql
UPDATE environment_sources
SET token_digest = '<命令显示的64位SHA-256摘要>', updated_at = now()
WHERE slug = 'greenhouse-esp32';
```

轮换时先生成新令牌并原子替换摘要，然后立即更新设备。撤销来源可将 `enabled` 设为 `false` 或将 `token_digest` 设为 `NULL`。不要查询、复制或记录摘要列表。

## Home Assistant 在哪里放令牌

令牌放在 Home Assistant 的 `/config/secrets.yaml`，不要放在自动化正文、日志或界面截图中：

```yaml
environment_v2_authorization: "Bearer <在这里粘贴剪贴板中的来源令牌>"
```

`/config/configuration.yaml` 只引用 secret：

```yaml
rest_command:
  environment_v2_ingest:
    url: "https://shawn1300.cc.cd/api/environment/v2/ingest"
    method: POST
    headers:
      Authorization: !secret environment_v2_authorization
      Content-Type: application/json
    timeout: 8
    payload: >-
      {
        "schemaVersion": 2,
        "sentAt": "{{ utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z') }}",
        "readings": [{
          "device": "greenhouse-air",
          "sourceUpdatedAt": "{{ as_timestamp(states.sensor.example_temperature.last_updated) | timestamp_custom('%Y-%m-%dT%H:%M:%S.000Z', false) }}",
          "metrics": {
            "temperatureC": {{ states('sensor.example_temperature') | float }},
            "humidityPercent": {{ states('sensor.example_humidity') | float }}
          }
        }]
      }
```

自动化每十分钟调用一次 `rest_command.environment_v2_ingest`。示例实体 ID 是占位符，必须替换为自己的实体；不要把真实实体 ID 或令牌提交到仓库。

修改 YAML 后先检查再重启：

```bash
docker exec homeassistant python -m homeassistant --script check_config --config /config
docker compose restart
```

## ESP32 HTTPS 上传骨架

ESP32 必须校时、验证服务器 CA、设置短超时，并在失败后等待下一次十分钟周期；不要高频无限重试。

```cpp
WiFiClientSecure client;
client.setCACert(ROOT_CA_PEM);       // 使用有效根证书，不要 setInsecure()

HTTPClient https;
https.setConnectTimeout(8000);
https.setTimeout(8000);
https.begin(client, "https://shawn1300.cc.cd/api/environment/v2/ingest");
https.addHeader("Authorization", String("Bearer ") + SOURCE_TOKEN);
https.addHeader("Content-Type", "application/json");

// 先通过 NTP 得到 UTC ISO 8601 时间，再构造有界 JSON：
// {"schemaVersion":2,"sentAt":"...Z","readings":[
//   {"device":"greenhouse-air","sourceUpdatedAt":"...Z",
//    "metrics":{"temperatureC":23.4,"humidityPercent":51.2,"co2Ppm":720,"pm25UgM3":8.1}}
// ]}
int status = https.POST(payload);
https.end();
// 200 成功；401 检查令牌；422 检查映射/值；503 等到下一周期再试。
```

`SOURCE_TOKEN` 放在设备的本地秘密配置或烧录时注入，不进入公开源码。每个设备上传最多使用其来源拥有、且配置启用的设备和指标。

## 固定响应与排查

| HTTP | code | 含义 |
|---:|---|---|
| 200 | `success: true` | 指标分别为 `stored`、`duplicate` 或 `skipped` |
| 401 | `UNAUTHORIZED` | 缺少、格式错误、未知或已停用的来源凭据 |
| 413 | `PAYLOAD_TOO_LARGE` | 正文超过 32 KiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 不是 JSON |
| 422 | `INVALID_*` / `NO_VALID_READINGS` | 结构、时间或所有指标无效 |
| 422 | `SOURCE_MAPPING_INVALID` | 来源没有任何可写的设备/指标映射 |
| 503 | `INGEST_UNAVAILABLE` / `STORAGE_UNAVAILABLE` | 服务端暂时不可用 |

同一服务器接收十分钟桶内，相同指标只保存一次。一个指标无效时，其他有效指标仍可保存；全部无效才拒绝请求。

## 上线后健康查询

最新值，不显示来源摘要：

```sql
SELECT DISTINCT ON (d.slug, m.metric_key)
  l.slug AS location, d.slug AS device, m.metric_key,
  r.value, r.source_updated_at, r.collected_at
FROM environment_metric_readings r
JOIN environment_device_metrics m ON m.id = r.metric_id
JOIN environment_devices d ON d.id = m.device_id
JOIN environment_locations l ON l.id = d.location_id
ORDER BY d.slug, m.metric_key, r.source_updated_at DESC;
```

检查十分钟间隔和来源活动：

```sql
SELECT s.slug AS source, max(r.collected_at) AS last_received,
       count(*) FILTER (WHERE r.collected_at >= now() - interval '24 hours') AS metrics_24h
FROM environment_sources s
LEFT JOIN environment_devices d ON d.source_id = s.id
LEFT JOIN environment_device_metrics m ON m.device_id = d.id
LEFT JOIN environment_metric_readings r ON r.metric_id = m.id
GROUP BY s.slug ORDER BY s.slug;
```

```sql
SELECT m.id, r.ten_minute_bucket, count(*)
FROM environment_metric_readings r
JOIN environment_device_metrics m ON m.id = r.metric_id
GROUP BY m.id, r.ten_minute_bucket
HAVING count(*) > 1;
```

最后一个查询应返回 0 行。保留任务 `environment-readings-retention` 同时清理旧、新环境读数，绝不清理博客表。

## 页面行为

- `/environment` 永远是 `home`；其他公开场所是 `/environment/<slug>`。
- 下拉切换会并行预取 latest/history，成功后才无刷新更新 URL；失败时保留旧快照和 URL。
- `home` 显示室内减室外差值；没有 comparison 的其他场所不渲染差值模块。
- 曲线鼠标悬停或手机按住拖动时只显示最近的一条曲线；键盘左右切时间、上下切设备、Esc 清除。
- 新鲜度阈值为 25 分钟。超过阈值的真实读数显示“延迟”，不会被伪装为实时。
