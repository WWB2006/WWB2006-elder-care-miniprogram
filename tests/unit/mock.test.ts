/**
 * Mock 层的单元测试。
 *
 * 背景：`env.enableMock` 此前只是一个声明过的字段，没有任何代码消费它，
 * 而 dev 域名全是占位域名 —— 结果就是开发者工具里每个列表页都「暂时加载失败」。
 * 本文件把 mock 层的三条契约固定下来：
 * 1. **覆盖完整**：`api/` 里每个调用点都必须有对应路由，否则真机/模拟器上会缺数据；
 * 2. **未覆盖要报错**：不能静默回落成「网络连接失败」，那是误导性的排查方向；
 * 3. **状态可变更**：取消订单、接单等写操作要真的改内存数据，否则交互验证不出来。
 */
import { OrderStatus, ServiceCategory } from '../../miniprogram/api/types'
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  evaluateOrder,
  getOrderDetail,
  getOrderList,
  getPayParams,
  subscribeServiceTrack,
} from '../../miniprogram/api/order'
import {
  getAvailableSlots,
  getCategories,
  getElderProfile,
  getNearbyOrganizations,
  getServiceDetail,
  getServiceList,
} from '../../miniprogram/api/service'
import {
  acceptTask,
  applyLeave,
  checkinTask,
  getSchedule,
  getTaskDetail,
  getTaskList,
  submitServiceLog,
} from '../../miniprogram/api/staff'
import {
  bindDevice,
  getHealthReport,
  getMedicationList,
  getVitalList,
  recordVital,
  saveMedication,
  triggerSos,
} from '../../miniprogram/api/health'
import {
  bindElder,
  bindPhone,
  getBoundElders,
  getUserProfile,
  login,
  logoutApi,
} from '../../miniprogram/api/user'
import {
  getRouteCount,
  mockDispatch,
  resetMockState,
  setMockLatency,
  unmockedMessage,
} from '../../miniprogram/mock'
import { env } from '../../miniprogram/utils/env'
import { ApiError, http, uploadFile } from '../../miniprogram/utils/request'
import { wxMock } from '../setup/wx'

const requestMock = wxMock.request as unknown as jest.Mock
const uploadMock = wxMock.uploadFile as unknown as jest.Mock

/** 让用例显式选择是否走 mock */
function useMock(): void {
  env.enableMock = true
  setMockLatency(0)
}

beforeEach(() => {
  resetMockState()
  /**
   * 本文件的绝大多数用例走的是 `api/` 层（而不是直接调 mockDispatch），
   * 因此默认打开 mock；只有「关闭 mock 应走真实请求」那一条显式关掉。
   * 注意 after-env 的全局钩子默认是关的——那是为了不影响 request.test.ts。
   */
  useMock()
})

