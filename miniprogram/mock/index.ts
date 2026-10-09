/**
 * Mock 分发器。
 *
 * 职责：把「method + path + 参数」映射为统一响应体 `IApiResponse`，
 * 由 `utils/request.ts` 在 `env.enableMock` 打开时优先调用。
 *
 * 三条设计原则：
 * 1. **未覆盖的路由必须显式报错**，不能静默回落到真实请求。
 *    否则开发者会看到「网络连接失败」而不是「mock 没写」，排查方向完全跑偏。
 * 2. **状态可变更**：取消订单、接单、新增用药要真的改内存数据，
 *    这样「操作后列表刷新」这类交互才验证得出来。
 * 3. **延迟可调**：默认 150ms 让 loading 态可见；单测里调成 0 保证速度。
 */
import { OrderStatus, ServiceCategory } from '../api/types'
import type { IElderProfile, IOrderBrief, IServiceItem, IStaffTask, IVitalSign } from '../api/types'
import type { HealthReport, MedicationReminder } from '../api/health'
import type { IShiftDay } from '../api/staff'
import type { IOrganization } from '../api/service'
import {
  MOCK_ELDERS,
  MOCK_ELDER_ID,
  MOCK_HEALTH_REPORT,
  MOCK_MEDICATIONS,
  MOCK_ORDERS,
  MOCK_ORGANIZATIONS,
  MOCK_SCHEDULE,
  MOCK_SERVICES,
  MOCK_STAFF_TASKS,
  MOCK_USER,
  MOCK_VITALS,
  buildOrderTimeline,
  dateOnly,
  isoLocal,
} from './fixtures'

// ---------------------------------------------------------------- 运行状态

/** 深拷贝一份初始数据，避免 mock 的写操作污染 fixtures 常量 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

interface IMockState {
  orders: IOrderBrief[]
  medications: MedicationReminder[]
  vitals: IVitalSign[]
  services: IServiceItem[]
  tasks: IStaffTask[]
  organizations: IOrganization[]
  schedule: IShiftDay[]
  elders: IElderProfile[]
}

function createState(): IMockState {
  return {
    orders: clone(MOCK_ORDERS),
    medications: clone(MOCK_MEDICATIONS),
    vitals: clone(MOCK_VITALS),
    services: clone(MOCK_SERVICES),
    tasks: clone(MOCK_STAFF_TASKS),
    organizations: clone(MOCK_ORGANIZATIONS),
    schedule: clone(MOCK_SCHEDULE),
    elders: clone(MOCK_ELDERS),
  }
}

let state = createState()

/** 供单测复位，避免用例之间互相污染 */
export function resetMockState(): void {
  state = createState()
}

let latencyMs = 150

/** 模拟网络延迟；单测里设为 0 */
export function setMockLatency(ms: number): void {
  latencyMs = Math.max(0, ms)
}

export function getMockLatency(): number {
  return latencyMs
}

