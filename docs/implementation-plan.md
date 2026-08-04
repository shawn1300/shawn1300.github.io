# 执行计划

## 阶段 1：项目脚手架
- [ ] 使用 create-next-app 初始化项目（TypeScript + Tailwind + App Router）
- [ ] 安装核心依赖（react-markdown, supabase, date-fns, slugify 等）
- [ ] Shadcn UI init + 添加所需组件
- [ ] 配置 Tailwind CSS 4 与基于 class 的亮暗主题
- [ ] 编写 globals.css 暖白默认 + 深炭蓝暗色语义变量

## 阶段 2：Supabase 基础设施
- [ ] 封装 Browser / Server / Middleware 三种 Supabase 客户端
- [ ] 创建 .env.local 环境变量模板
- [ ] 编写 SQL 迁移文件（categories, tags, posts, post_tags, comments + RLS）
- [ ] 定义 TypeScript 类型

## 阶段 3：前端核心
- [ ] 根布局 + Header + Footer
- [ ] 首页文章列表 + PostCard
- [ ] 文章详情页 + Markdown 渲染
- [ ] 评论表单 + 评论列表 + Realtime 订阅

## 阶段 4：后台 CMS
- [ ] Middleware 路由保护
- [ ] 登录页面
- [ ] 后台布局 + 侧边栏导航
- [ ] 文章管理列表
- [ ] 分屏 Markdown 编辑器（新建/编辑）
- [ ] 图片上传组件
- [ ] 分类 & 标签管理

## 阶段 5：收尾
- [ ] SEO 元数据（generateMetadata / sitemap / robots）
- [ ] 响应式适配
- [ ] Vercel 部署配置
