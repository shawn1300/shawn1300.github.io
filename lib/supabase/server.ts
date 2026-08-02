import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * 服务端 Supabase 客户端
 * 用于 Server Components 和 API Routes 中的数据获取
 * 通过 cookies 自动获取用户 session
 *
 * 注意：类型通过 `npx supabase gen types typescript` 生成后可添加 Database 泛型约束
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 在 Server Components 中调用 setAll 会抛出异常，
            // 这属于预期行为 — Middleware 会处理 cookie 刷新
          }
        },
      },
    }
  )
}

/**
 * 服务端 Supabase 客户端（Service Role）
 * 拥有最高权限，绕过 RLS，仅用于 API Routes
 */
export async function createServiceClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — expected
          }
        },
      },
    }
  )
}

/**
 * Cookie-free Service Role client for Cron jobs and background translation.
 * Never import this function into a Client Component.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server environment variables are not configured')
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
