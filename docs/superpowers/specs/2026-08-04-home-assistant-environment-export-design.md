# Home Assistant 环境数据导出设计

日期：2026-08-04  
状态：生产导出链路已完成并通过真实数据验收

## 1. 目标与已验证基线

本设计替换原环境监测规格中的旧式小米云登录与 GitHub Actions 采集路线。数据库、独立页面、公开只读接口、30 天历史和未来 VRChat OSC 的产品目标保持不变。

真实环境已经验证：

- 大阪服务器上的 Home Assistant `2026.7.4` 正常运行，约束在 768 MiB 内存内。
- 服务器的 `8123` 只绑定 `127.0.0.1`，管理页面只通过 SSH 隧道访问。
- 小米官方 Xiaomi Home `v0.4.7` 已通过 OAuth 2.0 登录中国大陆区共享账号。
- 两只 `LYWSD03MMC` 均以 `miaomiaoce.sensor_ht.t2` 被识别，每只都提供有效的温度、湿度和电量实体。
- Home Assistant 已改为公制，温度值使用摄氏度。

本阶段的目标是每 10 分钟把两只传感器的可信读数安全写入 Supabase，为 `/environment` 和未来 VRChat 只读接口提供数据。

## 2. 权限与管理边界

- Home Assistant 长期运行，但不开放公网管理入口；继续使用 SSH 隧道维护。
- Xiaomi Home 使用设备包含过滤，只在 Home Assistant 中保留室内和室外两只温湿度计。
- 设备过滤用于减少界面和自动化中的误操作面，不被视为小米账号级权限隔离。共享账号的 OAuth 权限仍可能覆盖米家中其他已共享设备。
- 不从 Home Assistant 逐个删除其他米家设备；删除只是本地行为且设备可能在同步后重新出现。
- 数据导出只读取传感器状态，不调用任何设备动作或控制服务。

## 3. 方案选择

采用“Home Assistant 自动化 → 私有写入 API → Supabase”。

未选择的方案：

- 大阪服务器 Python 采集器：需要额外保存权限较大的 Home Assistant 长期访问令牌，并增加定时进程。
- Home Assistant 直接写 Supabase：需要把 Supabase Service Role Key 放到大阪服务器，输入校验和错误处理也更弱。
- 网页直接读取 Home Assistant：要求公开 Home Assistant，破坏当前私有管理边界。

所选方案只要求 Home Assistant 保存一枚权限单一的写入密钥。Supabase Service Role Key 继续只存在于 Vercel 服务端。

## 4. 架构与组件

```text
LYWSD03MMC × 2
  → LX06
  → 中国大陆区小米云
  → Xiaomi Home 官方集成
  → Home Assistant 实体
  → 每 10 分钟一次的 HTTPS POST
  → Next.js /api/environment/ingest
  → Supabase 私有环境表
  → latest/history 只读 API
  → /environment 与未来 VRChat 桥接
```

组件边界：

1. **Xiaomi Home 集成**只负责从小米云维护两只传感器的状态。
2. **Home Assistant 自动化**只负责定时读取状态并发送一个批量请求。
3. **私有写入 Route Handler**只负责认证、校验、幂等和数据库写入，不具备米家控制能力。
4. **Supabase**保存最近 30 天的规范化读数，且与旧 ESP32 表隔离。
5. **公开只读 Route Handlers**只投影网页和 VRChat 所需的安全字段。

## 5. Home Assistant 导出

### 5.1 设备过滤

在 Xiaomi Home 的配置选项中使用设备“包含”模式，只选择两只 `miaomiaoce.sensor_ht.t2`。过滤完成后必须再次验证两只设备的三个实体仍有值且持续更新；其他空调、风扇和音箱不应出现在 Home Assistant 的设备与实体列表中。

### 5.2 调度

- 使用 Home Assistant 原生时间模式自动化，每 10 分钟触发一次。
- 一次触发只发送一个批量请求，不为每个属性创建独立请求。
- 请求失败时不立即循环重试，等待下一个 10 分钟周期。
- 允许人工从 Home Assistant 触发该自动化，用于首次验收和故障排查。