describe('mock 路由表 · 覆盖完整性', () => {
  /**
   * 与 miniprogram/api/ 下各文件逐一对应。
   * 新增接口时如果忘了补 mock，这条用例会失败——这正是它存在的意义。
   */
  const API_ROUTES: Array<[string, string, unknown?]> = [
    // user.ts
    ['POST', '/auth/login', { code: 'x', scene: 'silent' }],
    ['GET', '/user/profile'],
    ['POST', '/user/phone', { phoneCode: 'c' }],
    ['POST', '/user/family/bind', { elderId: 'elder_001', verifyCode: '1234' }],
    ['GET', '/user/family/elders'],
    ['POST', '/auth/logout'],
    // service.ts
    ['GET', '/service/items', { pageNum: 1, pageSize: 10 }],
    ['GET', '/service/items/svc_001'],
    ['GET', '/service/categories'],
    ['GET', '/service/organizations/nearby', { pageNum: 1, pageSize: 20 }],
    ['GET', '/service/slots', { itemId: 'svc_001', elderId: 'elder_001', date: '2026-10-09' }],
    ['GET', '/elder/elder_001'],
    // order.ts
    ['POST', '/orders', { itemId: 'svc_001', elderId: 'elder_001', payChannel: 'wechat' }],
    ['GET', '/orders', { pageNum: 1, pageSize: 10 }],
    ['GET', '/orders/order_001'],
    ['POST', '/orders/order_001/cancel', { reason: '临时有事' }],
    ['POST', '/orders/order_001/pay'],
    ['POST', '/orders/order_001/confirm'],
    ['POST', '/orders/order_001/evaluate', { score: 5, tags: [], content: '' }],
    ['POST', '/orders/order_001/track/subscribe'],
    // health.ts
    ['POST', '/health/vitals', { elderId: 'elder_001', type: 'heart_rate', values: { value: 70 } }],
    ['GET', '/health/vitals', { elderId: 'elder_001', pageNum: 1, pageSize: 10 }],
    ['GET', '/health/report', { elderId: 'elder_001', period: 'week' }],
    ['GET', '/health/medications', { elderId: 'elder_001' }],
    ['POST', '/health/medications', { elderId: 'elder_001', medicineName: '药' }],
    ['POST', '/health/devices/bind', { elderId: 'elder_001', deviceType: 'band', deviceSn: 'SN-1234', deviceName: '手环' }],
    ['POST', '/sos/trigger', { elderId: 'elder_001', triggerType: 'button' }],
    // staff.ts
    ['GET', '/staff/tasks', { scope: 'pool', pageNum: 1, pageSize: 10 }],
    ['GET', '/staff/tasks/task_001'],
    ['POST', '/staff/tasks/task_004/accept'],
    ['POST', '/staff/tasks/checkin', { taskId: 'task_001', accuracy: 20 }],
    ['POST', '/staff/tasks/service-log', { taskId: 'task_001', items: [], photoFileIds: [] }],
    ['GET', '/staff/schedule', { month: '2026-10' }],
    ['POST', '/staff/leave', { date: '2026-10-10', reason: '事假', type: 'leave' }],
    // request.ts 内部
    ['POST', '/auth/refresh', { refreshToken: 'r' }],
  ]

  /**
   * 用 forEach 而不是 it.each：
   * it.each 会按「测试函数形参个数 > 用例数组长度」判定这是 done 回调风格的用例，
   * 而本表里有若干行省略了 input（长度 2），于是形参 3 > 2，jest 误以为在等 done()，
   * 全部超时。显式循环没有这个歧义。
   */
  API_ROUTES.forEach(([method, path, input]) => {
    it(`${method} ${path} 有 mock 路由`, () => {
      const res = mockDispatch(method, path, input)
      expect(res).not.toBeNull()
    })
  })

  it('未覆盖的路由返回 null（由调用方决定如何报错）', () => {
    expect(mockDispatch('GET', '/not/implemented')).toBeNull()
    // 方法不匹配也算未覆盖：GET /auth/login 没有注册
    expect(mockDispatch('GET', '/auth/login')).toBeNull()
  })

  it('未覆盖提示文案同时包含方法与路径，便于定位', () => {
    const msg = unmockedMessage('GET', '/foo/bar')
    expect(msg).toContain('GET')
    expect(msg).toContain('/foo/bar')
  })

  it('路由数量与列表规模一致（防止漏注册）', () => {
    expect(getRouteCount()).toBe(API_ROUTES.length)
  })
})

describe('mock 分发 · 分页与过滤', () => {
  it('分页返回正确切片与 hasMore', () => {
    const page1 = mockDispatch('GET', '/service/items', { pageNum: 1, pageSize: 10 })
    const page2 = mockDispatch('GET', '/service/items', { pageNum: 2, pageSize: 10 })
    const data1 = page1?.data as IPageResult<{ id: string }>
    const data2 = page2?.data as IPageResult<{ id: string }>

    expect(data1.list).toHaveLength(10)
    expect(data1.total).toBe(16)
    expect(data1.hasMore).toBe(true)
    expect(data2.list).toHaveLength(6)
    expect(data2.hasMore).toBe(false)
    // 两页不重叠
    const ids = new Set(data1.list.map((i) => i.id))
    expect(data2.list.some((i) => ids.has(i.id))).toBe(false)
  })

  it('按分类过滤', () => {
    const res = mockDispatch('GET', '/service/items', {
      pageNum: 1,
      pageSize: 20,
      category: ServiceCategory.Meal,
    })
    const data = res?.data as IPageResult<{ category: ServiceCategory }>
    expect(data.list.length).toBeGreaterThan(0)
    expect(data.list.every((i) => i.category === ServiceCategory.Meal)).toBe(true)
  })

  it('关键词命中名称 / 机构 / 描述', () => {
    const byName = mockDispatch('GET', '/service/items', { pageNum: 1, pageSize: 20, keyword: '助浴' })
    expect((byName?.data as IPageResult<unknown>).total).toBeGreaterThan(0)

    const byOrg = mockDispatch('GET', '/service/items', { pageNum: 1, pageSize: 20, keyword: '康乐' })
    expect((byOrg?.data as IPageResult<unknown>).total).toBeGreaterThan(0)
  })

  it('关键词无结果时返回空列表而不是报错（页面需走空态）', () => {
    const res = mockDispatch('GET', '/service/items', { pageNum: 1, pageSize: 20, keyword: '不存在的东西xyz' })
    const data = res?.data as IPageResult<unknown>
    expect(data.list).toEqual([])
    expect(data.total).toBe(0)
    expect(data.hasMore).toBe(false)
    expect(res?.code).toBe(0)
  })

  it('分类与关键词可叠加', () => {
    const res = mockDispatch('GET', '/service/items', {
      pageNum: 1,
      pageSize: 20,
      category: ServiceCategory.Bath,
      keyword: '擦浴',
    })
    const data = res?.data as IPageResult<{ name: string; category: ServiceCategory }>
    // 「上门助浴（含擦浴）」与「床上擦浴护理」同属助浴且都含「擦浴」
    expect(data.total).toBe(2)
    expect(data.list.every((i) => i.name.includes('擦浴'))).toBe(true)
    expect(data.list.every((i) => i.category === ServiceCategory.Bath)).toBe(true)
  })

  it('pageSize 非法时兜底为 10，不会返回空页', () => {
    const res = mockDispatch('GET', '/service/items', { pageNum: 1, pageSize: 0 })
    expect((res?.data as IPageResult<unknown>).list.length).toBe(10)
  })
})

