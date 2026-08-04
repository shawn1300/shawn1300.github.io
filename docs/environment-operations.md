# 环境监测运维说明

本页先记录真实设备可行性验证所需的安全步骤。数据库迁移、定时采集和故障恢复说明会在对应实现完成后继续补充。

## 安全边界

- 不要把小米账号密码、`serviceToken`、`ssecurity`、设备 DID 或 Supabase Service Role Key 发到聊天中。
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

若小米要求短信或邮箱验证，程序会先校验验证地址必须严格属于 `https://account.xiaomi.com`，再用默认浏览器打开完整挑战地址。终端只显示不含查询参数的官方路径。请在官方页面请求一次性验证码，再回到仍在运行的终端输入；验证码采用隐藏输入且不会保存。不要把验证页面地址或验证码发送到聊天、Issue 或日志中。

当前 bootstrap 不处理图片验证码。若提示需要图片验证码，请停止重试，不要尝试输出原始小米登录响应。

成功后会生成已被 Git 忽略的 `.collector-credentials.json`。该文件不包含密码，但仍包含可访问小米云的会话材料，必须按密码对待。

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
