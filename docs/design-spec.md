# 设计规范 — 素白 · 极简

## 1. 设计哲学

- **留白**：大量的空间让步于内容，让阅读成为呼吸
- **质朴**：微暖的纸白底色，干净的线条，不添加任何多余装饰
- **克制**：少即是多——颜色、线条、动效皆以"必要性"为准则

## 2. 双主题色板

暖白亮色为默认主题；深炭蓝暗色通过 `<html class="dark">` 启用。组件必须使用语义变量，不能把某一套主题色写死在组件内。

```
亮色：
  根背景:     oklch(0.975 0.01 90)  微暖纸白
  卡片/表面:  oklch(0.99 0.006 90)
  主文字:     oklch(0.22 0.02 80)   暖墨色
  次文字:     oklch(0.48 0.02 80)
  边框:       oklch(0.88 0.015 90)
  主交互:     oklch(0.48 0.16 260)

暗色：
  根背景:     oklch(0.18 0.008 260) 深炭蓝
  卡片/表面:  oklch(0.22 0.01 260)
  主文字:     oklch(0.89 0.008 95)
  次文字:     oklch(0.6 0.01 95)
  边框:       oklch(0.27 0.015 260)
  主交互:     oklch(0.62 0.16 260)
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

完整变量以 `app/globals.css` 为准。核心双主题变量如下：

```css
:root {
  --background: oklch(0.975 0.01 90);
  --foreground: oklch(0.22 0.02 80);
  --card: oklch(0.99 0.006 90);
  --primary: oklch(0.48 0.16 260);
  --muted: oklch(0.96 0.005 90);
  --muted-foreground: oklch(0.48 0.02 80);
  --border: oklch(0.88 0.015 90);
  --radius: 0.5rem;
}

.dark {
  --background: oklch(0.18 0.008 260);
  --foreground: oklch(0.89 0.008 95);
  --card: oklch(0.22 0.01 260);
  --primary: oklch(0.62 0.16 260);
  --muted: oklch(0.23 0.008 260);
  --muted-foreground: oklch(0.6 0.01 95);
  --border: oklch(0.27 0.015 260);
}
```