describe('mock 分发 · 写操作会改变状态', () => {
  it('取消订单后状态变为 CANCELED', async () => {
    const before = await getOrderList({ pageNum: 1, pageSize: 20 })
    const target = before.list.find((o) => o.status === OrderStatus.PENDING_DISPATCH)
    expect(target).toBeDefined()

    await cancelOrder(target!.orderId, '临时有事')

    const after = await getOrderList({ pageNum: 1, pageSize: 20 })
    expect(after.list.find((o) => o.orderId === target!.orderId)?.status).toBe(OrderStatus.CANCELED)
  })

  it('已完成订单不允许取消（返回业务错误码）', async () => {
    const list = await getOrderList({ pageNum: 1, pageSize: 20 })
    const done = list.list.find((o) => o.status === OrderStatus.COMPLETED)

    const res = mockDispatch('POST', `/orders/${done!.orderId}/cancel`, { reason: 'x' })
    expect(res?.code).toBe(40901)
    expect(res?.message).toContain('不支持取消')
  })

  it('任务池为空时接单返回「已被接单」而不是静默成功', async () => {
    const pool = await getTaskList({ scope: 'pool', pageNum: 1, pageSize: 10 })
    expect(pool.list.length).toBeGreaterThan(0)
    const taskId = pool.list[0].taskId

    // 第一次接单成功
    await acceptTask(taskId)
    // 第二次必须失败（同一单不能被两人接）
    const res = mockDispatch('POST', `/staff/tasks/${taskId}/accept`)
    expect(res?.code).toBe(40902)
  })

  it('resetMockState 让写操作不跨用例污染', async () => {
    const pool = await getTaskList({ scope: 'pool', pageNum: 1, pageSize: 10 })
    await acceptTask(pool.list[0].taskId)

    resetMockState()

    const again = await getTaskList({ scope: 'pool', pageNum: 1, pageSize: 10 })
    expect(again.list.map((t) => t.taskId)).toContain(pool.list[0].taskId)
  })

  it('订单详情返回时间轴，且已完成订单全部节点为 done', () => {
    const res = mockDispatch('GET', '/orders/order_007')
    const data = res?.data as { status: OrderStatus; timeline: Array<{ done: boolean }> }
    expect(data.timeline.length).toBeGreaterThan(0)
    expect(data.timeline.every((s) => s.done)).toBe(true)
  })

  it('不存在的订单返回 40401', () => {
    expect(mockDispatch('GET', '/orders/not-exist')?.code).toBe(40401)
    expect(mockDispatch('GET', '/service/items/not-exist')?.code).toBe(40401)
  })
})

