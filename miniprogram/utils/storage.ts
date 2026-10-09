/**
 * 本地存储统一封装。
 * 为什么需要：wx.setStorageSync 偶发失败（存储空间满 / 隐私模式），
 * 且业务需要"带过期时间的缓存"，直接裸用 API 会散落大量 try/catch。
 */
const PREFIX = 'ec_'

export interface StorageOptions {
  /** 过期时间（秒），不传表示永不过期 */
  ttl?: number
}

interface WrappedValue<T> {
  v: T
  /** 过期时间戳（ms），0 表示永久 */
  e: number
}

export function setStorage<T>(key: string, value: T, options: StorageOptions = {}): void {
  const payload: WrappedValue<T> = {
    v: value,
    e: options.ttl ? Date.now() + options.ttl * 1000 : 0,
  }
  try {
    wx.setStorageSync(PREFIX + key, payload)
  } catch (err) {
    console.error('[storage] set failed', key, err)
  }
}

export function getStorage<T>(key: string, defaultValue: T): T
export function getStorage<T>(key: string, defaultValue?: T): T | undefined
export function getStorage<T>(key: string, defaultValue?: T): T | undefined {
  try {
    const raw = wx.getStorageSync(PREFIX + key) as WrappedValue<T> | ''
    if (!raw || typeof raw !== 'object') return defaultValue
    if (raw.e && raw.e < Date.now()) {
      removeStorage(key)
      return defaultValue
    }
    return raw.v
  } catch (err) {
    console.error('[storage] get failed', key, err)
    return defaultValue
  }
}

export function removeStorage(key: string): void {
  try {
    wx.removeStorageSync(PREFIX + key)
  } catch (err) {
    console.error('[storage] remove failed', key, err)
  }
}

/** 只清理本业务前缀的缓存，避免误删其他插件写入的数据 */
export function clearAllStorage(): void {
  try {
    const { keys } = wx.getStorageInfoSync()
    keys.filter((k) => k.startsWith(PREFIX)).forEach((k) => wx.removeStorageSync(k))
  } catch (err) {
    console.error('[storage] clear failed', err)
  }
}

export const StorageKey = {
  token: 'token',
  refreshToken: 'refresh_token',
  userProfile: 'user_profile',
  role: 'role',
  elderMode: 'elder_mode',
  /** 首页健康卡片等低频数据缓存，降低弱网下的空白感 */
  homeSnapshot: 'home_snapshot',
} as const
