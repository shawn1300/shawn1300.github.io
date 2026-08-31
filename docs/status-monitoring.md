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
| flag | 否 | 国旗或地区代码，例如 🇺🇸、🇯🇵、US、JP |
| location | 否 | 城市或机房，例如 Phoenix |
| provider | 否 | 服务商，例如 Oracle Cloud |
| os | 否 | 操作系统，例如 Ubuntu 24.04 |
| arch | 否 | 架构，例如 amd64 或 arm64 |

如果省略 os 和 arch，监控数据仍能正常显示，系统一栏会提示尚未配置。

### 内置 SVG 国旗

状态页会把常用国家与地区转换为博客内置的 SVG 旗帜，因此不依赖 Windows 的国旗 Emoji 支持。flag 既可以填写 Emoji，也可以填写两位代码；为了方便在电脑上编辑，推荐直接使用两位代码。

| 国家或地区 | 推荐代码 | 也支持 |
| --- | --- | --- |
| 美国 | US | 🇺🇸 |
| 日本 | JP | 🇯🇵 |
| 新加坡 | SG | 🇸🇬 |
| 中国大陆 | CN | 🇨🇳 |
| 香港 | HK | 🇭🇰 |
| 台湾 | TW | 🇹🇼 |
| 韩国 | KR | 🇰🇷 |
| 英国 | GB 或 UK | 🇬🇧 |
| 德国 | DE | 🇩🇪 |
| 法国 | FR | 🇫🇷 |
| 荷兰 | NL | 🇳🇱 |
| 加拿大 | CA | 🇨🇦 |
| 澳大利亚 | AU | 🇦🇺 |
| 印度 | IN | 🇮🇳 |
| 巴西 | BR | 🇧🇷 |
| 瑞士 | CH | 🇨🇭 |

如果填写的值不在上表中，页面会回退为普通文字或 Emoji，不会影响服务器监控数据。

## 以后新增一台机器

1. 在 Komari 后台创建节点，复制后台生成的 Agent 安装命令。
2. 只在新机器上运行安装命令，确认 Agent 已显示在线。
3. 打开该节点详情页。地址形如 https://monitor.example.com/instance/UUID，复制最后一段 UUID。
4. 进入 Vercel 项目的 **Settings → Environment Variables**，找到 KOMARI_NODES 并点击 Edit。
5. 先复制并备份输入框里的完整旧值，然后在数组最后一个 } 后面添加英文逗号和新节点对象。
6. 保存环境变量，然后重新部署一次最新的 Production Deployment；Vercel 的环境变量变更只会应用到新部署。
7. 打开 https://你的博客域名/status，通常 15 秒内会出现新卡片。

追加节点对象模板：

    {
      "id": "从 Komari 节点详情页复制的 UUID",
      "name": "Oracle 新地区",
      "flag": "两位国家或地区代码",
      "location": "城市名称",
      "provider": "Oracle Cloud",
      "os": "Ubuntu 24.04.4 LTS",
      "arch": "amd64"
    }

新增服务器时不需要创建新的 KOMARI_API_KEY，也不要修改 KOMARI_BASE_URL。每台机器只有节点 UUID 和 Agent Token 不同；Agent Token 仍然只保留在对应机器上，不能放进 KOMARI_NODES。

双节点示例：

    [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "name": "Oracle Phoenix",
        "flag": "US",
        "location": "Phoenix",
        "provider": "Oracle Cloud",
        "os": "Ubuntu 24.04.4 LTS",
        "arch": "amd64"
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "name": "Oracle Osaka",
        "flag": "JP",
        "location": "Osaka",
        "provider": "Oracle Cloud",
        "os": "Ubuntu 24.04.4 LTS",
        "arch": "amd64"
      }
    ]

Vercel 输入框也可以使用等价的单行 JSON。注意对象之间必须有逗号，整个内容只能有一对最外层方括号。

### 保存后的检查清单

- KOMARI_NODES 最外层仍然是 [ 和 ]。
- 每个节点对象之间有英文逗号。
- 每台服务器使用不同的 UUID，名称也尽量不同。
- KOMARI_API_KEY、KOMARI_BASE_URL 保持原值。
- Vercel 环境变量保存后已重新部署 Production。
- /status 出现新卡片，国旗、在线状态和指标正常。
- 如果电脑仍显示旧页面，按 Ctrl + F5 强制刷新一次。

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
