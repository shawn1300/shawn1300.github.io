# Shawn's Blog

> 素白 · 极简 — 让阅读成为呼吸

个人博客 & 生活记录空间，基于 Next.js 16 + Supabase 构建。

**在线访问**：[shawn1300.cc.cd](https://shawn1300.cc.cd)

---

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | [Next.js 16](https://nextjs.org/) (App Router) |
| 语言 | TypeScript 5 |
| 样式 | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| 数据库 | [Supabase](https://supabase.com/) PostgreSQL |
| 认证 | Supabase Auth (email/password) |
| 存储 | Supabase Storage |
| 渲染 | react-markdown + highlight.js |
| 部署 | Vercel |

## 功能

- **博客文章** — Markdown 写作，代码高亮，分类 & 标签，归档时间线
- **日记** — 轻量日常记录，独立展示
- **相册** — 生活瞬间，图片画廊
- **评论** — 无需登录，匿名评论 (Supabase Realtime)
- **友链** — 朋友们的主页链接
- **全局搜索** — `Ctrl+K` 快捷搜索文章 & 日记
- **后台管理** — 分屏 Markdown 编辑器，草稿/发布状态，图片上传
- **多语言** — 简体中文、英文、日文手动切换，语言写入 Cookie，不读取浏览器语言
- **自动翻译** — DeepSeek 每天增量翻译，只翻译有变化的 Markdown 块
- **响应式** — 适配桌面 & 移动端
- **双主题** — 暖白亮色默认，可切换深炭蓝暗色，并保存主题偏好

## 项目结构

```
shawn1300/
├── app/                    # Next.js App Router
│   ├── [locale]/           # 语言路由（中文无前缀，英文 /en，日文 /ja）
│   │   ├── (blog)/         # 前台与后台页面
│   │   └── (celebration)/  # 独立庆祝页面
│   └── api/                # API Routes
├── components/             # React 组件
├── lib/                    # 工具函数 & Supabase 客户端
├── types/                  # TypeScript 类型定义
├── supabase/               # 数据库迁移文件
├── docs/                   # 项目文档
└── public/                 # 静态资源
```

## 本地开发

### 环境要求

- Node.js 20+
- npm / yarn / pnpm

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/shawn1300/shawn1300.github.io.git
cd shawn1300.github.io

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase 与 DeepSeek 配置

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看。

### 环境变量

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 站点
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# DeepSeek 自动翻译
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TRANSLATION_MODEL=deepseek-v4-flash
CRON_SECRET=一段随机长字符串

# Home Assistant 环境数据私有写入，仅配置在服务端
ENVIRONMENT_INGEST_TOKEN=另一段独立的随机长字符串

# 可选：手动同步并发数（默认 2，Cron 固定为 1）
TRANSLATION_CONCURRENCY=2
TRANSLATION_BATCH_CHARACTERS=2000
TRANSLATION_BATCH_ITEMS=16
```

`DEEPSEEK_TRANSLATION_MODEL` 不在代码中写死。DeepSeek 发布或调整模型 ID 后，以其控制台/API 文档显示的准确值为准。

### 初始化多语言数据库

部署新版代码前，在 Supabase SQL Editor 中执行：

```text
supabase/migrations/005_i18n_translations.sql
```

迁移会创建文章、日记、分类、标签的译文表，以及翻译运行记录和变更触发器。环境监测还需要按顺序执行 `supabase/migrations/006_environment_monitoring.sql`。Service Role Key 与 `ENVIRONMENT_INGEST_TOKEN` 只能配置在服务端环境变量中，不能使用 `NEXT_PUBLIC_` 前缀。

### 翻译运行方式

- Vercel Cron 使用 `0 18 * * *`（UTC），对应北京时间每天凌晨 2 点。
- 后台 `/admin/translations` 点击一次即可连续执行多轮；保持页面打开，直到全部完成或手动停止。
- 手动同步默认并发 2 个不同译文任务，遇到 429 自动降为单并发；每日 Cron 固定为单并发。
- 单个 DeepSeek 请求默认最多包含 2,000 个源字符和 16 个翻译块；请求超时后自动二分，并将后续任务降为单并发。
- 每个成功批次立即保存断点。长文章、函数超时或页面关闭后，下次只继续缺失的块。
- 后台会显示准确的等待数量、失败内容和错误原因，并支持单项或全部重试。
- 修改中文内容后，旧译文会标记为待处理；同步时按 Markdown 块哈希复用未变化部分。
- 英文或日文译文缺失/过期时，页面暂时显示中文原文和提示，不会出现空白页。
- 评论正文保持访客提交时的原语言，只翻译评论界面。

## 部署

一键部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

或手动构建：

```bash
npm run build
npm start
```

Vercel 项目还需要配置 `.env.example` 中的 Supabase、DeepSeek 和 `CRON_SECRET`。首次发布后可登录后台进入“自动翻译”，点击一次连续同步以生成已有内容的英文和日文译文。

环境监测的恢复入口与当前运维说明分别见 [`docs/environment-next-steps.md`](docs/environment-next-steps.md) 和 [`docs/environment-operations.md`](docs/environment-operations.md)。

## License

MIT © [shawn1300](https://github.com/shawn1300)