let seq = 0
function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq}`
}

// ---------------------------------------------------------------- 工具

function ok<T>(data: T, message = 'ok'): IApiResponse<T> {
  return { code: 0, message, data, traceId: `mock-${nextId('t')}`, timestamp: Date.now() }
}

function fail(code: number, message: string): IApiResponse<never> {
  return { code, message, data: undefined as never, traceId: `mock-${nextId('t')}` }
}

function paginate<T>(list: T[], query: Record<string, unknown>): IPageResult<T> {
  const pageNum = Math.max(1, Number(query.pageNum) || 1)
  const pageSize = Math.max(1, Number(query.pageSize) || 10)
  const start = (pageNum - 1) * pageSize
  const slice = list.slice(start, start + pageSize)
  return {
    list: slice,
    total: list.length,
    pageNum,
    pageSize,
    hasMore: start + slice.length < list.length,
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

function str(input: unknown): string {
  return typeof input === 'string' ? input : ''
}

// ---------------------------------------------------------------- 路由表

interface IRouteContext {
  /** 路径参数，如 :itemId */
  params: Record<string, string>
  /** GET 的 query / POST 的 body */
  input: Record<string, unknown>
}

interface IRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 形如 /service/items/:itemId */
  path: string
  handle: (ctx: IRouteContext) => IApiResponse<unknown>
}

/** 把 /a/:b/c 编译为 ^/a/([^/]+)/c$，并记录参数名顺序 */
function compile(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = []
  const pattern = path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      keys.push(segment.slice(1))
      return '([^/]+)'
    })
    .join('/')
  return { regex: new RegExp(`^${pattern}$`), keys }
}

const ROUTES: IRoute[] = [
  // ------------------------------------------------------------ 认证 / 用户
  {
    method: 'POST',
    path: '/auth/login',
    handle: ({ input }) => {
      // 静默登录与手机号登录都返回同一个账号；真机上 role 由后端按 openid 判定
      const scene = str(input.scene) || 'silent'
      return ok({
        accessToken: `mock-access-${nextId('a')}`,
        refreshToken: `mock-refresh-${nextId('r')}`,
        role: 'family' as Role,
        profile: scene === 'phone' ? MOCK_USER : { ...MOCK_USER },
      })
    },
  },
  { method: 'POST', path: '/auth/refresh', handle: () => ok({ accessToken: `mock-access-${nextId('a')}`, refreshToken: `mock-refresh-${nextId('r')}` }) },
  { method: 'POST', path: '/auth/logout', handle: () => ok(undefined) },
  { method: 'GET', path: '/user/profile', handle: () => ok(MOCK_USER) },
  { method: 'POST', path: '/user/phone', handle: () => ok({ phoneMasked: MOCK_USER.phoneMasked || '138****8000' }) },
  {
    method: 'POST',
    path: '/user/family/bind',
    handle: ({ input }) => {
      const elderId = str(input.elderId)
      if (!state.elders.some((e) => e.elderId === elderId)) {
        return fail(40401, '未找到该老人档案，请核对老人编号')
      }
      return ok({ relation: '家属' })
    },
  },
  { method: 'GET', path: '/user/family/elders', handle: () => ok(state.elders) },

  // ------------------------------------------------------------ 服务
  {
    method: 'GET',
    path: '/service/items',
    handle: ({ input }) => {
      const category = str(input.category)
      const keyword = str(input.keyword).trim()
      let list = state.services
      if (category) list = list.filter((item) => item.category === category)
      if (keyword) {
        const kw = keyword.toLowerCase()
        list = list.filter(
          (item) =>
            item.name.toLowerCase().includes(kw) ||
            item.orgName.toLowerCase().includes(kw) ||
            item.description.toLowerCase().includes(kw),
        )
      }
      return ok(paginate(list, input))
    },
  },
  {
    method: 'GET',
    path: '/service/items/:itemId',
    handle: ({ params }) => {
      const item = state.services.find((s) => s.id === params.itemId)
      return item ? ok(item) : fail(40401, '服务项目不存在或已下架')
    },
  },
  {
    method: 'GET',
    path: '/service/categories',
    handle: () =>
      ok(
        Object.values(ServiceCategory).map((category) => ({
          category,
          name: category,
          icon: `cat-${category}`,
        })),
      ),
  },
  {
    method: 'GET',
    path: '/service/organizations/nearby',
    handle: ({ input }) => ok(paginate(state.organizations, input)),
  },
  {
    method: 'GET',
    path: '/service/slots',
    handle: ({ input }) => {
      const date = str(input.date) || dateOnly(new Date())
      // 构造 09:00 起的整点时段，偶数点可约、奇数点已满，保证两种状态都渲染得到
      return ok(
        Array.from({ length: 8 }, (_, i) => {
          const hour = 9 + i
          const available = i % 2 === 0
          return {
            startAt: `${date}T${String(hour).padStart(2, '0')}:00:00`,
            endAt: `${date}T${String(hour).padStart(2, '0')}:59:59`,
            available,
            staffId: available ? `staff_00${(i % 3) + 1}` : undefined,
          }
        }),
      )
    },
  },
  {
    method: 'GET',
    path: '/elder/:elderId',
    handle: ({ params }) => {
      const elder = state.elders.find((e) => e.elderId === params.elderId)
      return elder ? ok(elder) : fail(40401, '未找到该老人档案')
    },
  },

  // ------------------------------------------------------------ 订单
  {
    method: 'GET',
    path: '/orders',
    handle: ({ input }) => {
      const status = str(input.status)
      const list =
        !status || status === 'ALL' ? state.orders : state.orders.filter((o) => o.status === status)
      return ok(paginate(list, input))
    },
  },
  {
    method: 'POST',
    path: '/orders',
    handle: ({ input }) => {
      const service = state.services.find((s) => s.id === str(input.itemId))
      const elder = state.elders.find((e) => e.elderId === str(input.elderId))
      const order: IOrderBrief = {
        orderId: nextId('order'),
        orderNo: `EC${dateOnly(new Date()).replace(/-/g, '')}${String(9000 + seq)}`,
        serviceName: service?.name || '上门服务',
        status: str(input.payChannel) === 'wechat' ? OrderStatus.PENDING_PAY : OrderStatus.PENDING_DISPATCH,
        appointmentAt: str(input.appointmentAt) || isoLocal(new Date()),
        amountCents: service?.priceCents ?? 0,
        elderName: elder?.name || '未指定',
        orgName: service?.orgName || '',
        coverUrl: service?.coverUrl || '',
        createdAt: isoLocal(new Date()),
      }
      state.orders.unshift(order)
      return ok(order)
    },
  },
  {
    method: 'GET',
    path: '/orders/:orderId',
    handle: ({ params }) => {
      const order = state.orders.find((o) => o.orderId === params.orderId)
      return order ? ok({ ...order, timeline: buildOrderTimeline(order) }) : fail(40401, '订单不存在')
    },
  },
  {
    method: 'POST',
    path: '/orders/:orderId/cancel',
    handle: ({ params }) => {
      const order = state.orders.find((o) => o.orderId === params.orderId)
      if (!order) return fail(40401, '订单不存在')
      if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELED) {
        return fail(40901, '该订单当前状态不支持取消')
      }
      order.status = OrderStatus.CANCELED
      return ok(undefined, '订单已取消')
    },
  },
  {
    method: 'POST',
    path: '/orders/:orderId/pay',
    handle: ({ params }) => {
      const order = state.orders.find((o) => o.orderId === params.orderId)
      if (!order) return fail(40401, '订单不存在')
      order.status = OrderStatus.PENDING_DISPATCH
      // 支付参数由后端统一下单后返回，前端不接触商户密钥
      return ok({
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: nextId('nonce'),
        package: `prepay_id=mock_${params.orderId}`,
        signType: 'RSA' as const,
        paySign: 'MOCK_SIGN',
      })
    },
  },
  {
    method: 'POST',
    path: '/orders/:orderId/confirm',
    handle: ({ params }) => {
      const order = state.orders.find((o) => o.orderId === params.orderId)
      if (!order) return fail(40401, '订单不存在')
      order.status = OrderStatus.COMPLETED
      return ok(undefined, '已确认完成')
    },
  },
  {
    method: 'POST',
    path: '/orders/:orderId/evaluate',
    handle: () => ok(undefined, '评价已提交，感谢您的反馈'),
  },
  {
    method: 'POST',
    path: '/orders/:orderId/track/subscribe',
    handle: ({ params }) =>
      ok({ trackToken: `track_${params.orderId}`, expireAt: Date.now() + 30 * 60 * 1000 }),
  },

  // ------------------------------------------------------------ 健康
  {
    method: 'GET',
    path: '/health/vitals',
    handle: ({ input }) => {
      const elderId = str(input.elderId)
      const type = str(input.type)
      let list = state.vitals
      if (elderId) list = list.filter((v) => v.elderId === elderId)
      if (type) list = list.filter((v) => v.type === type)
      return ok(paginate(list, input))
    },
  },
  {
    method: 'POST',
    path: '/health/vitals',
    handle: ({ input }) => {
      const record: IVitalSign = {
        recordId: nextId('vital'),
        elderId: str(input.elderId) || MOCK_ELDER_ID,
        type: (str(input.type) || 'blood_pressure') as IVitalSign['type'],
        values: asRecord(input.values) as Record<string, number>,
        measuredAt: str(input.measuredAt) || isoLocal(new Date()),
        source: 'manual',
        abnormal: false,
      }
      state.vitals.unshift(record)
      return ok(record)
    },
  },
  {
    method: 'GET',
    path: '/health/report',
    handle: ({ input }) => {
      const period = str(input.period)
      const report: HealthReport = {
        ...MOCK_HEALTH_REPORT,
        periodLabel: period === 'month' ? '最近 30 天' : '最近 7 天',
      }
      return ok(report)
    },
  },
  {
    method: 'GET',
    path: '/health/medications',
    handle: ({ input }) => {
      const elderId = str(input.elderId)
      return ok(elderId ? state.medications.filter((m) => m.elderId === elderId) : state.medications)
    },
  },
  {
    method: 'POST',
    path: '/health/medications',
    handle: ({ input }) => {
      const reminderId = str(input.reminderId)
      const record: MedicationReminder = {
        reminderId: reminderId || nextId('med'),
        elderId: str(input.elderId) || MOCK_ELDER_ID,
        medicineName: str(input.medicineName) || '未命名药品',
        dosage: str(input.dosage),
        times: Array.isArray(input.times) ? (input.times as string[]) : [],
        startDate: str(input.startDate) || dateOnly(new Date()),
        endDate: str(input.endDate) || dateOnly(new Date()),
        enabled: input.enabled !== false,
        notifyFamily: input.notifyFamily === true,
      }
      const index = state.medications.findIndex((m) => m.reminderId === record.reminderId)
      if (index >= 0) state.medications[index] = record
      else state.medications.unshift(record)
      return ok(record, index >= 0 ? '已更新' : '已添加')
    },
  },
  {
    method: 'POST',
    path: '/health/devices/bind',
    handle: ({ input }) => {
      const sn = str(input.deviceSn)
      if (!/^[A-Za-z0-9-]{4,32}$/.test(sn)) return fail(40001, '设备序列号格式不正确')
      return ok({ deviceId: nextId('device') }, '设备绑定成功')
    },
  },
  {
    method: 'POST',
    path: '/sos/trigger',
    handle: () => ok({ sosId: nextId('sos'), handledBy: '值班护士 王芳', expectCallSeconds: 30 }, '已通知值班人员'),
  },

  // ------------------------------------------------------------ 服务人员
  {
    method: 'GET',
    path: '/staff/tasks',
    handle: ({ input }) => {
      const scope = str(input.scope) || 'pool'
      const status = str(input.status)
      let list = state.tasks
      if (scope === 'mine') {
        list = list.filter((t) =>
          [OrderStatus.DISPATCHED, OrderStatus.ACCEPTED, OrderStatus.IN_SERVICE].includes(t.status),
        )
      } else if (scope === 'history') {
        list = list.filter((t) =>
          [OrderStatus.COMPLETED, OrderStatus.CANCELED, OrderStatus.REFUNDED].includes(t.status),
        )
      } else {
        list = list.filter((t) => t.status === OrderStatus.PENDING_DISPATCH)
      }
      if (status) list = list.filter((t) => t.status === status)
      return ok(paginate(list, input))
    },
  },
  {
    method: 'GET',
    path: '/staff/tasks/:taskId',
    handle: ({ params }) => {
      const task = state.tasks.find((t) => t.taskId === params.taskId)
      return task ? ok(task) : fail(40401, '任务不存在')
    },
  },
  {
    method: 'POST',
    path: '/staff/tasks/:taskId/accept',
    handle: ({ params }) => {
      const task = state.tasks.find((t) => t.taskId === params.taskId)
      if (!task) return fail(40401, '任务不存在')
      if (task.status !== OrderStatus.PENDING_DISPATCH) {
        return fail(40902, '手慢了，该任务已被其他服务人员接单')
      }
      task.status = OrderStatus.ACCEPTED
      return ok(undefined, '接单成功')
    },
  },
  {
    method: 'POST',
    path: '/staff/tasks/checkin',
    handle: ({ input }) => {
      // 精度过低标记为可疑打卡，交由管理员复核（与设计方案第 6.5 节一致）
      const accuracy = Number(input.accuracy) || 0
      return ok({ checkinId: nextId('checkin'), suspicious: accuracy > 200 })
    },
  },
  {
    method: 'POST',
    path: '/staff/tasks/service-log',
    handle: ({ input }) => {
      const task = state.tasks.find((t) => t.taskId === str(input.taskId))
      if (task) task.status = OrderStatus.PENDING_CONFIRM
      return ok({ logId: nextId('log') }, '服务记录已提交')
    },
  },
  {
    method: 'GET',
    path: '/staff/schedule',
    handle: ({ input }) => {
      const month = str(input.month)
      const list = month ? state.schedule.filter((d) => d.date.startsWith(month)) : state.schedule
      return ok(list)
    },
  },
  { method: 'POST', path: '/staff/leave', handle: () => ok(undefined, '申请已提交，等待管理员审批') },
]

const COMPILED = ROUTES.map((route) => ({ ...route, ...compile(route.path) }))

/** 当前 mock 覆盖的路由数，供日志与单测使用 */
export function getRouteCount(): number {
  return COMPILED.length
}

/**
 * 分发一次请求。
 * @returns 命中的响应体；**未命中时返回 null**，由调用方决定如何处理（见 request.ts）
 */
export function mockDispatch(
  method: string,
  path: string,
  input?: unknown,
): IApiResponse<unknown> | null {
  const normalized = path.split('?')[0]
  for (const route of COMPILED) {
    if (route.method !== method.toUpperCase()) continue
    const matched = route.regex.exec(normalized)
    if (!matched) continue
    const params: Record<string, string> = {}
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(matched[index + 1])
    })
    try {
      return route.handle({ params, input: asRecord(input) })
    } catch (err) {
      return fail(50001, `mock 处理异常：${String(err)}`)
    }
  }
  return null
}

/** 未覆盖路由的提示文案，避免开发者误以为是网络问题 */
export function unmockedMessage(method: string, path: string): string {
  return `mock 未覆盖该接口（${method.toUpperCase()} ${path}），请在 miniprogram/mock/index.ts 中补充`
}

/** 带延迟的 Promise 包装 */
export function delay<T>(value: T): Promise<T> {
  if (latencyMs <= 0) return Promise.resolve(value)
  return new Promise((resolve) => setTimeout(() => resolve(value), latencyMs))
}
