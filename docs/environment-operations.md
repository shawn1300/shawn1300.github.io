# 环境监测运维说明

> **历史文档警告（2026-08-04）：** 下文的 `micloud`、`ssecurity`、浏览器导入和 Edge 捕获步骤均已停止使用，不要继续执行。真实设备已经通过大阪服务器上的 Home Assistant 与小米官方 Xiaomi Home 集成验证。当前生产方向见 [`docs/superpowers/specs/2026-08-04-home-assistant-environment-export-design.md`](superpowers/specs/2026-08-04-home-assistant-environment-export-design.md)；完成新实现后，本页将改写为 Home Assistant、私有写入 API 和 Supabase 的运维流程。

本页先记录真实设备可行性验证所需的安全步骤。数据库迁移、定时采集和故障恢复说明会在对应实现完成后继续补充。

## 安全边界

- 不要把小米账号密码、`passToken`、`serviceToken`、`ssecurity`、设备 DID 或 Supabase Service Role Key 发到聊天中。
- 不要把这些值写进仓库、Issue、Actions 日志或公开网页。
- 定时任务只保存会话材料，不保存小米账号密码。
- 优先使用一个专用中国大陆区小米账号，并把米家“家”共享给它。

## 本机生成一次性会话

在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r collector\requirements.txt
.\.venv\Scripts\python.exe -m collector.environment_collector.bootstrap
```

程序会在本机提示输入账号和密码，列出型号为 `miaomiaoce.sensor_ht.t2` 的设备，并要求选择室内与室外。完整 DID 不会打印到终端。

若小米先要求图片验证码，程序会从严格校验过的 `https://account.xiaomi.com` 地址读取一次图片，在系统临时目录创建随机文件并用默认查看器打开。回到仍在运行的终端输入图片字符；输入采用隐藏模式。临时图片会在输入后立即删除，且每次 bootstrap 最多提交一次，避免循环尝试触发账号风控。

图片验证码通过后，若小米继续要求短信或邮箱验证，程序会在同一会话中校验官方地址并打开验证页面。请在官方页面请求一次性验证码，再回到终端输入；验证码同样不回显、不保存。不要把验证页面地址、验证码图片或验证码发送到聊天、Issue 或日志中。

### 浏览器官方响应导入

若正常 bootstrap 已触发短信限流，或验证成功后仍缺少 `ssecurity`，请停止重复登录，并在刚刚完成小米验证的同一个浏览器配置文件中打开：

```text
https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true
```

确认页面是一行 JSON，可能以 `&&&START&&&` 开头，也可能直接从 `{` 开始，并且可以在本机搜索到 `passToken`。不要点击 JSON 中的 `location`，也不要把页面内容、截图或字段值发送到聊天。如果找不到 `passToken`，说明当前浏览器会话不足以完成桥接；请停止，不要把其他 Cookie 导出或发到聊天。

在项目根目录运行：

```powershell
.\.venv\Scripts\python.exe -m collector.environment_collector.browser_bootstrap
```

在隐藏提示后粘贴完整的一行 JSON 并按 Enter。程序只在内存中临时使用 `userId + passToken`，并且只把它们附加到一次小米账号会话刷新请求；随后使用刷新得到的 `ssecurity + location` 换取云会话，再进入与普通 bootstrap 相同的室内外设备选择和真实读取流程。`passToken` 不会写入凭证文件、客户端属性或日志。粘贴内容不会显示；不要把 JSON 直接写进 PowerShell 命令参数或文件。

命令结束后清空剪贴板：

```powershell
Set-Clipboard -Value ''
```

成功后会生成已被 Git 忽略的 `.collector-credentials.json`。该文件不包含密码，但仍包含可访问小米云的会话材料，必须按密码对待。

### 临时 Edge 登录捕获

如果浏览器官方响应中没有 `passToken` 和 `ssecurity`，请停止重复登录和请求验证码。等待验证码冷却恢复后，在项目根目录运行一次：

```powershell
.\.venv\Scripts\python.exe -m collector.environment_collector.edge_bootstrap
```

程序会使用已安装的 Microsoft Edge 打开一个可见、非持久化的临时会话；不需要也不要运行 `playwright install`。请只在新打开的小米官方页面中输入小号的账号、密码和验证码，不要在终端输入或粘贴这些内容。程序不会读取日常浏览器配置、表单字段或请求体。

登录过程中不要关闭临时 Edge 窗口。程序只监听小米官方登录响应中短暂出现的云端会话材料；成功后会先关闭 Edge，再列出温湿度计并要求选择室内和室外设备。等待上限为 10 分钟；失败、超时或关窗后不要立即重复请求验证码，只把终端最后一行脱敏错误用于排查。

该流程不会保存浏览器 storage state、完整 Cookie、密码、验证码或 `passToken`。最终仍只生成与其他 bootstrap 相同的 `.collector-credentials.json`。

如果网页登录结束并显示 `ok`，但严格 Edge 命令没有继续，请按 `Ctrl+C` 结束它，不要立即重复请求验证码。冷却恢复后改为运行一次独立诊断命令：

```powershell
.\.venv\Scripts\python.exe -m collector.environment_collector.edge_diagnostic
```

诊断命令只观察精确 `https://account.xiaomi.com` 源的小型 JSON 响应，终端只显示查询参数已删除、数字已脱敏的路径、状态码和固定字段存在标记。它不输出字段值、响应正文或 Cookie。若捕获到完整会话会直接进入设备选择；若只检测到云端 Cookie，会在 5 秒后结束，不再无提示等待 10 分钟。

排查时可以提供所有以 `Diagnostic #` 开头的行和最后一行错误；不要提供浏览器截图、开发者工具内容、其他终端输出或任何 JSON/Cookie。确认实际接口后，应修正正式白名单，不长期使用诊断命令。

## 安全上传到 GitHub Secrets

先安装并登录 GitHub CLI，然后在项目根目录使用 PowerShell：

```powershell
$environmentSecrets = Get-Content -Raw -Encoding UTF8 '.collector-credentials.json' | ConvertFrom-Json
$environmentSecrets.psobject.Properties | ForEach-Object {
  $_.Value | gh secret set $_.Name
}
```

这段命令通过标准输入上传值，不会把值写进命令参数。完成后在 GitHub 仓库的 Actions secrets 页面确认以下名称存在：

- `MI_USER_ID`
- `MI_SERVICE_TOKEN`
- `MI_SSECURITY`
- `MI_INDOOR_DID`
- `MI_OUTDOOR_DID`
- `MI_COUNTRY`

Supabase 所需的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 会在定时采集实现完成后一起配置。

确认 Secrets 已保存后，可以删除本机 `.collector-credentials.json`；需要刷新过期会话时再重新运行 bootstrap。
