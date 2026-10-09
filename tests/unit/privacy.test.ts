/**
 * 隐私合规单测。
 * 监管要求：处理个人信息前必须获得用户同意；健康等敏感信息需「单独同意」，且必须提供撤回入口。
 * 这些是合规红线，用测试把行为固定住，避免后续重构时被顺手删掉。
 */
import {
  isPrivacyAgreed,
  markPrivacyAgreed,
  requestSystemPermission,
  requirePrivacy,
  revokePrivacy,
} from '../../miniprogram/utils/privacy'
import { wxMock } from '../setup/wx'

type ModalOption = {
  title?: string
  content?: string
  confirmText?: string
  success?: (res: { confirm: boolean; cancel: boolean }) => void
  fail?: (err: unknown) => void
}

const showModal = wxMock.showModal as unknown as jest.Mock

/**
 * 让下一次 showModal 以指定结果返回。
 * 注意要同时满足两种调用风格：requirePrivacy 用回调式，requestSystemPermission 用 await 式。
 */
function answerModal(confirm: boolean): void {
  showModal.mockImplementationOnce((options: ModalOption) => {
    const res = { confirm, cancel: !confirm }
    options.success?.(res)
    return Promise.resolve(res)
  })
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('同意状态的读写', () => {
  it('默认未同意', () => {
    expect(isPrivacyAgreed('health')).toBe(false)
  })

  it('标记同意后可读回，且各 scope 相互独立', () => {
    markPrivacyAgreed('health')
    expect(isPrivacyAgreed('health')).toBe(true)
    expect(isPrivacyAgreed('location')).toBe(false)
  })

  it('撤回授权后回到未同意状态（合规要求必须能撤回）', () => {
    markPrivacyAgreed('album')
    revokePrivacy('album')
    expect(isPrivacyAgreed('album')).toBe(false)
  })

  it('不同 scope 的同意状态互不覆盖', () => {
    markPrivacyAgreed('camera')
    markPrivacyAgreed('phone')
    revokePrivacy('camera')
    expect(isPrivacyAgreed('camera')).toBe(false)
    expect(isPrivacyAgreed('phone')).toBe(true)
  })
})

describe('requirePrivacy', () => {
  it('已同意过时直接放行，不重复弹窗', async () => {
    markPrivacyAgreed('health')
    await expect(requirePrivacy('health')).resolves.toBe(true)
    expect(showModal).not.toHaveBeenCalled()
  })

  it('用户点击同意后放行并落库', async () => {
    answerModal(true)
    await expect(requirePrivacy('health')).resolves.toBe(true)
    expect(isPrivacyAgreed('health')).toBe(true)
  })

  it('用户拒绝后不放行且不落库', async () => {
    answerModal(false)
    await expect(requirePrivacy('health')).resolves.toBe(false)
    expect(isPrivacyAgreed('health')).toBe(false)
  })

  it('弹窗失败时按「未同意」处理，不抛异常', async () => {
    showModal.mockImplementationOnce((options: ModalOption) => {
      options.fail?.(new Error('modal failed'))
      return Promise.resolve({ confirm: false, cancel: true })
    })
    await expect(requirePrivacy('location')).resolves.toBe(false)
    expect(isPrivacyAgreed('location')).toBe(false)
  })

  it('敏感信息（健康）弹窗需说明用途，不能只给一句「是否同意」', async () => {
    answerModal(true)
    await requirePrivacy('health')

    const options = showModal.mock.calls[0][0] as ModalOption
    expect(options.title).toContain('健康')
    expect(options.content).toContain('敏感个人信息')
    expect(options.content).toContain('撤回')
  })

  it('五类 scope 都有对应文案，不会出现 undefined', async () => {
    const scopes = ['location', 'album', 'camera', 'health', 'phone'] as const
    for (const scope of scopes) {
      answerModal(true)
      await requirePrivacy(scope)
      const options = showModal.mock.calls[showModal.mock.calls.length - 1][0] as ModalOption
      expect(typeof options.title).toBe('string')
      expect((options.title as string).length).toBeGreaterThan(0)
      expect((options.content as string).length).toBeGreaterThan(0)
    }
  })
})

describe('requestSystemPermission', () => {
  const getSetting = wxMock.getSetting as unknown as jest.Mock
  const authorize = wxMock.authorize as unknown as jest.Mock
  const openSetting = wxMock.openSetting as unknown as jest.Mock

  it('已授权时直接返回 true，不重复申请', async () => {
    getSetting.mockResolvedValue({ authSetting: { 'scope.userLocation': true } })

    await expect(requestSystemPermission('scope.userLocation')).resolves.toBe(true)
    expect(authorize).not.toHaveBeenCalled()
  })

  it('未授权但用户当场同意时返回 true', async () => {
    getSetting.mockResolvedValue({ authSetting: {} })
    authorize.mockResolvedValue(undefined)

    await expect(requestSystemPermission('scope.camera')).resolves.toBe(true)
  })

  it('被拒后引导去设置页，用户取消则返回 false', async () => {
    getSetting.mockResolvedValue({ authSetting: {} })
    authorize.mockRejectedValue(new Error('auth deny'))
    answerModal(false)

    await expect(requestSystemPermission('scope.userLocation')).resolves.toBe(false)
    expect(openSetting).not.toHaveBeenCalled()
  })

  it('被拒后前往设置页并开启成功时返回 true', async () => {
    getSetting.mockResolvedValue({ authSetting: {} })
    authorize.mockRejectedValue(new Error('auth deny'))
    answerModal(true)
    openSetting.mockResolvedValue({ authSetting: { 'scope.userLocation': true } })

    await expect(requestSystemPermission('scope.userLocation')).resolves.toBe(true)
  })

  it('前往设置页后仍未开启则返回 false', async () => {
    getSetting.mockResolvedValue({ authSetting: {} })
    authorize.mockRejectedValue(new Error('auth deny'))
    answerModal(true)
    openSetting.mockResolvedValue({ authSetting: { 'scope.userLocation': false } })

    await expect(requestSystemPermission('scope.userLocation')).resolves.toBe(false)
  })
})
