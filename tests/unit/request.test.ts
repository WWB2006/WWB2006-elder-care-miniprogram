/**
 * 请求层的单元测试（本项目风险最高的模块）。
 *
 * 覆盖三条最关键的契约：
 * 1. 401 单飞刷新：并发请求只刷新一次 token，并各自重放一次；
 * 2. 防无限重放：重放后仍 401 必须结束会话，而不是继续刷新（早期版本会无限递归）；
 * 3. loading 计数在最外层：重试路径不能出现 show/hide 闪烁。
 */
import { bus, BusEvent } from '../../miniprogram/utils/event-bus'
import { resetLoggerQueue } from '../../miniprogram/utils/logger'
import { ApiError, http, request, uploadFile } from '../../miniprogram/utils/request'
import { getToken, setTokens } from '../../miniprogram/utils/token'
import { wxMock } from '../setup/wx'

interface RequestOption {
  url: string
  method?: string
  data?: unknown
  header?: Record<string, string>
  timeout?: number
  success: (res: {
    statusCode: number
    data: unknown
    header: Record<string, string>
    cookies: string[]
    errMsg: string
  }) => void
  fail: (err: { errMsg: string }) => void
}

interface UploadOption {
  url: string
  filePath: string
  name: string
  formData?: Record<string, unknown>
  header?: Record<string, string>
  success: (res: { statusCode: number; data: unknown; errMsg: string }) => void
  fail: (err: { errMsg: string }) => void
}

const requestMock = wxMock.request as unknown as jest.Mock
const uploadMock = wxMock.uploadFile as unknown as jest.Mock

const ok = <T>(data: T) => ({ code: 0, message: 'ok', data })
const bizError = (code: number, message: string, traceId?: string) => ({
  code,
  message,
  traceId,
  data: null,
})
const REFRESH_OK = ok({ accessToken: 'new-access', refreshToken: 'new-refresh' })

function replyWith(statusCode: number, data: unknown): void {
  requestMock.mockImplementationOnce((options: RequestOption) => {
    options.success({ statusCode, data, header: {}, cookies: [], errMsg: 'request:ok' })
  })
}

function failWith(errMsg = 'request:fail'): void {
  requestMock.mockImplementationOnce((options: RequestOption) => {
    options.fail({ errMsg })
  })
}

/** 让 /auth/refresh 成功、其余请求固定返回某个响应体 */
function withRefreshAlwaysOk(business: unknown): void {
  requestMock.mockImplementation((options: RequestOption) => {
    const data = options.url.includes('/auth/refresh') ? REFRESH_OK : business
    options.success({ statusCode: 200, data, header: {}, cookies: [], errMsg: 'request:ok' })
  })
}

function uploadReply(data: unknown): void {
  uploadMock.mockImplementationOnce((options: UploadOption) => {
    options.success({ statusCode: 200, data, errMsg: 'uploadFile:ok' })
    return { onProgressUpdate: jest.fn() }
  })
}

/**
 * 断言请求以 ApiError 失败，并把错误对象取出来供后续断言。
 * 比 `.catch((e: ApiError) => e)` 更严格：请求意外成功时会明确报错，而不是静默通过。
 */
async function catchApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('期望抛出 ApiError，但请求成功返回了')
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  resetLoggerQueue()
  bus.off(BusEvent.loginExpired)
  jest.restoreAllMocks()
})

describe('响应拆包', () => {
  it('code=0 时返回 data 本体，而不是整个响应体', async () => {
    replyWith(200, ok({ id: 1, name: '助餐' }))
    await expect(request<{ id: number; name: string }>({ url: '/service/1' })).resolves.toEqual({
      id: 1,
      name: '助餐',
    })
  })

  it('业务码非 0 抛 ApiError，并保留 code / message / traceId', async () => {
    replyWith(200, bizError(40001, '参数错误', 'trace-abc'))

    const err = await catchApiError(request({ url: '/x', toast: false }))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe(40001)
    expect(err.message).toBe('参数错误')
    expect(err.traceId).toBe('trace-abc')
    expect(err.isAuthError).toBe(false)
  })

  it('HTTP 401 兜底映射为业务 40100（网关可能不返回业务体）', async () => {
    replyWith(401, '')

    const err = await catchApiError(request({ url: '/x', toast: false }))
    expect(err.code).toBe(40100)
    expect(err.isAuthError).toBe(true)
  })

  it('HTTP 5xx 优先使用响应体 message', async () => {
    replyWith(502, { code: 502, message: '网关异常' })

    const err = await catchApiError(request({ url: '/x', toast: false }))
    expect(err.code).toBe(502)
    expect(err.message).toBe('网关异常')
  })

  it('HTTP 5xx 无响应体 message 时给出可读文案', async () => {
    replyWith(503, '')

    const err = await catchApiError(request({ url: '/x', toast: false }))
    expect(err.message).toBe('网络异常（503）')
  })

  it('响应体不是 JSON（网关 HTML 页）时抛格式异常，而不是解析崩溃', async () => {
    replyWith(200, '<html>502 Bad Gateway</html>')

    const err = await catchApiError(request({ url: '/x', method: 'POST', toast: false }))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toContain('格式异常')
  })
})

