# Markdown 完整教程

这份教程用于系统学习 Markdown。它比 `markdown-guide.md` 更完整，适合需要查细节、复习语法，或给以后维护博客的人阅读。

## 1. Markdown 是什么

Markdown 是一种轻量标记语言。你用普通文本写内容，再用少量符号表达标题、列表、链接、图片、代码块等结构。

它的优点是：

- 文件本身就是可读文本。
- 写作时不需要频繁操作格式工具栏。
- 很适合博客、文档、README、笔记和技术文章。

## 2. 基本规则

Markdown 通常遵循这些习惯：

- 标记符号后面留一个空格，例如 `## 标题`、`- 列表项`。
- 段落之间空一行。
- 代码块用三个反引号包起来。
- 文件扩展名通常是 `.md`。

## 3. 标题

标题用 `#` 表示，数量越多层级越低。

```markdown
# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题
```

博客正文通常从 `##` 开始，因为页面标题已经是文章标题。

## 4. 段落

普通文字直接写就是段落。

```markdown
这是第一段。

这是第二段。中间空一行，表示新段落。
```

在这个博客项目里，普通换行也会显示为换行，因为启用了 `remark-breaks`。

```markdown
第一行
第二行
第三行
```

## 5. 强调

```markdown
**加粗**
*斜体*
***加粗并斜体***
~~删除线~~
```

效果含义：

- 加粗：强调关键词或结论。
- 斜体：语气、书名、轻微强调。
- 删除线：表示废弃、修正或对比。

## 6. 行内代码

用反引号包住短代码、命令、文件名、字段名。

```markdown
运行 `npm run dev`，然后打开 `localhost:3000`。
```

如果内容本身含有反引号，可以用两个反引号包住。

```markdown
``这里有 ` 一个反引号``
```

## 7. 无序列表

```markdown
- 苹果
- 香蕉
- 橙子
```

也可以使用 `*`，但建议全篇统一使用 `-`。

## 8. 有序列表

```markdown
1. 打开后台
2. 新建文章
3. 写正文
4. 保存草稿
5. 发布
```

很多 Markdown 渲染器会自动编号，所以你也可以写：

```markdown
1. 第一步
1. 第二步
1. 第三步
```

但为了源码可读性，建议按真实序号写。

## 9. 嵌套列表

子列表通常缩进两个空格。

```markdown
- 文章
  - 标题
  - 摘要
  - 正文
- 日记
  - 标题
  - 正文
