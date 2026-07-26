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
- **响应式** — 适配桌面 & 移动端
- **纯暗黑** — always dark，专注阅读

## 项目结构

```
shawn1300/
├── app/                    # Next.js App Router
│   ├── (blog)/             # 前台页面
│   │   ├── admin/          # 后台管理 (受 Auth 保护)
│   │   ├── posts/          # 文章详情
│   │   ├── diaries/        # 日记
│   │   ├── gallery/        # 相册
│   │   ├── friends/        # 友链
│   │   ├── about/          # 关于
│   │   ├── archive/        # 归档
│   │   └── categories/     # 分类
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
# 编辑 .env.local，填入 Supabase 项目 URL 和 anon key

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
```

## 部署

一键部署到 Vercel：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

或手动构建：

```bash
npm run build
npm start
```

## License

MIT © [shawn1300](https://github.com/shawn1300)
