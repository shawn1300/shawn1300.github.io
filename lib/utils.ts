import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { TZDate } from "@date-fns/tz"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 博主所在时区 */
const AUTHOR_TIMEZONE = "Asia/Shanghai"

/**
 * 格式化日期，默认 "2024年1月15日" 格式，可传入自定义格式
 * 始终以 Asia/Shanghai (UTC+8) 时区显示，避免 Vercel 服务器 UTC 时区导致日期偏差
 */
export function formatDate(dateStr: string, fmt = "yyyy年M月d日"): string {
  try {
    const date = new TZDate(dateStr, AUTHOR_TIMEZONE)
    return format(date, fmt, { locale: zhCN })
  } catch {
    return dateStr
  }
}