describe('mock 分发 · 业务分支', () => {
  it('打卡精度过低标记为可疑', () => {
    expect((mockDispatch('POST', '/staff/tasks/checkin', { accuracy: 20 })?.data as { suspicious: boolean }).suspicious).toBe(false)
    expect((mockDispatch('POST', '/staff/tasks/checkin', { accuracy: 500 })?.data as { suspicious: boolean }).suspicious).toBe(true)
  })

  it('可约时段同时包含可约与已满两种状态（保证页面两种样式都渲染得到）', () => {
    const res = mockDispatch('GET', '/service/slots', { date: '2026-10-09' })
    const slots = res?.data as Array<{ available: boolean }>
    expect(slots.some((s) => s.available)).toBe(true)
    expect(slots.some((s) => !s.available)).toBe(true)
  })

  it('设备序列号格式非法时拒绝绑定', () => {
    expect(mockDispatch('POST', '/health/devices/bind', { deviceSn: '??' })?.code).toBe(40001)
    expect(mockDispatch('POST', '/health/devices/bind', { deviceSn: 'SN-1234' })?.code).toBe(0)
  })

  it('绑定不存在的老人档案会失败', () => {
    expect(mockDispatch('POST', '/user/family/bind', { elderId: 'nobody' })?.code).toBe(40401)
    expect(mockDispatch('POST', '/user/family/bind', { elderId: 'elder_001' })?.code).toBe(0)
  })

  it('新增用药会出现在后续列表里', async () => {
    const before = await getMedicationList('elder_001')
    mockDispatch('POST', '/health/medications', {
      elderId: 'elder_001',
      medicineName: '二甲双胍',
      dosage: '0.5g',
      times: ['12:00'],
    })
    const after = await getMedicationList('elder_001')
    expect(after.length).toBe(before.length + 1)
    expect(after.some((m) => m.medicineName === '二甲双胍')).toBe(true)
  })

  it('服务人员任务按 scope 过滤', async () => {
    const pool = await getTaskList({ scope: 'pool', pageNum: 1, pageSize: 20 })
    const mine = await getTaskList({ scope: 'mine', pageNum: 1, pageSize: 20 })
    const history = await getTaskList({ scope: 'history', pageNum: 1, pageSize: 20 })

    expect(pool.list.every((t) => t.status === OrderStatus.PENDING_DISPATCH)).toBe(true)
    expect(mine.list.every((t) => t.status !== OrderStatus.COMPLETED)).toBe(true)
    expect(history.list.every((t) => t.status === OrderStatus.COMPLETED)).toBe(true)
  })
})

