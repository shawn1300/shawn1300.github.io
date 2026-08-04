# MiService 3.0.2 aiohttp 原版 CLI 验证设计

## 目标

使用作者原版 `MiService 3.0.2` 命令行入口和官方可选的 `aiohttp` 会话，再验证一次中国大陆区共享小号登录、目标设备列举及 MIoT 温湿度读取。本轮不使用项目的脱敏探针，不修改 MiService 源码。

## 固定版本与环境

- 继续使用独立 `.venv-miservice`。
- MiService 固定为官方提交 `ca45b578a450725214613743f8a7c311eeb0bbf5`，其包版本为 3.0.2。
- 在该虚拟环境安装 MiService 官方可选依赖 `aiohttp`，运行前确认 `aiohttp` 可导入。
- 直接执行虚拟环境中的 `miservice.exe`，由原版 CLI 创建 `aiohttp.ClientSession`。

## 凭据和输出风险

- PowerShell 使用隐藏输入读取共享小号和密码，再临时设置当前进程的 `MI_USER`、`MI_PASS`；命令结束后立即清除两个环境变量。
- 原版 CLI 的 OTP 输入会显示在当前终端，不把验证码复制到聊天或保存到文档。
- 原版 CLI 将会话保存为用户目录下的 `.mi.token`。该文件包含敏感会话材料，验证后先保留以避免重复登录，不读取、不提交到仓库。
- `miservice list` 会在本地终端显示设备名称、DID 和设备 Token。用户不得把完整输出、DID、Token、账号或 `.mi.token` 内容发送到聊天。
- 当前未跟踪二维码文件保持不变。

## 验证步骤

1. 隐藏设置 `MI_USER` 和 `MI_PASS`。
2. 直接运行 `miservice.exe list`。
3. 若原版流程要求短信或邮箱验证码，最多完成当前命令所需的一次交互；若出现第二次验证码、图片验证码或限流，立即按 `Ctrl+C`。
4. 若列表成功，在本地识别两个 `miaomiaoce.sensor_ht.t2`，不对外发送其 DID 或 Token。
5. 在当前 PowerShell 临时设置其中一个 DID 为 `MI_DID`，直接运行 `miservice.exe 2-1,2-2,3-1`；随后对第二个 DID 重复读取。
6. 只允许向聊天报告固定错误码/错误类型，或两组温度、湿度和可选电量值。
7. 清除 `MI_USER`、`MI_PASS` 和 `MI_DID` 环境变量。

## 成功与停止条件

成功必须同时满足：原版 CLI 登录成功、列出两只共享的精确目标型号、两只设备均返回合理温湿度。

以下任一情况出现即停止，不继续扩展认证：

- 密码步骤未进入 OTP 且原版 CLI 登录失败；
- 图片验证码、第二次 OTP、限流或安全验证循环；
- 登录成功但共享目标不可见；
- 目标可见但温湿度属性不可用。

失败后转向小米官方 Home Assistant OAuth 或新增本地 BLE 接收器。
