/**
 * 单元测试的全局环境准备（setupFiles）。
 *
 * 小程序代码里大量直接使用全局 `wx`，Node 环境下不存在，
 * 这里提供一个最小可用实现（内存存储 + 可被 jest.spyOn 替换的空方法）。
 *
 * 注意：本文件由 `setupFiles` 加载，执行时机**早于测试框架装载**，
 * 因此这里不能调用 `beforeEach` / `describe` 等 jest 全局（会报
 * `ReferenceError: beforeEach is not defined`）。需要在每个用例前重置的
 * 逻辑，请放到 `tests/setup/after-env.ts`（由 setupFilesAfterEnv 加载）。
 */
const memory = new Map<string, unknown>()

const wxMock = {
  getStorageSync: (key: string) => (memory.has(key) ? memory.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => {
    memory.set(key, value)
  },
  removeStorageSync: (key: string) => {
    memory.delete(key)
  },
  getStorageInfoSync: () => ({ keys: Array.from(memory.keys()), currentSize: 0, limitSize: 10240 }),
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showModal: jest.fn(),
  showActionSheet: jest.fn(),
  navigateTo: jest.fn(),
  redirectTo: jest.fn(),
  switchTab: jest.fn(),
  reLaunch: jest.fn(),
  navigateBack: jest.fn(),
  makePhoneCall: jest.fn(),
  vibrateShort: jest.fn(),
  vibrateLong: jest.fn(),
  request: jest.fn(),
  uploadFile: jest.fn(),
  login: jest.fn(),
  getUserProfile: jest.fn(),
  getSetting: jest.fn(),
  authorize: jest.fn(),
  openSetting: jest.fn(),
  getRealtimeLogManager: () => ({ error: jest.fn() }),
  reportEvent: jest.fn(),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).wx = wxMock
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).getCurrentPages = () => []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).getApp = () => undefined

/** 清空内存存储。仅供 after-env 的 beforeEach 调用。 */
export function clearWxStorage(): void {
  memory.clear()
}

/** 直接读写内存存储，便于用例断言 storage 行为。 */
export function readWxStorage(key: string): unknown {
  return memory.has(key) ? memory.get(key) : undefined
}

export function hasWxStorage(key: string): boolean {
  return memory.has(key)
}

export { wxMock }