### 5.3 密钥

- 专用 `ENVIRONMENT_INGEST_TOKEN` 生成至少 32 字节随机值。
- Home Assistant 端只把它保存在 `/config/secrets.yaml`，并通过 `!secret` 引用。
- Vercel 端只把它保存在服务端环境变量中。
- 密钥不得进入仓库、聊天、Home Assistant 日志、浏览器响应或 Supabase 表。
- 轮换时先同时更新 Vercel 与 Home Assistant，然后重新加载自动化并手动验证一次。

### 5.4 请求负载

`POST /api/environment/ingest` 使用 HTTPS 和 `Authorization: Bearer`。请求体固定为版本化结构：

```json
{
  "schemaVersion": 1,
  "sentAt": "2026-08-04T14:50:00Z",
  "readings": [
    {
      "role": "indoor",
      "temperatureC": 26.3,
      "humidityPercent": 37.5,
      "batteryPercent": 100,
      "sourceUpdatedAt": "2026-08-04T14:49:31Z"
    },
    {
      "role": "outdoor",
      "temperatureC": 24.8,
      "humidityPercent": 52.1,
      "batteryPercent": 100,
      "sourceUpdatedAt": "2026-08-04T14:49:28Z"
    }
  ]
}
```

示例值只说明数据形状，不作为生产种子或页面占位数据。

实体为 `unknown`、`unavailable`、非数字或缺失时，Home Assistant 发送 `null` 而不是 `0`。`sourceUpdatedAt` 使用温度实体的 `last_updated` 作为该传感器本轮云状态更新时间；数据库另行记录服务端实际接收时间。

请求中不得包含小米 DID、Home Assistant 实体 ID、家庭 ID、账号 ID、设备名称或 OAuth 材料。

## 6. 私有写入 API

### 6.1 请求认证

- 只接受 `POST` 和 `application/json`。
- 请求体大小限制为 16 KiB。
- 服务端以固定时间比较 Bearer Token；缺失或错误时返回通用 `401`。
- 令牌验证失败前不解析或记录读数正文。
- 日志只记录请求结果、有效角色数量、错误分类和耗时。

### 6.2 输入校验

- `schemaVersion` 必须为 `1`。
- `role` 只能是 `indoor` 或 `outdoor`，同一请求中不得重复。
- 温度范围为 `-30..100 °C`。
- 湿度范围为 `0..100%`。
- 电量范围为 `0..100%`；电量缺失允许继续保存温湿度。
- 温度或湿度缺失时只跳过该角色，不影响另一角色。
- `sentAt` 和 `sourceUpdatedAt` 必须是合法 UTC 时间，且不得明显位于服务端未来。
- 如果两个角色都无有效温湿度，返回 `422` 且不写入。

### 6.3 幂等与部分成功

服务端按传感器角色和服务端接收时间所属的 10 分钟 UTC 时间桶生成幂等键。同一时间桶内的重复请求执行 upsert，不产生重复记录。

每个角色独立校验和写入。响应只返回固定角色的 `stored`、`skipped` 或 `duplicate` 状态，不返回数据库主键、内部错误、设备 ID或密钥内容。

## 7. Supabase 数据与保留策略

继续使用原环境监测规格定义的独立表：

- `environment_locations`
- `environment_sensors`
- `environment_readings`

只创建 `home` 场所及 `indoor/outdoor` 两个传感器角色。内部映射不保存小米 DID或 Home Assistant 实体 ID。

约束：

- `(sensor_id, idempotency_key)` 唯一。
- 数据库再次执行温度、湿度和电量范围约束。
- 环境表启用 RLS，不授予匿名写入或原始表读取权限。
- 写入和服务端投影使用现有服务端 Supabase 管理客户端。

Supabase Cron 每天执行一次清理，删除 `collected_at < now() - interval '30 days'` 的读数。清理独立于采集；即使 Home Assistant 停止发送，旧数据仍按期删除。

实施 migration 前必须先确认当前 Supabase 项目允许启用 Cron/`pg_cron`。若不可用，停止在清理任务部署门，不得静默省略保留策略；届时通过一份设计修订改用受 `CRON_SECRET` 保护的每日 Vercel Cron。

