import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { enUS, ja, zhCN } from "date-fns/locale"
import { TZDate } from "@date-fns/tz"
import type { Locale } from "@/i18n/routing"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 博主所在时区 */
const AUTHOR_TIMEZONE = "Asia/Shanghai"

/**
 * 格式化日期，默认 "2024年1月15日" 格式，可传入自定义格式
 * 始终以 Asia/Shanghai (UTC+8) 时区显示，避免 Vercel 服务器 UTC 时区导致日期偏差
 */
export function formatDate(dateStr: string, fmt?: string, locale: Locale = "zh-CN"): string {
  try {
    const date = new TZDate(dateStr, AUTHOR_TIMEZONE)
    const dateLocale = locale === "en" ? enUS : locale === "ja" ? ja : zhCN
    const resolvedFormat = fmt ?? (locale === "en" ? "MMMM d, yyyy" : "yyyy年M月d日")
    return format(date, resolvedFormat, { locale: dateLocale })
  } catch {
    return dateStr
  }
}
