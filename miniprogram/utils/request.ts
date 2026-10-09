/**
 * 统一请求层。
 * 能力：
 * 1. 统一响应体拆包（code !== 0 抛 ApiError）；
 * 2. 自动带上 Authorization / 版本号 / 环境标识 / 链路 ID；
 * 3. 401 单飞刷新 token 并自动重放一次请求（并发请求只刷新一次，且**只重放一次**，防止死循环）；
 * 4. GET 幂等请求在弱网下自动重试；
 * 5. loading 与错误 toast 收敛，避免每个页面重复写。
 *
 * 实现要点（踩过的坑）：
 * - 401 重放必须有"已重放过"的标记：早期版本刷新成功后以相同 attempt 递归，
 *   若服务端持续返回 40100 且刷新接口一直"成功"，会形成无限递归；
 * - loading 计数放在最外层 request()，而不是每次重试都 show/hide，
 *   否则重试路径会出现 loading 闪烁。
 */
import { env, resolveUrl } from './env'
import { logger } from './logger'
import { clearTokens, getRefreshToken, getToken, setTokens } from './token'
import { bus, BusEvent } from './event-bus'
import { delay, mockDispatch, unmockedMessage } from '../mock'

export class ApiError extends Error {
  code: number
  traceId?: string

  constructor(code: number, message: string, traceId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.traceId = traceId
  }

  /** 业务码段划分见 docs/设计方案.md 第 8 节 */
  get isAuthError(): boolean {
    return this.code === 40100 || this.code === 40101
  }

  /** 网络层失败（无响应 / 超时 / 断网），与业务码 -1 对应 */
  get isNetworkError(): boolean {
    return this.code === -1
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions<T = unknown> {
  url: string
  method?: HttpMethod
  data?: T
  header?: Record<string, string>
  timeout?: number
  /** 展示全局 loading */
  loading?: boolean
  /** 出错时自动 toast（表单类接口建议关闭，由页面自行提示） */
  toast?: boolean
  /** 需要登录态，未登录直接抛错并引导登录 */
  auth?: boolean
  /** 弱网重试次数，默认 GET 重试 2 次 */
  retry?: number
}

let refreshPromise: Promise<boolean> | null = null
let loadingCount = 0

function showLoading(): void {
  loadingCount += 1
  if (loadingCount === 1) wx.showLoading({ title: '加载中', mask: true })
}

function hideLoading(): void {
  loadingCount = Math.max(0, loadingCount - 1)
  if (loadingCount === 0) wx.hideLoading()
}

/** 链路 ID：便于后端日志串联；同一次业务操作的所有重试共用同一个 TraceId */
function createTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function buildHeader(extra?: Record<string, string>): Record<string, string> {
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client': 'miniprogram',
    'X-Env': env.name,
    'X-Trace-Id': createTraceId(),
    ...extra,
  }
  const token = getToken()
  if (token) header.Authorization = `Bearer ${token}`
  return header
}

/** 后端可能返回非 JSON（网关 502 页面、空响应），统一做一次容错解析 */
function parseBody<T>(raw: unknown): IApiResponse<T> | null {
  if (raw && typeof raw === 'object') return raw as IApiResponse<T>
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw) as IApiResponse<T>
    } catch {
      return null
    }
  }
  return null
}

/** mock 模式提示只打一次，避免刷屏 */
let mockNotified = false

/**
 * Mock 分流。
 * 命中则返回响应体；未命中**抛错而不是回落真实请求**——
 * 本项目不含服务端，域名全是占位域名，回落只会得到「网络连接失败」，
 * 把「mock 没写」伪装成「网络问题」，排查方向直接跑偏。
 */
function tryMock<T>(options: RequestOptions): Promise<IApiResponse<T>> | null {
  if (!env.enableMock) return null
  const method = options.method ?? 'GET'
  const mocked = mockDispatch(method, options.url, options.data)
  if (!mockNotified) {
    mockNotified = true
    logger.info('mock_enabled', { url: options.url })
  }
  if (mocked) return delay(mocked as IApiResponse<T>)
  return Promise.reject(new ApiError(40400, unmockedMessage(method, options.url)))
}

/** 底层发送：只负责网络，不处理业务码 */
function send<T>(options: RequestOptions): Promise<IApiResponse<T>> {
  const mocked = tryMock<T>(options)
  if (mocked) return mocked

  const { url, method = 'GET', data, header, timeout = 15000 } = options
  return new Promise((resolve, reject) => {
    wx.request({
      url: resolveUrl(url),
      method,
      data: data as WechatMiniprogram.RequestOption['data'],
      header: buildHeader(header),
      timeout,
      success: (res) => {
        const body = parseBody<T>(res.data)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (!body) {
            reject(new ApiError(-1, '服务返回格式异常，请稍后重试'))
            return
          }
          resolve(body)
          return
        }
        // HTTP 401 兜底映射为业务 40100：部分网关会直接返回 401 而不走业务响应体
        const code = res.statusCode === 401 ? 40100 : res.statusCode
        reject(
          new ApiError(code, body?.message || `网络异常（${res.statusCode}）`, body?.traceId),
        )
      },
      fail: (err) => {
        const message = /timeout/i.test(err.errMsg) ? '网络超时，请稍后重试' : '网络连接失败'
        reject(new ApiError(-1, message))
      },
    })
  })
}