## 8. 新鲜度与公开读取

- 数据库同时保存 `source_updated_at` 和 `collected_at`。
- 页面优先用 `source_updated_at` 表示小米云状态更新时间，用 `collected_at` 诊断导出链路。
- 自动化持续提交同一个旧状态不能把它伪装成新状态。
- `latest` 和 `history` API 只返回场所、角色、规范化数值、时间和派生新鲜度。
- 公开响应不得包含 Home Assistant 实体 ID、内部传感器 ID、小米标识、账号信息或错误堆栈。
- 现有页面设计中的正常、延迟、离线和部分数据状态保持不变。

## 9. 失败行为

- 单个实体不可用：该角色跳过，另一角色继续。
- 两个角色均不可用：写入接口返回 `422`，历史数据保留。
- 认证失败：返回 `401`，不写入、不泄漏令牌匹配细节。
- Supabase 暂时失败：返回通用 `503`，Home Assistant 等待下一周期；不进行高频重试。
- Home Assistant 或小米云停止更新：公开页面根据源更新时间显示延迟或离线，不补假数据。
- 设备过滤导致传感器消失：恢复 Xiaomi Home 配置并停止导出部署，不能改为读取其他家电实体。
- 写入密钥疑似泄漏：轮换专用令牌，不需要轮换小米 OAuth 或 Supabase Service Role Key。

## 10. 测试与验收

### 10.1 自动化测试

- Route Handler：方法、媒体类型、体积限制、正确和错误令牌、畸形 JSON、版本、角色重复、数值范围、时间解析、部分有效、全部无效和安全错误响应。
- 数据层：角色映射、幂等 upsert、部分写入、数据库约束和 30 天清理。
- 安全断言：日志和所有响应不包含测试令牌、实体 ID、小米标识或数据库错误。
- 公开 API：最新值、24 小时和 7 天历史、部分数据、新鲜度以及内部字段投影。

### 10.2 真实环境验收

1. Xiaomi Home 设备过滤后只保留两只温湿度计，三个实体均正常更新。
2. 手动触发一次自动化，Supabase 分别出现室内和室外真实读数。
3. 形成至少三个不同的 10 分钟时间桶，且同一时间桶重复触发不会新增记录。
4. 暂时模拟一只角色不可用，另一只仍成功写入。
5. 错误密钥请求被拒绝，Home Assistant 和 Vercel 日志没有秘密值。
6. 清理任务只删除 30 天以前的环境读数，不影响博客表和旧 ESP32 表。
7. 公开 API 足以让未来 VRChat 桥接生成室内外温湿度播报，不需要访问 Home Assistant。

## 11. 旧路线处理

- `micloud`、MiService、浏览器捕获、Edge 诊断和 `ssecurity` 代码已从当前工作树移除，只保留在 Git 历史中。
- 不创建或上传 `.collector-credentials.json`，不配置旧 `MI_*` GitHub Secrets。
- 不启用旧 GitHub Actions 小米采集工作流。
- 原环境监测规格中的数据库、页面、主题、公开 API 和 VRChat 契约继续有效；旧认证与 GitHub Actions 采集章节由本设计取代。
- 实施计划必须从数据库和私有写入 API 开始重写，不执行旧计划中的 bootstrap 和旧云采集任务。

## 12. 实施结果

1. Home Assistant 设备过滤、摄氏度读数和私有 SSH 隧道已验证。
2. Supabase schema、约束、RLS、种子与每日清理已部署。
3. 私有写入 Route Handler 已测试并部署，匿名请求固定返回 `401`。
4. Vercel 与 Home Assistant 已配置同一枚专用写入密钥。
5. `rest_command` 与每 10 分钟自动化已生效。
6. 室内外各形成三个真实时间桶，重复触发幂等验证通过。
7. 剩余工作是公开 API 与独立 `/environment` 页面，入口见 `docs/environment-next-steps.md`。
8. 当前运维流程见 `docs/environment-operations.md`。
