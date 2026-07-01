import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "关于",
  description: "关于我和这个博客",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          关于
        </h1>
      </div>

      <div className="prose prose-sm max-w-none space-y-6 text-sm text-foreground/85 leading-relaxed">
        <p>
          嗨，我是 Shawn。
        </p>
        <p>
          这里是我的个人博客，用来记录技术思考、项目经验和生活随笔。
          崇尚极简，热爱创造，相信「少即是多」。
        </p>
        <p>
          博客从零搭建，使用 Next.js + TypeScript + Tailwind CSS +
          Supabase，部署在 Vercel 上。双主题（暖白 / 暗黑）自由切换，
          支持 Markdown 写作、实时评论。
        </p>
        <p>
          值得一提的是，这个博客的每一行代码都是在 AI 的辅助下完成的——
          从架构设计、数据库建模、页面布局，到功能实现、bug 修复、部署调试，
          全程在 VS Code 中与 Claude Code 结对编程（DeepSeek API）。
          对于不懂编程的人来说，这是一个很有趣的实验：
          证明在今天，只要你有想法和审美，AI 可以帮你把想法变成现实。
        </p>

        <div className="pt-4 space-y-2">
          <h2 className="text-sm font-medium text-foreground">联系方式</h2>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/shawn1300"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="mailto:shawn1300@outlook.com"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
