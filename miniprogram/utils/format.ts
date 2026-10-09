/**
 * 展示层格式化。
 * 老人端文案原则：不用「昨天 / 3 天前」这类相对表述描述健康与账单，一律给绝对时间，避免误解。
 */
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** 兼容 iOS：'2026-10-05 14:30:00' 这类带 '-' 的字符串在部分 iOS 内核上 new Date 会得到 Invalid Date */
function toDate(input: number | string | Date): Date {
  if (input instanceof Date) return input
  if (typeof input === 'number') return new Date(input)
  return new Date(input.replace(/-/g, '/').replace(/T/, ' ').replace(/\.\d+Z?$/, ''))
}

/**
 * 格式化日期。
 * 用一次正则替换而不是链式 String.replace：链式写法对同一 token 只替换首次出现，
 * 例如 'YYYY-MM-DD HH:mm' 之外再出现一次 'MM' 就会漏替换。
 */
export function formatDate(input: number | string | Date, pattern = 'YYYY-MM-DD'): string {
  const date = toDate(input)
  if (Number.isNaN(date.getTime())) return ''
  const map: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    WW: WEEK[date.getDay()],
  }
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss|WW/g, (token) => map[token] ?? token)
}

/** 相对时间仅用于消息列表；未来时间统一显示「刚刚」，避免出现负数 */
export function fromNow(input: number | string, now = Date.now()): string {
  const ts = typeof input === 'string' ? toDate(input).getTime() : input
  if (!Number.isFinite(ts)) return ''
  const diff = Math.floor((now - ts) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`
  return formatDate(ts)
}

/** 金额：后端统一以「分」为单位传输，避免浮点误差 */
export function formatMoney(cents: number, withSymbol = true): string {
  const value = Number.isFinite(cents) ? cents : 0
  const yuan = (value / 100).toFixed(2)
  return withSymbol ? `¥${yuan}` : yuan
}

export function formatDistance(meters: number): string {
  const value = Number.isFinite(meters) ? Math.max(0, meters) : 0
  return value < 1000 ? `${Math.round(value)}m` : `${(value / 1000).toFixed(1)}km`
}

export function calcAge(birthday: string): number {
  if (!birthday) return 0
  const birth = toDate(birthday)
  if (Number.isNaN(birth.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age > 0 ? age : 0
}

/** 手机号脱敏：后端通常已脱敏，此处兜底防止前端展示明文 */
export function maskPhone(phone: string): string {
  if (!phone) return ''
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

/** 血压分级提示：仅做健康提示，不做诊断，文案需避免医疗结论 */
export function bloodPressureLevel(systolic: number, diastolic: number): '偏低' | '正常' | '偏高' {
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return '正常'
  if (systolic < 90 || diastolic < 60) return '偏低'
  if (systolic >= 140 || diastolic >= 90) return '偏高'
  return '正常'
}
