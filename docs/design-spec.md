# 设计规范 — 素白 · 极简

## 1. 设计哲学

- **留白**：大量的空间让步于内容，让阅读成为呼吸
- **质朴**：微暖的纸白底色，干净的线条，不添加任何多余装饰
- **克制**：少即是多——颜色、线条、动效皆以"必要性"为准则

## 2. 色板

```
背景层级：
  根背景:     #fafaf7 (微暖纸白，非纯白)
  卡片/表面:  #ffffff (纯白)
  悬浮态:     #f5f5f4 (中性浅灰)
  边框:       #e7e5e4 (极淡，近乎无形)

文字层级：
  主文字:     #3d3935 (墨色，非纯黑)
  次文字:     #78716c (中灰)
  辅助文字:   #a8a29e (浅灰)
  链接:       #3d3935 (与主文字同色，下划线区分)

强调色：
  Primary:    #3d3935 → 按钮、主交互
  Secondary:  #f5f5f4 → 次要元素
  Destructive: 软红 → 删除/错误
```

## 3. 字体

```
标题: Geist Sans (font-weight 500-600)
正文: Geist Sans (font-weight 400)
代码: Geist Mono
字号: 正文 16px / 行高 1.75 / 代码 14px
```

## 4. 间距系统

```
页面最大宽度：672px (文章内容) / 1024px (首页列表)
页面内边距：24px (移动端) / 48px (桌面端)
组件间距：16px / 24px / 32px / 48px / 64px
卡片内边距：24px
```

## 5. 组件规范

- 圆角：统一 `rounded-lg` (8px)
- 边框：`border border-neutral-200` — 淡到几乎看不见
- 阴影：不使用阴影，以留白和边框区分层级
- 动效：transition 150ms ease，hover 轻微变暗

## 6. Shadcn UI 主题配置

```css
--background: oklch(0.985 0.002 95);
--foreground: oklch(0.23 0.005 95);
--card: oklch(1 0 0);
--card-foreground: oklch(0.23 0.005 95);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.23 0.005 95);
--primary: oklch(0.23 0.005 95);
--primary-foreground: oklch(0.985 0.002 95);
--secondary: oklch(0.95 0.002 95);
--secondary-foreground: oklch(0.23 0.005 95);
--muted: oklch(0.95 0.002 95);
--muted-foreground: oklch(0.45 0.005 95);
--accent: oklch(0.95 0.002 95);
--accent-foreground: oklch(0.23 0.005 95);
--border: oklch(0.88 0.002 95);
--input: oklch(0.88 0.002 95);
--ring: oklch(0.5 0.005 95);
--radius: 0.5rem;
```
