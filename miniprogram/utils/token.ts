/**
 * Token 读写单独成文件，避免 request.ts 与 auth.ts 互相 import 造成循环依赖。
 */
import { getStorage, setStorage, removeStorage, StorageKey } from './storage'

export function getToken(): string {
  return getStorage<string>(StorageKey.token, '')
}

export function getRefreshToken(): string {
  return getStorage<string>(StorageKey.refreshToken, '')
}

export function setTokens(accessToken: string, refreshToken: string): void {
  // accessToken 短效（2h），refreshToken 长效（30 天）
  setStorage(StorageKey.token, accessToken, { ttl: 2 * 60 * 60 })
  setStorage(StorageKey.refreshToken, refreshToken, { ttl: 30 * 24 * 60 * 60 })
}

export function clearTokens(): void {
  removeStorage(StorageKey.token)
  removeStorage(StorageKey.refreshToken)
}

export function hasToken(): boolean {
  return !!getToken()
}