describe('request 层集成 · 开关生效', () => {
  it('关闭 mock 时走真实请求路径（wx.request 被调用）', async () => {
    env.enableMock = false
    requestMock.mockImplementationOnce(() => undefined)
    // 不 resolve 也无妨，只要证明进了 wx.request 分支
    void http.get('/service/items', { pageNum: 1, pageSize: 10 }).catch(() => undefined)
    expect(requestMock).toHaveBeenCalledTimes(1)
  })

  it('打开 mock 时 getServiceList 返回数据且完全不发 wx.request', async () => {
    useMock()
    const res = await getServiceList({ pageNum: 1, pageSize: 10 })
    expect(res.list.length).toBe(10)
    expect(res.total).toBe(16)
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('打开 mock 时服务详情可用', async () => {
    useMock()
    const item = await getServiceDetail('svc_001')
    expect(item.id).toBe('svc_001')
    expect(item.name).toBeTruthy()
    expect(item.coverUrl.startsWith('/assets/icons/')).toBe(true)
  })

  it('mock 未覆盖的路由抛出 40400，而不是伪装成网络失败', async () => {
    useMock()
    await expect(http.get('/not/implemented')).rejects.toMatchObject({
      name: 'ApiError',
      code: 40400,
    })
  })

  it('mock 下的业务错误码原样抛给页面（如订单不可取消）', async () => {
    useMock()
    const list = await getOrderList({ pageNum: 1, pageSize: 20 })
    const done = list.list.find((o) => o.status === OrderStatus.COMPLETED)!

    let caught: unknown
    try {
      await cancelOrder(done.orderId, 'x')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe(40901)
  })

  it('上传文件在 mock 下不发 wx.uploadFile，直接返回可用的 fileId', async () => {
    useMock()
    const progress: number[] = []
    const res = await uploadFile('/tmp/a.png', 'checkin', (p) => progress.push(p))

    expect(uploadMock).not.toHaveBeenCalled()
    expect(res.fileId).toMatch(/^mock_file_/)
    expect(res.url).toBe('/tmp/a.png')
    expect(progress[progress.length - 1]).toBe(100)
  })
})

/**
 * 端到端冒烟：把 api/ 层每个导出函数都真实调用一遍。
 *
 * 为什么不能只测 mockDispatch：路由匹配成功 ≠ 页面拿得到数据。
 * 参数怎么传、返回值结构对不对，只有经过 api 层才能验证。
 * 这条用例通过，等于「所有页面的数据源在无后端时都通」。
 */
describe('api 层端到端 · mock 下全部接口可调用', () => {
  const ELDER = 'elder_001'
  const ITEM = 'svc_001'

  it('用户 / 认证域', async () => {
    const logged = await login({ code: 'mock-code', scene: 'silent' })
    expect(logged.accessToken).toBeTruthy()
    expect(logged.profile.userId).toBeTruthy()

    expect((await getUserProfile()).role).toBe('family')
    expect((await bindPhone('phone-code')).phoneMasked).toContain('****')
    expect((await bindElder(ELDER, '1234')).relation).toBeTruthy()
    expect((await getBoundElders()).length).toBeGreaterThan(0)
    await expect(logoutApi()).resolves.toBeUndefined()
  })

  it('服务域', async () => {
    const list = await getServiceList({ pageNum: 1, pageSize: 10 })
    expect(list.list.length).toBeGreaterThan(0)

    const detail = await getServiceDetail(ITEM)
    expect(detail.id).toBe(ITEM)
    // 老人端要展示「包含项」，空数组会让页面出现大片空白
    expect(detail.includes.length).toBeGreaterThan(0)

    expect((await getCategories()).length).toBe(8)
    expect((await getNearbyOrganizations({ latitude: 31.2, longitude: 121.5 })).list.length).toBeGreaterThan(0)

    const slots = await getAvailableSlots({ itemId: ITEM, elderId: ELDER, date: '2026-10-09' })
    expect(slots.length).toBeGreaterThan(0)

    const elder = await getElderProfile(ELDER)
    expect(elder.name).toBeTruthy()
    // 紧急联系人必须脱敏，页面直接展示
    expect(elder.emergencyContacts.length).toBeGreaterThan(0)
  })

  it('订单域', async () => {
    const created = await createOrder({
      requestId: 'req-1',
      itemId: ITEM,
      elderId: ELDER,
      appointmentAt: '2026-10-10T09:00:00',
      addressId: 'addr_1',
      payChannel: 'wechat',
    })
    expect(created.orderId).toBeTruthy()

    const detail = await getOrderDetail(created.orderId)
    expect(detail.timeline.length).toBeGreaterThan(0)

    const pay = await getPayParams(created.orderId)
    expect(pay.package).toContain('prepay_id=')

    await expect(confirmOrder(created.orderId)).resolves.toBeUndefined()
    await expect(
      evaluateOrder(created.orderId, { score: 5, tags: ['专业'], content: '很好' }),
    ).resolves.toBeUndefined()
    expect((await subscribeServiceTrack(created.orderId)).trackToken).toBeTruthy()
  })

  it('健康域', async () => {
    const vitals = await getVitalList({ elderId: ELDER, pageNum: 1, pageSize: 10 })
    expect(vitals.list.length).toBeGreaterThan(0)

    const recorded = await recordVital({
      elderId: ELDER,
      type: 'heart_rate',
      values: { value: 72 },
      measuredAt: '2026-10-09T09:00:00',
      source: 'manual',
    })
    expect(recorded.recordId).toBeTruthy()

    const report = await getHealthReport({ elderId: ELDER, period: 'week' })
    expect(report.series.length).toBeGreaterThan(0)
    expect(report.suggestions.length).toBeGreaterThan(0)

    expect((await getMedicationList(ELDER)).length).toBeGreaterThan(0)

    const saved = await saveMedication({
      elderId: ELDER,
      medicineName: '维生素 D',
      dosage: '1 片',
      times: ['09:00'],
      startDate: '2026-10-09',
      endDate: '2026-11-09',
      enabled: true,
      notifyFamily: true,
    })
    expect(saved.reminderId).toBeTruthy()

    expect((await bindDevice({ elderId: ELDER, deviceType: 'band', deviceSn: 'SN-0001', deviceName: '手环' })).deviceId).toBeTruthy()

    const sos = await triggerSos({ elderId: ELDER, triggerType: 'button' })
    expect(sos.sosId).toBeTruthy()
    expect(sos.handledBy).toBeTruthy()
  })

  it('服务人员域', async () => {
    const pool = await getTaskList({ scope: 'pool', pageNum: 1, pageSize: 10 })
    expect(pool.list.length).toBeGreaterThan(0)

    const taskId = pool.list[0].taskId
    const detail = await getTaskDetail(taskId)
    expect(detail.serviceItems.length).toBeGreaterThan(0)

    await expect(acceptTask(taskId)).resolves.toBeUndefined()
    expect((await checkinTask({ taskId, latitude: 31.2, longitude: 121.5, photoFileId: 'f1', accuracy: 20 })).checkinId).toBeTruthy()

    const log = await submitServiceLog({ taskId, items: [{ itemId: 'si_1', done: true }], photoFileIds: ['f1'] })
    expect(log.logId).toBeTruthy()

    expect((await getSchedule({ month: '2026-10' })).length).toBeGreaterThan(0)
    await expect(applyLeave({ date: '2026-10-12', reason: '事假', type: 'leave' })).resolves.toBeUndefined()
  })
})
