/**
 * 路由表与跳转的单元测试。
 * 重点覆盖三个经典坑：
 * 1. navigateTo 跳 tabBar 页会失败 —— push 必须自动改用 switchTab；
 * 2. 页面栈达到 10 层后 navigateTo 静默失败 —— 必须退化为 redirectTo；
 * 3. switchTab 不支持 query —— 传了参数必须告警而不是静默丢弃。
 */
import { ROUTES, resolveHomeByRole, router } from '../../miniprogram/config/route'
import { logger } from '../../miniprogram/utils/logger'
import { wxMock } from '../setup/wx'

/**
 * 页面栈是全局状态，用例里会改写它；
 * 必须在每个用例前复位，否则「栈满退化为 redirectTo」会污染后续用例。
 */
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).getCurrentPages = () => []
  jest.restoreAllMocks()
})

describe('resolveHomeByRole', () => {
  it('服务人员落到任务池', () => {
    expect(resolveHomeByRole('staff')).toEqual({ key: 'taskPool' })
  })

  it('管理员在 adminInMiniProgram 关闭时回落首页（避免跳到不可用分包）', () => {
    expect(resolveHomeByRole('admin')).toEqual({ key: 'home' })
  })

  it('老人 / 家属回首页（角色由目标页从 userStore 读取，不经 query 传递）', () => {
    expect(resolveHomeByRole('elder')).toEqual({ key: 'home' })
    expect(resolveHomeByRole('family')).toEqual({ key: 'home' })
  })

  it('游客回首页', () => {
    expect(resolveHomeByRole('guest')).toEqual({ key: 'home' })
  })
})

describe('router.push', () => {
  it('普通页面走 navigateTo，并带上编码后的 query', () => {
    router.push('booking', { itemId: 'A1', title: '陪同就医' })
    expect(wxMock.navigateTo).toHaveBeenCalledTimes(1)
    const url = wxMock.navigateTo.mock.calls[0][0].url as string
    expect(url.startsWith(`${ROUTES.booking}?`)).toBe(true)
    expect(url).toContain('itemId=A1')
    expect(url).toContain(`title=${encodeURIComponent('陪同就医')}`)
  })

  it('目标是 tabBar 页时自动改用 switchTab（否则会跳转失败）', () => {
    router.push('home')
    expect(wxMock.switchTab).toHaveBeenCalledWith({ url: ROUTES.home })
    expect(wxMock.navigateTo).not.toHaveBeenCalled()
  })

  it('页面栈达到上限时退化为 redirectTo', () => {
    const pages = new Array(10).fill({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).getCurrentPages = () => pages
    router.push('booking', { itemId: 'A1' })
    expect(wxMock.redirectTo).toHaveBeenCalledTimes(1)
    expect(wxMock.navigateTo).not.toHaveBeenCalled()
  })

  it('query 中的空值会被丢弃，不产生 key=', () => {
    router.push('webview', { url: 'https://example.com', title: '' })
    const url = wxMock.navigateTo.mock.calls[0][0].url as string
    expect(url).not.toContain('title=')
  })
})

describe('router.switchTo / back', () => {
  it('非 tab 页用 reLaunch（清空页面栈，用于员工端入口）', () => {
    router.switchTo('taskPool')
    expect(wxMock.reLaunch).toHaveBeenCalledWith({ url: ROUTES.taskPool })
  })

  it('tab 页用 switchTab 且不带 query', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    router.switchTo('order', { status: 'ALL' })
    expect(wxMock.switchTab).toHaveBeenCalledWith({ url: ROUTES.order })
    warn.mockRestore()
  })

  it('向 tab 页传 query 时告警而不是静默丢弃（避免以后排查困难）', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    router.switchTo('order', { status: 'ALL' })
    expect(warn).toHaveBeenCalledTimes(1)
    const [tag, payload] = warn.mock.calls[0]
    expect(tag).toBe('router.switchTab')
    expect(payload).toMatchObject({ path: ROUTES.order, keys: ['status'] })
    // 参数仍被忽略（switchTab 不支持 query），但已提示改用 appStore
    expect(wxMock.switchTab).toHaveBeenCalledWith({ url: ROUTES.order })
  })

  it('向 tab 页传空值 query 时不告警（等价于没传）', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    router.switchTo('order', { status: '' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('没有上一页时 back 回首页', () => {
    router.back()
    expect(wxMock.switchTab).toHaveBeenCalledWith({ url: ROUTES.home })
  })
})
