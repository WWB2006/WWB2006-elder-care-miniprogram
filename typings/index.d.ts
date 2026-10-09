/// <reference types="miniprogram-api-typings" />

/** 角色：游客 / 老人 / 家属 / 服务人员 / 机构管理员 */
type Role = 'guest' | 'elder' | 'family' | 'staff' | 'admin'

interface IUserProfile {
  userId: string
  role: Role
  nickname: string
  avatarUrl: string
  /** 手机号，后端脱敏后返回（如 138****8000） */
  phoneMasked?: string
  /** 服务人员所属机构；老人/家属为已绑定的机构 */
  orgId?: string
  orgName?: string
  /** 实名认证 / 护理员资格证核验状态 */
  verifyStatus: 'none' | 'pending' | 'passed' | 'rejected'
}

/** 统一响应体（后端必须遵循，见 docs/设计方案.md 第 8 节） */
interface IApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  traceId?: string
  timestamp?: number
}

interface IPageQuery {
  [key: string]: string | undefined
}

/** 分页请求 / 响应 */
interface IPageParams {
  pageNum: number
  pageSize: number
}

interface IPageResult<T> {
  list: T[]
  total: number
  pageNum: number
  pageSize: number
  hasMore: boolean
}

/**
 * 小程序 App 全局态。
 * 刻意不使用官方示例中的 IAppOption 名称，避免与 miniprogram-api-typings 的全局声明冲突。
 */
interface IElderAppOption {
  globalData: {
    role: Role
    elderMode: boolean
    systemFontSizeSetting: number
    safeAreaBottom: number
    launchAt: number
  }
  initSystemInfo(): void
  syncElderMode(enabled: boolean): void
  restoreLoginState(): Promise<void>
  setupErrorHandler(): void
  checkUpdate(): void
  onLaunch(options: IAppLaunchOption): void
  onShow(options: IAppLaunchOption): void
  onHide(): void
  onError(error: string): void
  onUnhandledRejection(res: IUnhandledRejection): void
  onPageNotFound(res: IPageNotFoundOption): void
}

/** 冷启动 / 切前台参数（只声明本项目用到的字段） */
interface IAppLaunchOption {
  path: string
  query: Record<string, string>
  scene: number
  shareTicket?: string
  /** 官方类型为 ReferrerInfo，这里不关心内部结构，用 unknown 保持结构兼容 */
  referrerInfo?: unknown
}

interface IUnhandledRejection {
  reason: unknown
  promise: Promise<unknown>
}

interface IPageNotFoundOption {
  path: string
  query: Record<string, string>
  isEntryPage: boolean
}

/** 全局埋点事件名（新增事件需同步到 docs/设计方案.md 第 10 节指标体系） */
type TrackEvent =
  | 'app_launch'
  | 'app_show'
  | 'app_hide'
  | 'network_change'
  | 'login_success'
  | 'sos_trigger'
  | 'sos_call_fallback'
  | 'service_order_submit'
  | 'task_checkin'
  | 'service_log_submit'
