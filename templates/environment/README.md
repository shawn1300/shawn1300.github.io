# 环境数据源可复用模板

这里提供两套只面向**新来源**的复制模板：

- [`esp32/station-template`](esp32/station-template/README.md)：公共上传核心，加 SHT30/PMS5003 可运行示例。
- [`home-assistant`](home-assistant/README.md)：一份 v2 package，集中配置设备 slug 和实体 ID。

当前生产链路已经验证：

- “家”由 Home Assistant v1 自动化每十分钟上传室内/室外温湿度；
- “宿舍”由 ESP32 经 Supabase Edge Function 中转上传温度、湿度和 PM2.5，并连续通过三个真实窗口。

这些生产实现是已验证基线，不是要被模板覆盖的目标。复制模板时不要修改 `firmware/dormitory-air-station`，也不要把新 package 直接放进现有 Home Assistant。

## 共同上线顺序

1. 在 [`config/environment.ts`](../../config/environment.ts) 添加场所、来源、设备和指标。
2. 运行配置验证，生成并逐行审阅迁移。
3. 生成来源令牌：摘要写入数据库，明文只进入目标设备的秘密配置。
4. 复制 ESP32 或 Home Assistant 模板。
5. 只编辑模板说明指定的公开配置和本地秘密配置。
6. 先完成本地编译或 Home Assistant `check_config`，再安装到目标设备。
7. 验证连续三个十分钟窗口、公开页面“新鲜”状态和不含秘密的日志。

完整的元数据、迁移、令牌和查询步骤见 [`docs/environment-configuration-guide.md`](../../docs/environment-configuration-guide.md)。

## 安全边界

- ESP32 正式上传入口是现有 Supabase Edge Function 中转；设备只持有来源令牌。
- Home Assistant 使用网站 v2 接口；服务器只持有来源令牌。
- 两边都不得持有 Supabase anon、publishable、secret 或 service-role key。
- 示例文件只能包含占位符；真实秘密文件不得提交或复制到聊天。
- 上传失败等待下一周期，不补造数据，也不把无效状态当成 `0`。