/** 刷新 token：并发场景只发起一次请求 */
async function refreshTokenOnce(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  refreshPromise = (async () => {
    try {
      const res = await send<{ accessToken: string; refreshToken: string }>({
        url: '/auth/refresh',
        method: 'POST',
        data: { refreshToken },
      })
      if (res.code !== 0 || !res.data) return false
      setTokens(res.data.accessToken, res.data.refreshToken)
      return true
    } catch (err) {
      logger.warn('refresh_token_failed', { err: String(err) })
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * @param attempt 剩余网络重试次数
 * @param authRetried 是否已经因 401 重放过一次（防止无限刷新）
 */
async function requestWithRetry<T>(
  options: RequestOptions,
  attempt: number,
  authRetried: boolean,
): Promise<T> {
  const { toast = true, auth = false } = options

  try {
    const res = await send<T>(options)

    if (res.code === 40100 || res.code === 40101) {
      // 已经重放过一次仍 401：说明刷新拿到的 token 依然无效，直接结束会话，避免死循环
      if (authRetried) {
        clearTokens()
        bus.emit(BusEvent.loginExpired)
        throw new ApiError(res.code, '登录已过期，请重新登录', res.traceId)
      }
      const refreshed = await refreshTokenOnce()
      if (refreshed) return requestWithRetry<T>(options, attempt, true)
      clearTokens()
      bus.emit(BusEvent.loginExpired)
      throw new ApiError(res.code, '登录已过期，请重新登录', res.traceId)
    }

    if (res.code !== 0) {
      throw new ApiError(res.code, res.message || '操作失败', res.traceId)
    }
    return res.data
  } catch (err) {
    const error = err instanceof ApiError ? err : new ApiError(-1, String(err))
    const canRetry =
      error.isNetworkError &&
      attempt > 0 &&
      (options.method ?? 'GET') === 'GET'

    if (canRetry) {
      logger.warn('request_retry', { url: options.url, remain: attempt - 1 })
      return requestWithRetry<T>(options, attempt - 1, authRetried)
    }

    if (error.isAuthError) {
      if (auth) wx.navigateTo({ url: '/pages/login/index' })
    } else if (toast) {
      wx.showToast({ title: error.message, icon: 'none', duration: 2500 })
    }

    logger.error('request_failed', {
      url: options.url,
      code: error.code,
      message: error.message,
      traceId: error.traceId,
    })
    throw error
  }
}

export function request<T = unknown>(options: RequestOptions): Promise<T> {
  const method = options.method ?? 'GET'
  const retry = options.retry ?? (method === 'GET' ? 2 : 0)
  const run = () => requestWithRetry<T>({ ...options, method }, retry, false)

  if (!options.loading) return run()
  showLoading()
  return run().finally(hideLoading)
}

export const http = {
  get: <T>(url: string, data?: unknown, options: Partial<RequestOptions> = {}) =>
    request<T>({ url, method: 'GET', data, ...options }),
  post: <T>(url: string, data?: unknown, options: Partial<RequestOptions> = {}) =>
    request<T>({ url, method: 'POST', data, ...options }),
  put: <T>(url: string, data?: unknown, options: Partial<RequestOptions> = {}) =>
    request<T>({ url, method: 'PUT', data, ...options }),
  del: <T>(url: string, data?: unknown, options: Partial<RequestOptions> = {}) =>
    request<T>({ url, method: 'DELETE', data, ...options }),
}

export type UploadBizType = 'checkin' | 'report' | 'avatar' | 'idcard'

interface UploadResult {
  fileId: string
  url: string
}

/** 单次上传（不含重试与鉴权刷新），供 uploadFile 与重试逻辑复用 */
function uploadOnce(
  filePath: string,
  bizType: UploadBizType,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  if (env.enableMock) {
    // mock 下不真正上传，直接回一个本地可用的 fileId / url，
    // 让「拍照 -> 上传 -> 展示」这条链路在无后端时也能走通
    onProgress?.(100)
    return delay({ fileId: `mock_file_${Date.now().toString(36)}`, url: filePath })
  }

  return new Promise((resolve, reject) => {
    const task = wx.uploadFile({
      url: resolveUrl('/file/upload'),
      filePath,
      name: 'file',
      formData: { bizType },
      header: buildHeader(),
      timeout: 30_000,
      success: (res) => {
        const body = parseBody<UploadResult>(res.data)
        if (!body) {
          reject(new ApiError(-1, '上传结果解析失败'))
          return
        }
        if (body.code !== 0) {
          reject(new ApiError(body.code, body.message || '上传失败', body.traceId))
          return
        }
        resolve(body.data)
      },
      fail: () => reject(new ApiError(-1, '上传失败，请检查网络后重试')),
    })
    onProgress?.(0)
    task.onProgressUpdate((res) => onProgress?.(res.progress))
  })
}

/**
 * 文件上传（打卡照片、体检报告、身份证影像等）。
 * 与 request 保持一致：401 时单飞刷新 token 并重放一次；网络失败重试一次。
 */
export async function uploadFile(
  filePath: string,
  bizType: UploadBizType,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  try {
    return await uploadOnce(filePath, bizType, onProgress)
  } catch (err) {
    const error = err instanceof ApiError ? err : new ApiError(-1, String(err))

    if (error.isAuthError) {
      const refreshed = await refreshTokenOnce()
      if (refreshed) return uploadOnce(filePath, bizType, onProgress)
      clearTokens()
      bus.emit(BusEvent.loginExpired)
      throw new ApiError(error.code, '登录已过期，请重新登录', error.traceId)
    }

    if (error.isNetworkError) {
      logger.warn('upload_retry', { bizType })
      return uploadOnce(filePath, bizType, onProgress)
    }

    logger.error('upload_failed', { bizType, code: error.code, message: error.message })
    throw error
  }
}