```

## 10. 任务列表

GitHub Flavored Markdown 支持任务列表。这个博客项目启用了 `remark-gfm`，可以使用。

```markdown
- [x] 搭建项目
- [x] 写第一篇文章
- [ ] 整理相册
- [ ] 补充 README
```

注意 `[ ]` 里面是一个空格，不是空字符串。

## 11. 链接

基本写法：

```markdown
[显示文字](https://example.com)
```

带标题提示：

```markdown
[显示文字](https://example.com "鼠标悬停提示")
```

引用式链接：

```markdown
这是一个 [链接][site]。

[site]: https://example.com
```

当同一个链接出现很多次时，引用式链接更方便维护。

## 12. 图片

```markdown
![图片描述](https://example.com/image.jpg)
```

带标题提示：

```markdown
![图片描述](https://example.com/image.jpg "图片标题")
```

建议：

- 图片描述写清楚，不要只写 `image`。
- 使用公开可访问的图片 URL。
- 图片太大时先压缩，避免页面加载慢。

## 13. 引用

```markdown
> 这是一段引用。
```

多行引用：

```markdown
> 第一行
> 第二行
> 第三行
```

引用里也可以放其他 Markdown：

```markdown
> **提示：** 发布前记得预览。
>
> - 检查图片
> - 检查链接
```

## 14. 代码块

代码块用三个反引号包住。

````markdown
```
普通代码块
```
````

写上语言名可以获得更好的高亮。

````markdown
```ts
function hello(name: string) {
  return `Hello, ${name}`;
}
```

```bash
npm install
npm run build
```

```sql
select id, title
from posts
order by created_at desc;
```
````

常见语言名：

| 语言 | 标记 |
| --- | --- |
| Shell | `bash` |
| JavaScript | `js` |
| TypeScript | `ts` |
| React TSX | `tsx` |
| CSS | `css` |
| SQL | `sql` |
| JSON | `json` |
| Markdown | `markdown` |

## 15. 表格

```markdown
| 名称 | 类型 | 说明 |
| --- | --- | --- |
| title | string | 文章标题 |
| slug | string | URL 标识 |
| status | draft/published | 发布状态 |
```

对齐写法：

```markdown
| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| A | B | C |
```

表格适合短文本。长文本用小标题和列表更好。

## 16. 分隔线

```markdown
---
```

也可以写：

```markdown
***
```

建议统一使用 `---`。

## 17. 转义字符

如果你想显示 Markdown 符号本身，可以在前面加反斜杠。

```markdown
\*这不会变成斜体\*
\# 这不会变成标题
```

## 18. HTML

这个博客项目启用了 `rehype-raw`，所以 Markdown 里可以写 HTML。

```html
<div style="text-align: center;">
  居中文本
</div>
```

但建议谨慎使用：

- 优先用 Markdown 原生语法。
- 只嵌入可信内容。
- HTML 写错可能影响整篇文章布局。

## 19. Bilibili 视频嵌入

```html
<iframe
  src="//player.bilibili.com/player.html?bvid=BV号"
  scrolling="no"
  border="0"
  frameborder="no"
  framespacing="0"
  allowfullscreen="true"
  width="100%"
  height="400"
></iframe>
```

把 `BV号` 替换成真实视频编号即可。

## 20. Front Matter

有些静态博客会在 Markdown 顶部写 Front Matter。

```markdown
---
title: 我的文章
date: 2026-06-28
tags:
  - Markdown
  - 写作
---
```

当前 Shawn1300 后台的标题、分类、标签、摘要、封面由编辑器表单管理，不需要在正文里写 Front Matter。

## 21. 写文章的结构建议

技术文章：

```markdown
## 背景

为什么要做这件事。

## 问题

遇到了什么限制或错误。

## 解决过程

按步骤记录尝试。

## 最终方案

给出可复用做法。

## 小结

留下经验或下一步。
```

旅行或生活文章：

```markdown
## 这一天

先写场景。

## 让我记住的细节

写人、地点、声音、天气、偶然事件。

## 照片

插入图片和简短说明。

## 回头看

写一点感受。
```

日记：

```markdown
今天主要记三件事。

第一件……

第二件……

第三件……

睡前想到的是……
```

## 22. 常见错误

### 标题没有生效

错误：

```markdown
##标题
```

正确：

```markdown
## 标题
```

`#` 后面要有空格。

### 列表没有生效

错误：

```markdown
-项目
```

正确：

```markdown
- 项目
```

`-` 后面要有空格。

### 代码块没有结束

错误：

````markdown
```ts
const a = 1;
````

正确：

````markdown
```ts
const a = 1;
```
````

开头和结尾都要有三个反引号。

### 图片不显示

优先检查：

- URL 是否可公开访问。
- URL 是否复制完整。
- 图片地址是否包含空格或中文特殊字符。
- 是否误把页面地址当成图片地址。

## 23. 发布前检查清单

- 标题是否明确。
- 正文是否分段。
- 图片是否能加载。
- 外部链接是否正确。
- 代码块是否写了语言名。
- 表格在手机上是否还能读。
- HTML 嵌入是否显示正常。
- 预览区是否和预期一致。

## 24. 推荐写作习惯

- 先写内容，再整理格式。
- 长段落拆短，手机阅读更舒服。
- 多用小标题帮助读者定位。
- 图片前后写一两句说明。
- 技术文章保留错误信息和最终命令。
- 日记不必追求完整，真实比完整更重要。
