import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化日期为 "2024年1月15日" 格式
 */
export function formatDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr)
    return format(date, "yyyy年M月d日", { locale: zhCN })
  } catch {
    return dateStr
  }
}
