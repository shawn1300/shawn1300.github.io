# Komari 服务器状态页

博客的 /status 是独立页面，不使用博客 Header、Footer，也不会嵌入 Komari 后台。页面通过博客服务端读取 Komari 的最近状态接口，浏览器只访问同域的 /api/status。

## 安全边界

- 每台机器的 **Agent Token** 只用于该机器向 Komari 上报数据。
- 私有站点使用一枚 **Komari 面板 API Key**。它属于整个 Komari 面板，不是每台服务器一个；后续新增节点继续复用。
- API Key 只保存到 Vercel 的加密环境变量 `KOMARI_API_KEY`。**不要**写进代码、`KOMARI_NODES`、Git 仓库或任何 `NEXT_PUBLIC_` 变量。
- **不要**把 Agent Token 或管理员 Cookie 写入 Vercel 或提交到仓库。
- KOMARI_NODES 只保存节点 UUID 和允许公开展示的名称、地区、系统等信息。
- 本站 API 会清洗响应，不向浏览器返回节点 UUID、Agent Token、IP 地址、价格或私有备注。

## 首次配置

在 Vercel 项目进入 **Settings → Environment Variables**，为 Production、Preview、Development 添加：

    KOMARI_BASE_URL=https://monitor.example.com

    KOMARI_API_KEY=你的 Komari 面板 API Key

    KOMARI_NODES=[{"id":"11111111-1111-4111-8111-111111111111","name":"Oracle Phoenix","flag":"🇺🇸","location":"Phoenix","provider":"Oracle Cloud","os":"Ubuntu","arch":"amd64"}]

如果 Komari 已关闭“私有站点”，`KOMARI_API_KEY` 可以省略。开启私有站点时必须填写，博客服务端会用 `Authorization: Bearer` 请求 Komari，但不会把密钥返回给浏览器。

其中只有 id 和 name 必填。其他字段用于卡片显示：

| 字段 | 必填 | 作用 |
| --- | --- | --- |
| id | 是 | Komari 节点详情地址最后一段 UUID |
| name | 是 | 状态卡片名称，例如 Oracle Phoenix |
| flag | 否 | 国旗或地区符号，例如 🇺🇸 |
| location | 否 | 城市或机房，例如 Phoenix |
| provider | 否 | 服务商，例如 Oracle Cloud |
| os | 否 | 操作系统，例如 Ubuntu 24.04 |
| arch | 否 | 架构，例如 amd64 或 arm64 |

如果省略 os 和 arch，监控数据仍能正常显示，系统一栏会提示尚未配置。

## 以后新增一台机器

1. 在 Komari 后台创建节点，复制后台生成的 Agent 安装命令。
2. 只在新机器上运行安装命令，确认 Agent 已显示在线。
3. 打开该节点详情页。地址形如 https://monitor.example.com/instance/UUID，复制最后一段 UUID。
4. 打开 Vercel 的 KOMARI_NODES，在数组末尾追加一个对象。
5. 保存环境变量，然后重新部署一次 Production；Vercel 的环境变量变更只会应用到新部署。
6. 打开 https://你的博客域名/status，通常 15 秒内会出现新卡片。

双节点示例：

    [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "name": "Oracle Phoenix",
        "flag": "🇺🇸",
        "location": "Phoenix",
        "provider": "Oracle Cloud",
        "os": "Ubuntu",
        "arch": "amd64"
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "name": "Oracle Tokyo",
        "flag": "🇯🇵",
        "location": "Tokyo",
        "provider": "Oracle Cloud",
        "os": "Ubuntu",
        "arch": "arm64"
      }
    ]

Vercel 输入框也可以使用等价的单行 JSON。注意对象之间必须有逗号，整个内容只能有一对最外层方括号。

## 删除或改名

- 改名：只修改对应对象的 name，保存并重新部署。
- 删除：从数组中删除对应对象，注意同时处理相邻逗号，保存并重新部署。
- 调整顺序：改变数组内对象顺序，状态卡片会按相同顺序显示。

这些操作不会删除 Komari 后台节点，也不会停止机器上的 Agent。

## 检查与排错

先访问 /api/status：

- 返回 success: true：博客端配置和数据代理正常。
- 返回 STATUS_NOT_CONFIGURED：Vercel 缺少 KOMARI_BASE_URL 或 KOMARI_NODES。
- 返回 STATUS_API_KEY_INVALID：KOMARI_API_KEY 格式错误。
- 返回 STATUS_NODES_INVALID：JSON 格式、UUID 或字段类型错误。
- 页面显示离线：先在 Komari 后台确认节点在线，再检查 UUID 是否复制完整。
- 页面提示部分数据不可用：Komari、Cloudflare 或网络暂时不可达；页面会保留上一次成功数据并继续每 15 秒重试。

Komari 开启私有站点时，匿名请求 `/api/recent/UUID` 会返回 401；请配置面板 API Key，不要改用 Agent Token。
