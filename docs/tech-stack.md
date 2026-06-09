# 技术规范

## 1. 技术栈

| 层面 | 技术 | 版本要求 |
|------|------|----------|
| 前端框架 | Next.js (App Router) | 15.x |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 4.x |
| UI 组件 | Shadcn UI | latest |
| 数据库 | Supabase PostgreSQL | — |
| 认证 | Supabase Auth | — |
| 存储 | Supabase Storage | — |
| 部署 | Vercel | — |
| DNS/防护 | Cloudflare | — |

## 2. 核心依赖

```json
{
  "next": "^15",
  "react": "^19",
  "react-dom": "^19",
  "react-markdown": "^9",
  "remark-gfm": "^4",
  "rehype-highlight": "^7",
  "rehype-slug": "^6",
  "rehype-raw": "^7",
  "@supabase/supabase-js": "^2",
  "@supabase/ssr": "^0.5",
  "date-fns": "^4",
  "slugify": "^1"
}
```

## 3. 数据库表设计

详见方案文件中的数据库设计章节。SQL 迁移文件位于 `supabase/migrations/001_initial.sql`。

## 4. 认证方案

- **读者侧**：无需登录，匿名评论
- **博主侧**：Supabase Auth email/password 登录
- **路由保护**：Next.js Middleware 拦截 `/admin/*`，检查 session cookie
- **服务端验证**：API Route 中通过 service_role key 操作数据库
