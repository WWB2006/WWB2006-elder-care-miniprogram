/**
 * 日志与埋点。
 * 约束：
 * 1. 线上禁止打印敏感信息（手机号、身份证、健康指标明文、定位精确坐标）；
 * 2. 埋点先入内存队列，页面隐藏 / 队列满时批量上报，减少请求数；
 * 3. 严重错误同步上报，便于演练与线上问题定位。
 *
 * 实现要点（踩过的坑）：
 * - 脱敏必须能穿透数组：早期版本把数组当普通对象递归，导致 payload 里的数组被改写成
 *   `{0:..,1:..}` 这样的对象，埋点数据失真。此处用 sanitizeValue 统一处理数组与对象；
 * - 敏感字段匹配统一转小写，避免 `phoneNumber` / `Phone` 这类写法绕过过滤。
 */
import { env } from './env'

type Level = 'debug' | 'info' | 'warn' | 'error'
type Payload = Record<string, unknown>

/**
 * 需要脱敏的字段名（小写精确匹配）。
 * 说明：只匹配「字段名本身」，不做子串匹配，避免误伤 serviceName / elderName 这类业务字段。
 */
const SENSITIVE_KEYS = new Set([
  'phone',
  'phonenumber',
  'mobile',
  'tel',
  'telephone',
  'idcard',
  'idno',
  'certno',
  'password',
  'pwd',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'address',
  'addressfull',
  'detailaddress',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'openid',
  'unionid',
  'realname',
  'confirmcode',
])

const FILTERED = '[FILTERED]'
/** 递归深度上限，防止环形引用或异常深的对象把日志打爆 */
const MAX_DEPTH = 6

const MAX_QUEUE = 20
const FLUSH_DELAY_MS = 10_000

let queue: Array<{ event: string; payload: Payload; ts: number }> = []
let reportTimer: ReturnType<typeof setTimeout> | null = null

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[DEEP]'
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    const output: Payload = {}
    Object.keys(value as Payload).forEach((key) => {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        output[key] = FILTERED
      } else {
        output[key] = sanitizeValue((value as Payload)[key], depth + 1)
      }
    })
    return output
  }
  return value
}

function sanitize(input: Payload): Payload {
  return sanitizeValue(input, 0) as Payload
}

/**
 * 对外暴露脱敏函数，仅供单元测试使用。
 * 脱敏是「敏感信息不外泄」的最后一道防线，必须有测试覆盖（见 tests/unit/logger-sanitize.test.ts）。
 */
export const __sanitizeForTest = sanitize

function print(level: Level, tag: string, payload?: Payload): void {
  if (!env.debug && level === 'debug') return
  const safe = payload ? sanitize(payload) : undefined
  const prefix = `[${level.toUpperCase()}][${tag}]`
  if (level === 'error') console.error(prefix, safe ?? '')
  else if (level === 'warn') console.warn(prefix, safe ?? '')
  else console.log(prefix, safe ?? '')
}

export const logger = {
  debug: (tag: string, payload?: Payload) => print('debug', tag, payload),
  info: (tag: string, payload?: Payload) => print('info', tag, payload),
  warn: (tag: string, payload?: Payload) => print('warn', tag, payload),

  error(tag: string, payload?: Payload) {
    print('error', tag, payload)
    // 实时日志：微信后台「运维中心-实时日志」可检索，线上排查必备
    try {
      const realtime = wx.getRealtimeLogManager?.()
      realtime?.error(tag, sanitize(payload ?? {}))
    } catch {
      // 实时日志不可用（低版本基础库 / 开发者工具）时静默降级，不能影响主流程
    }
  },

  /** 业务埋点 */
  event(event: TrackEvent | string, payload: Payload = {}) {
    print('debug', `event:${event}`, payload)
    queue.push({ event, payload: sanitize(payload), ts: Date.now() })
    if (queue.length >= MAX_QUEUE) flush()
    else if (reportTimer === null) {
      reportTimer = setTimeout(flush, FLUSH_DELAY_MS)
    }
  },
}

/**
 * 批量上报，失败则丢弃（埋点不能影响主流程）。
 * 由定时器、队列满、以及 App onHide 三个时机触发，避免用户直接杀进程导致数据丢失。
 */
export function flush(): void {
  if (reportTimer !== null) {
    clearTimeout(reportTimer)
    reportTimer = null
  }
  if (!queue.length) return
  const batch = queue
  queue = []
  try {
    wx.reportEvent?.('track_batch', { data: JSON.stringify(batch) })
  } catch (err) {
    // reportEvent 需要在小程序后台配置自定义分析事件；未配置或低版本时降级为仅本地日志
    console.warn('[track] reportEvent failed', err)
  }
  if (env.debug) console.log('[track] flush', batch.length)
}

/** 供单测使用：清空队列与定时器，避免用例间相互污染 */
export function resetLoggerQueue(): void {
  if (reportTimer !== null) {
    clearTimeout(reportTimer)
    reportTimer = null
  }
  queue = []
}
