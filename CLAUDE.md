# CLAUDE.md — 项目导航与工作规范

## 项目概览

暖白亮色默认、可切换深色的极简个人博客系统。技术栈见 [docs/tech-stack.md](docs/tech-stack.md)。

## 关键文件索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 项目需求 | [docs/requirements.md](docs/requirements.md) | 功能需求清单 |
| 技术规范 | [docs/tech-stack.md](docs/tech-stack.md) | 技术栈、架构、数据库设计 |
| 设计规范 | [docs/design-spec.md](docs/design-spec.md) | 双主题、排版、间距、色板 |
| 执行计划 | [docs/implementation-plan.md](docs/implementation-plan.md) | 分步执行清单 |
| 开发日志 | [.devlog/](.devlog/) | 每日开发记录 |

## 工作约定

1. **写代码前先读规范**：每次修改代码前，确认对应功能在 `docs/` 中的规范要求
2. **写完即记录**：每完成一个功能模块，在 `.devlog/` 下创建日期日志记录已完成事项
3. **保持极简**：设计、代码、交互都遵循「少即是多」——不添加计划外的装饰
4. **双主题一致**：暖白亮色为默认，深炭蓝暗色可切换；组件使用语义色变量，不写死单一主题色
5. **服务端优先**：数据获取优先使用 Server Components，客户端组件只在需要交互时使用

## 项目目录结构

```
shawn1300/
├── app/                    # Next.js App Router 页面
│   ├── admin/              # 后台管理（受 Auth 保护）
│   ├── posts/              # 文章详情页
│   └── api/                # API Routes
├── components/             # 组件
│   ├── ui/                 # Shadcn UI 组件
│   ├── layout/             # 布局组件
│   ├── posts/              # 文章组件
│   ├── comments/           # 评论组件
│   └── admin/              # 后台组件
├── lib/                    # 工具函数
│   └── supabase/           # Supabase 客户端
├── types/                  # TypeScript 类型
├── supabase/               # 数据库迁移
├── docs/                   # 项目文档
└── .devlog/                # 开发日志
```
