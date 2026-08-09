# Home Assistant 环境 v2 模板

这是一份可复制的 Home Assistant package。它每十分钟筛选有效实体，合并为一个 v2 请求并上传到网站接口。它不会把 `unknown`、`unavailable` 或其他非数字状态转换成 `0`。

本模板不会替换当前“家”的 v1 自动化。只有为新来源完成元数据、迁移和令牌配置后，才把副本安装到目标 Home Assistant。

## 文件

- `environment-v2-package.yaml`：`rest_command`、设备映射和十分钟自动化。
- `configuration.example.yaml`：启用 packages 的配置片段。
- `secrets.example.yaml`：Bearer 来源令牌的秘密键示例。

## 安装

1. 先按 [`docs/environment-configuration-guide.md`](../../../docs/environment-configuration-guide.md) 添加场所、来源、设备和指标，执行审阅过的迁移，并保存来源令牌。
2. 为 `/config/configuration.yaml`、`/config/secrets.yaml` 和现有自动化创建带时间戳的备份。
3. 如果尚未启用 packages，把 `configuration.example.yaml` 中的 `homeassistant.packages` 合并进 `/config/configuration.yaml`。不要创建第二个 `homeassistant:` 根键。
4. 把 `environment-v2-package.yaml` 复制到 `/config/packages/`，使用全局唯一的文件名。
5. 只编辑 package 中标出的 `ENVIRONMENT DEVICE CONFIGURATION`：
   - `device` 必须与 `config/environment.ts` 中的设备 slug 完全一致；
   - 实体 ID 必须来自目标 Home Assistant；
   - 不存在的指标保持空字符串；
   - 添加设备时复制完整的设备项。
6. 把 `secrets.example.yaml` 的键加入 `/config/secrets.yaml`，将占位值替换为完整的 `Bearer <来源令牌>`。

## 检查与启用

先检查配置，成功后才能重启：

```bash
docker exec homeassistant \
  python -m homeassistant --script check_config --config /config
cd ~/homeassistant
docker compose restart
```

重启后在“自动化与场景”中手动运行 `Environment v2: upload every 10 minutes`。检查：

```bash
docker logs --since 15m homeassistant 2>&1 \
  | grep -Ei 'ERROR|CRITICAL|environment_v2|rest_command|timeout'
```

正常响应为 `200`。`401` 检查来源令牌，`422` 检查设备映射、实体和值，`503` 等待下一周期，不要高频重试。

在公开场所页面确认连续三个十分钟窗口前进，并确认实体不可用时页面不会出现伪造的 `0`。

## 回滚

如果检查或启动失败，移除新复制的 package，恢复三个配置备份，再次运行 `check_config` 后重启容器。不要删除 `/config/.storage` 或 Xiaomi OAuth 数据。

令牌只存在于 `/config/secrets.yaml`。不要把 Supabase Key、Home Assistant 长期访问令牌、真实实体 ID 或令牌提交到 Git、聊天或截图。
