import { createClient } from "@supabase/supabase-js";

/**
 * 静态 Supabase 客户端（无 cookies 依赖）
 * 用于公开内容的读取 — 不访问 cookies()，因此页面可以走
 * 静态渲染 / ISR 缓存，链接跳转无需每次现场查库
 */
export function createStaticSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