describe('请求头', () => {
  it('已登录时带上 Authorization 与基础标识头', async () => {
    setTokens('tk-access', 'tk-refresh')
    replyWith(200, ok(1))

    await request({ url: '/x' })

    const header = (requestMock.mock.calls[0][0] as RequestOption).header as Record<string, string>
    expect(header.Authorization).toBe('Bearer tk-access')
    expect(header['Content-Type']).toBe('application/json')
    expect(header['X-Client']).toBe('miniprogram')
    expect(header['X-Env']).toBe('dev')
    expect(header['X-Trace-Id']).toBeTruthy()
  })

  it('未登录时不带 Authorization', async () => {
    replyWith(200, ok(1))
    await request({ url: '/x' })

    const header = (requestMock.mock.calls[0][0] as RequestOption).header as Record<string, string>
    expect(header.Authorization).toBeUndefined()
  })

  it('url 会被拼成完整地址', async () => {
    replyWith(200, ok(1))
    await request({ url: '/service/list' })

    const url = (requestMock.mock.calls[0][0] as RequestOption).url
    expect(url).toContain('/elder-care/api/v1/service/list')
  })
})

describe('网络重试', () => {
  it('GET 网络失败自动重试 2 次（共 3 次请求）', async () => {
    failWith()
    failWith()
    replyWith(200, ok('done'))

    await expect(request({ url: '/x', toast: false })).resolves.toBe('done')
    expect(requestMock).toHaveBeenCalledTimes(3)
  })

  it('POST 网络失败不重试（非幂等，重试可能重复下单）', async () => {
    failWith()

    await expect(request({ url: '/x', method: 'POST', toast: false })).rejects.toBeInstanceOf(ApiError)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('retry 显式传 0 时不重试', async () => {
    failWith()
    await expect(request({ url: '/x', retry: 0, toast: false })).rejects.toBeInstanceOf(ApiError)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('超时错误给出可读文案', async () => {
    failWith('request:fail timeout')

    const err = await catchApiError(request({ url: '/x', method: 'POST', toast: false }))
    expect(err.message).toBe('网络超时，请稍后重试')
    expect(err.isNetworkError).toBe(true)
  })

  it('网络失败给出通用文案', async () => {
    failWith('request:fail')

    const err = await catchApiError(request({ url: '/x', method: 'POST', toast: false }))
    expect(err.message).toBe('网络连接失败')
  })
})

describe('401 刷新与重放', () => {
  it('401 时刷新 token 并自动重放一次，用户无感知', async () => {
    setTokens('old-access', 'refresh-1')
    let businessCalls = 0
    requestMock.mockImplementation((options: RequestOption) => {
      if (options.url.includes('/auth/refresh')) {
        options.success({ statusCode: 200, data: REFRESH_OK, header: {}, cookies: [], errMsg: 'ok' })
        return
      }
      businessCalls += 1
      const data = businessCalls === 1 ? bizError(40100, 'token expired') : ok({ ok: true })
      options.success({ statusCode: 200, data, header: {}, cookies: [], errMsg: 'ok' })
    })

    await expect(request<{ ok: boolean }>({ url: '/x', toast: false })).resolves.toEqual({ ok: true })
    expect(businessCalls).toBe(2)
    // 刷新后本地 token 已更新，后续请求才会带新 token
    expect(getToken()).toBe('new-access')
  })

  it('重放后仍 401 时结束会话，不会无限刷新（回归用例）', async () => {
    setTokens('a', 'r')
    const expired = jest.fn()
    bus.on(BusEvent.loginExpired, expired)
    withRefreshAlwaysOk(bizError(40100, 'expired'))

    await expect(request({ url: '/x', toast: false })).rejects.toBeInstanceOf(ApiError)

    // 1 次业务请求 + 1 次刷新 + 1 次重放，到此为止
    expect(requestMock).toHaveBeenCalledTimes(3)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(getToken()).toBe('')
  })

  it('本地没有 refreshToken 时 401 直接结束会话，不发起刷新请求', async () => {
    const expired = jest.fn()
    bus.on(BusEvent.loginExpired, expired)
    replyWith(200, bizError(40100, 'expired'))

    await expect(request({ url: '/x', toast: false })).rejects.toBeInstanceOf(ApiError)
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('刷新接口自身返回业务错误时结束会话', async () => {
    setTokens('a', 'r')
    const expired = jest.fn()
    bus.on(BusEvent.loginExpired, expired)
    requestMock.mockImplementation((options: RequestOption) => {
      const data = options.url.includes('/auth/refresh') ? bizError(40101, 'refresh invalid') : bizError(40100, 'expired')
      options.success({ statusCode: 200, data, header: {}, cookies: [], errMsg: 'ok' })
    })

    await expect(request({ url: '/x', toast: false })).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(requestMock).toHaveBeenCalledTimes(2)
  })

  it('并发 401 只刷新一次 token（单飞）', async () => {
    setTokens('a', 'r')
    let refreshCalls = 0
    requestMock.mockImplementation((options: RequestOption) => {
      if (options.url.includes('/auth/refresh')) {
        refreshCalls += 1
        options.success({ statusCode: 200, data: REFRESH_OK, header: {}, cookies: [], errMsg: 'ok' })
        return
      }
      options.success({ statusCode: 200, data: bizError(40100, 'expired'), header: {}, cookies: [], errMsg: 'ok' })
    })

    const results = await Promise.allSettled([
      request({ url: '/a', toast: false }),
      request({ url: '/b', toast: false }),
      request({ url: '/c', toast: false }),
    ])

    expect(refreshCalls).toBe(1)
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
  })

  it('刷新后的 token 只被重放请求使用一次（不污染其它请求）', async () => {
    setTokens('old', 'r')
    requestMock.mockImplementation((options: RequestOption) => {
      const isRefresh = options.url.includes('/auth/refresh')
      const data = isRefresh ? REFRESH_OK : bizError(40100, 'expired')
      options.success({ statusCode: 200, data, header: {}, cookies: [], errMsg: 'ok' })
    })

    await request({ url: '/x', toast: false }).catch(() => undefined)
    // 重放仍失败 → 会话被清空，不能残留半新半旧的状态
    expect(getToken()).toBe('')
  })
})

describe('loading 与 toast', () => {
  it('loading=true 时只 show/hide 各一次，重试路径不闪烁', async () => {
    failWith()
    replyWith(200, ok('ok'))

    await request({ url: '/x', loading: true, toast: false })
    expect(wxMock.showLoading).toHaveBeenCalledTimes(1)
    expect(wxMock.hideLoading).toHaveBeenCalledTimes(1)
  })

  it('loading 未开启时不动 loading', async () => {
    replyWith(200, ok('ok'))
    await request({ url: '/x' })
    expect(wxMock.showLoading).not.toHaveBeenCalled()
  })

  it('请求失败时也会收起 loading', async () => {
    failWith()
    await request({ url: '/x', method: 'POST', loading: true, toast: false }).catch(() => undefined)
    expect(wxMock.hideLoading).toHaveBeenCalledTimes(1)
  })

  it('toast=true 时用 toast 展示错误文案', async () => {
    replyWith(200, bizError(40001, '参数错误'))

    await request({ url: '/x', method: 'POST' }).catch(() => undefined)
    expect(wxMock.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '参数错误', icon: 'none' }),
    )
  })

  it('toast=false 时静默失败（表单页自行提示）', async () => {
    replyWith(200, bizError(40001, '参数错误'))

    await request({ url: '/x', method: 'POST', toast: false }).catch(() => undefined)
    expect(wxMock.showToast).not.toHaveBeenCalled()
  })

  it('auth=true 且鉴权失败时引导到登录页', async () => {
    replyWith(200, bizError(40100, '未登录'))

    await request({ url: '/x', method: 'POST', auth: true, toast: false }).catch(() => undefined)
    expect(wxMock.navigateTo).toHaveBeenCalledWith({ url: '/pages/login/index' })
  })

  it('auth 未开启时不打扰用户（游客浏览失败只提示）', async () => {
    replyWith(200, bizError(40100, '未登录'))

    await request({ url: '/x', method: 'POST', toast: false }).catch(() => undefined)
    expect(wxMock.navigateTo).not.toHaveBeenCalled()
  })
})

describe('http 语法糖', () => {
  it('get / post / put / del 映射到对应 method', async () => {
    replyWith(200, ok(1))
    replyWith(200, ok(2))
    replyWith(200, ok(3))
    replyWith(200, ok(4))

    await http.get('/a')
    await http.post('/b')
    await http.put('/c')
    await http.del('/d')

    expect(requestMock.mock.calls.map((c) => (c[0] as RequestOption).method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'DELETE',
    ])
  })

  it('额外 options 会覆盖默认值', async () => {
    replyWith(200, ok(1))
    await http.post('/a', { id: 1 }, { toast: false, loading: true })

    expect(wxMock.showLoading).toHaveBeenCalledTimes(1)
  })
})

describe('uploadFile', () => {
  it('上传成功返回 fileId 与 url', async () => {
    uploadReply(JSON.stringify(ok({ fileId: 'f1', url: 'https://cdn.example.com/f1.png' })))

    await expect(uploadFile('/tmp/a.png', 'checkin')).resolves.toEqual({
      fileId: 'f1',
      url: 'https://cdn.example.com/f1.png',
    })
  })

  it('透传 bizType 并回调进度', async () => {
    uploadMock.mockImplementationOnce((options: UploadOption) => {
      options.success({ statusCode: 200, data: JSON.stringify(ok({ fileId: 'f', url: 'u' })), errMsg: 'ok' })
      return { onProgressUpdate: (cb: (res: { progress: number }) => void) => cb({ progress: 66 }) }
    })
    const onProgress = jest.fn()

    await uploadFile('/tmp/a.png', 'report', onProgress)
    expect((uploadMock.mock.calls[0][0] as UploadOption).formData).toEqual({ bizType: 'report' })
    expect(onProgress).toHaveBeenCalledWith(0)
    expect(onProgress).toHaveBeenCalledWith(66)
  })

  it('业务码非 0 时抛 ApiError', async () => {
    uploadReply(JSON.stringify(bizError(41300, '文件过大')))

    const err = await catchApiError(uploadFile('/tmp/a.png', 'report'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe(41300)
    expect(err.message).toBe('文件过大')
  })

  it('解析失败视为网络问题并重试一次', async () => {
    uploadReply('not-json')
    uploadReply(JSON.stringify(ok({ fileId: 'f2', url: 'u2' })))

    await expect(uploadFile('/tmp/a.png', 'checkin')).resolves.toEqual({ fileId: 'f2', url: 'u2' })
    expect(uploadMock).toHaveBeenCalledTimes(2)
  })

  it('网络失败重试一次', async () => {
    uploadMock.mockImplementationOnce((options: UploadOption) => {
      options.fail({ errMsg: 'uploadFile:fail' })
      return { onProgressUpdate: jest.fn() }
    })
    uploadReply(JSON.stringify(ok({ fileId: 'f3', url: 'u3' })))

    await expect(uploadFile('/tmp/a.png', 'avatar')).resolves.toEqual({ fileId: 'f3', url: 'u3' })
    expect(uploadMock).toHaveBeenCalledTimes(2)
  })

  it('网络失败重试后仍失败则抛错，不会无限重试', async () => {
    uploadMock.mockImplementation((options: UploadOption) => {
      options.fail({ errMsg: 'uploadFile:fail' })
      return { onProgressUpdate: jest.fn() }
    })

    await expect(uploadFile('/tmp/a.png', 'idcard')).rejects.toBeInstanceOf(ApiError)
    expect(uploadMock).toHaveBeenCalledTimes(2)
  })

  it('401 时刷新 token 并重放上传', async () => {
    setTokens('old', 'refresh-1')
    uploadMock.mockImplementationOnce((options: UploadOption) => {
      options.success({ statusCode: 200, data: JSON.stringify(bizError(40100, 'expired')), errMsg: 'ok' })
      return { onProgressUpdate: jest.fn() }
    })
    uploadReply(JSON.stringify(ok({ fileId: 'f4', url: 'u4' })))
    requestMock.mockImplementationOnce((options: RequestOption) => {
      options.success({ statusCode: 200, data: REFRESH_OK, header: {}, cookies: [], errMsg: 'ok' })
    })

    await expect(uploadFile('/tmp/a.png', 'checkin')).resolves.toEqual({ fileId: 'f4', url: 'u4' })
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect((requestMock.mock.calls[0][0] as RequestOption).url).toContain('/auth/refresh')
  })

  it('401 且刷新失败时结束会话并抛错', async () => {
    setTokens('old', 'refresh-1')
    const expired = jest.fn()
    bus.on(BusEvent.loginExpired, expired)
    uploadMock.mockImplementationOnce((options: UploadOption) => {
      options.success({ statusCode: 200, data: JSON.stringify(bizError(40100, 'expired')), errMsg: 'ok' })
      return { onProgressUpdate: jest.fn() }
    })
    requestMock.mockImplementationOnce((options: RequestOption) => {
      options.success({ statusCode: 200, data: bizError(40101, 'invalid'), header: {}, cookies: [], errMsg: 'ok' })
    })

    await expect(uploadFile('/tmp/a.png', 'checkin')).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledTimes(1)
    expect(getToken()).toBe('')
  })
})

describe('ApiError', () => {
  it('isAuthError 覆盖 40100 / 40101', () => {
    expect(new ApiError(40100, '').isAuthError).toBe(true)
    expect(new ApiError(40101, '').isAuthError).toBe(true)
    expect(new ApiError(40001, '').isAuthError).toBe(false)
  })

  it('isNetworkError 只认 -1', () => {
    expect(new ApiError(-1, '').isNetworkError).toBe(true)
    expect(new ApiError(500, '').isNetworkError).toBe(false)
  })
})
