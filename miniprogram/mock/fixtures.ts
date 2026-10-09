/**
 * Mock 假数据。
 *
 * 为什么需要这一层：本仓库不含服务端，`utils/env.ts` 里各环境的域名都是占位域名
 * （api-dev.example.com 之类），因此任何走 `api/` 的页面在开发者工具里都必然
 * 「暂时加载失败」。`env.enableMock` 这个开关此前只声明未实现，等于一句空承诺。
 *
 * 设计原则：
 * 1. **数据要"像真的"**：覆盖多状态、多分页、边界值，否则页面上的空态/异常态分支
 *    永远跑不到，等于没验证；
 * 2. **不依赖网络**：`coverUrl` 指向本地 `assets/icons`，避免开发者工具里图片白块；
 * 3. **时间相对"现在"生成**：写死日期会让"待上门""已过期"这类判断随日期推移失真；
 * 4. **纯数据、无副作用**：不含随机数，便于单测断言。
 */
import { OrderStatus, ServiceCategory } from '../api/types'
import type { IElderProfile, IOrderBrief, IServiceItem, IStaffTask, IVitalSign } from '../api/types'
import type { HealthReport, MedicationReminder } from '../api/health'
import type { IShiftDay } from '../api/staff'
import type { IOrganization } from '../api/service'

// ---------------------------------------------------------------- 时间工具
// 约定：一律用本地时区生成，禁止 toISOString()（UTC+8 下会差一天）

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** ISO 8601（本地时区，无 Z 后缀），与 format.ts 的 toDate() 兼容 */
export function isoLocal(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 相对今天的偏移（天 / 小时），用于构造"即将上门""三天前"这类场景 */
function offset(days: number, hours = 0, minutes = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(d.getHours() + hours)
  d.setMinutes(d.getMinutes() + minutes)
  return d
}

/** 分类图标文件名与 ServiceCategory 取值一一对应，直接用本地图当封面 */
function coverOf(category: ServiceCategory): string {
  return `/assets/icons/cat-${category}.png`
}

// ---------------------------------------------------------------- 固定 ID

export const MOCK_ELDER_ID = 'elder_001'
export const MOCK_FAMILY_ELDER_ID = 'elder_002'
export const MOCK_ORG_ID = 'org_001'
export const MOCK_ORG_NAME = '安康居家养老服务中心'

export const MOCK_USER: IUserProfile = {
  userId: 'user_001',
  role: 'family',
  nickname: '李女士',
  avatarUrl: '',
  phoneMasked: '138****8000',
  orgId: MOCK_ORG_ID,
  orgName: MOCK_ORG_NAME,
  verifyStatus: 'passed',
}

export const MOCK_STAFF_USER: IUserProfile = {
  userId: 'staff_001',
  role: 'staff',
  nickname: '张护理员',
  avatarUrl: '',
  phoneMasked: '139****1234',
  orgId: MOCK_ORG_ID,
  orgName: MOCK_ORG_NAME,
  verifyStatus: 'passed',
}

// ---------------------------------------------------------------- 老人档案

export const MOCK_ELDERS: IElderProfile[] = [
  {
    elderId: MOCK_ELDER_ID,
    name: '王秀兰',
    gender: 'female',
    birthday: '1943-04-18',
    age: 83,
    district: '上海市浦东新区',
    addressMasked: '浦东新区花木路 **** 弄 3 号 502 室',
    careLevel: 'semi',
    tags: ['高血压', '独居', '轻度关节疼痛'],
    emergencyContacts: [
      { name: '李女士', relation: '女儿', phone: '138****8000' },
      { name: '王先生', relation: '儿子', phone: '137****6666' },
    ],
  },
  {
    elderId: MOCK_FAMILY_ELDER_ID,
    name: '陈建国',
    gender: 'male',
    birthday: '1938-11-02',
    age: 87,
    district: '上海市徐汇区',
    addressMasked: '徐汇区田林路 **** 弄 12 号 201 室',
    careLevel: 'disabled',
    tags: ['术后康复', '糖尿病', '行动不便'],
    emergencyContacts: [{ name: '李女士', relation: '儿媳', phone: '138****8000' }],
  },
  {
    elderId: 'elder_003',
    name: '赵桂芳',
    gender: 'female',
    birthday: '1950-07-25',
    age: 76,
    district: '上海市静安区',
    addressMasked: '静安区延长路 **** 弄 8 号 601 室',
    careLevel: 'self',
    tags: ['自理', '喜欢聊天'],
    emergencyContacts: [{ name: '赵先生', relation: '儿子', phone: '136****2233' }],
  },
]

// ---------------------------------------------------------------- 服务项目

interface ISeed {
  category: ServiceCategory
  name: string
  orgName: string
  durationMinutes: number
  priceCents: number
  priceUnit: IServiceItem['priceUnit']
  description: string
  includes: string[]
  rating: number
  soldCount: number
  doorToDoor: boolean
}

const SERVICE_SEEDS: ISeed[] = [
  {
    category: ServiceCategory.Meal,
    name: '营养午餐配送',
    orgName: MOCK_ORG_NAME,
    durationMinutes: 30,
    priceCents: 2800,
    priceUnit: 'time',
    description: '两荤一素一汤，低盐少油，适合高血压老人',
    includes: ['午餐配送上门', '协助摆餐', '餐后收拾'],
    rating: 4.9,
    soldCount: 1286,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Meal,
    name: '上门做餐（两菜一汤）',
    orgName: '暖心家政服务站',
    durationMinutes: 90,
    priceCents: 8800,
    priceUnit: 'time',
    description: '按老人口味现场烹饪，可代买食材',
    includes: ['代买食材', '现场烹饪', '厨房清洁'],
    rating: 4.7,
    soldCount: 342,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Bath,
    name: '上门助浴（含擦浴）',
    orgName: MOCK_ORG_NAME,
    durationMinutes: 60,
    priceCents: 15800,
    priceUnit: 'time',
    description: '两名护理员上门，全程防滑防跌，水温恒定',
    includes: ['专业助浴椅', '防滑措施', '浴后更衣', '皮肤检查'],
    rating: 4.8,
    soldCount: 517,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Bath,
    name: '床上擦浴护理',
    orgName: '康乐护理站',
    durationMinutes: 45,
    priceCents: 12800,
    priceUnit: 'time',
    description: '适用于长期卧床、无法下床的老人',
    includes: ['温水擦浴', '更换床单', '压疮预防检查'],
    rating: 4.6,
    soldCount: 208,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Clean,
    name: '居家日常保洁',
    orgName: '暖心家政服务站',
    durationMinutes: 120,
    priceCents: 9800,
    priceUnit: 'time',
    description: '客厅卧室厨房卫生间全面清洁',
    includes: ['地面清洁', '厨卫清洁', '垃圾清运'],
    rating: 4.7,
    soldCount: 863,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Clean,
    name: '衣物洗涤与晾晒',
    orgName: '暖心家政服务站',
    durationMinutes: 60,
    priceCents: 5800,
    priceUnit: 'time',
    description: '手洗贴身衣物，机洗大件，晾晒收纳',
    includes: ['分类洗涤', '晾晒', '折叠收纳'],
    rating: 4.5,
    soldCount: 431,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Medical,
    name: '陪同就医（半天）',
    orgName: MOCK_ORG_NAME,
    durationMinutes: 240,
    priceCents: 29800,
    priceUnit: 'time',
    description: '协助挂号、取药、与医生沟通并记录医嘱',
    includes: ['协助挂号', '陪同候诊', '记录医嘱', '取药送回家'],
    rating: 4.9,
    soldCount: 276,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Medical,
    name: '居家用药指导',
    orgName: '康乐护理站',
    durationMinutes: 45,
    priceCents: 6800,
    priceUnit: 'time',
    description: '执业护士上门整理药盒、讲解服药注意事项',
    includes: ['药盒整理', '用药讲解', '不良反应提示'],
    rating: 4.8,
    soldCount: 189,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Walk,
    name: '陪同户外散步',
    orgName: MOCK_ORG_NAME,
    durationMinutes: 60,
    priceCents: 6800,
    priceUnit: 'time',
    description: '小区或公园散步，全程搀扶看护',
    includes: ['全程陪护', '天气提醒', '饮水协助'],
    rating: 4.6,
    soldCount: 352,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Walk,
    name: '轮椅出行陪同',
    orgName: '康乐护理站',
    durationMinutes: 120,
    priceCents: 11800,
    priceUnit: 'time',
    description: '推轮椅陪同外出办事、晒太阳',
    includes: ['轮椅准备', '无障碍路线规划', '全程陪护'],
    rating: 4.7,
    soldCount: 143,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Rehab,
    name: '康复训练指导',
    orgName: '康乐护理站',
    durationMinutes: 60,
    priceCents: 19800,
    priceUnit: 'time',
    description: '康复师上门制定并指导居家训练动作',
    includes: ['能力评估', '动作示范', '训练计划', '家属教学'],
    rating: 4.9,
    soldCount: 167,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Rehab,
    name: '压疮护理',
    orgName: '康乐护理站',
    durationMinutes: 45,
    priceCents: 16800,
    priceUnit: 'time',
    description: '专业护士进行创面换药与体位管理指导',
    includes: ['创面评估', '换药护理', '体位指导'],
    rating: 4.8,
    soldCount: 96,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Escort,
    name: '全程陪诊（一天）',
    orgName: MOCK_ORG_NAME,
    durationMinutes: 480,
    priceCents: 49800,
    priceUnit: 'time',
    description: '从出门到回家全程陪同，含检查排队',
    includes: ['接送陪同', '全程排队', '医嘱记录', '报告代取'],
    rating: 4.9,
    soldCount: 118,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Escort,
    name: '取药代办',
    orgName: '暖心家政服务站',
    durationMinutes: 90,
    priceCents: 8800,
    priceUnit: 'time',
    description: '凭处方代取药品并送上门，附用药说明',
    includes: ['代取药品', '核对清单', '送药上门'],
    rating: 4.6,
    soldCount: 254,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Comfort,
    name: '聊天陪伴（半天）',
    orgName: MOCK_ORG_NAME,
    durationMinutes: 180,
    priceCents: 13800,
    priceUnit: 'time',
    description: '陪老人聊天、读报、下棋，缓解孤独感',
    includes: ['聊天陪伴', '读报', '简单手工'],
    rating: 4.8,
    soldCount: 392,
    doorToDoor: true,
  },
  {
    category: ServiceCategory.Comfort,
    name: '心理关怀疏导',
    orgName: '静心社会工作事务所',
    durationMinutes: 60,
    priceCents: 15800,
    priceUnit: 'time',
    description: '持证社工上门，针对丧偶、独居情绪疏导',
    includes: ['情绪评估', '疏导谈话', '家属沟通建议'],
    rating: 4.9,
    soldCount: 87,
    doorToDoor: true,
  },
]

export const MOCK_SERVICES: IServiceItem[] = SERVICE_SEEDS.map((seed, index) => ({
  id: `svc_${String(index + 1).padStart(3, '0')}`,
  orgId: index % 3 === 1 ? 'org_002' : index % 5 === 3 ? 'org_003' : MOCK_ORG_ID,
  orgName: seed.orgName,
  name: seed.name,
  category: seed.category,
  durationMinutes: seed.durationMinutes,
  priceCents: seed.priceCents,
  priceUnit: seed.priceUnit,
  coverUrl: coverOf(seed.category),
  description: seed.description,
  includes: seed.includes,
  rating: seed.rating,
  soldCount: seed.soldCount,
  doorToDoor: seed.doorToDoor,
}))

export const MOCK_ORGANIZATIONS: IOrganization[] = [
  {
    orgId: MOCK_ORG_ID,
    name: MOCK_ORG_NAME,
    logoUrl: '',
    rating: 4.8,
    qualifications: ['长护险定点', '医疗护理资质'],
    address: '浦东新区花木路 100 号',
    distanceMeters: 820,
    serviceCount: 26,
  },
  {
    orgId: 'org_002',
    name: '暖心家政服务站',
    logoUrl: '',
    rating: 4.6,
    qualifications: ['家政服务资质'],
    address: '浦东新区锦绣路 55 号',
    distanceMeters: 1740,
    serviceCount: 18,
  },
  {
    orgId: 'org_003',
    name: '康乐护理站',
    logoUrl: '',
    rating: 4.9,
    qualifications: ['医疗机构执业许可', '长护险定点'],
    address: '徐汇区田林路 220 号',
    distanceMeters: 3260,
    serviceCount: 31,
  },
]

// ---------------------------------------------------------------- 订单

interface IOrderSeed {
  serviceName: string
  status: OrderStatus
  days: number
  hours: number
  amountCents: number
  elderName: string
  orgName: string
  category: ServiceCategory
  staffName?: string
}

const ORDER_SEEDS: IOrderSeed[] = [
  {
    serviceName: '营养午餐配送',
    status: OrderStatus.PENDING_PAY,
    days: 0,
    hours: 3,
    amountCents: 2800,
    elderName: '王秀兰',
    orgName: MOCK_ORG_NAME,
    category: ServiceCategory.Meal,
  },
  {
    serviceName: '上门助浴（含擦浴）',
    status: OrderStatus.PENDING_DISPATCH,
    days: 1,
    hours: 10,
    amountCents: 15800,
    elderName: '王秀兰',
    orgName: MOCK_ORG_NAME,
    category: ServiceCategory.Bath,
  },
  {
    serviceName: '居家日常保洁',
    status: OrderStatus.DISPATCHED,
    days: 2,
    hours: 9,
    amountCents: 9800,
    elderName: '王秀兰',
    orgName: '暖心家政服务站',
    category: ServiceCategory.Clean,
    staffName: '张护理员',
  },
  {
    serviceName: '陪同就医（半天）',
    status: OrderStatus.ACCEPTED,
    days: 0,
    hours: 5,
    amountCents: 29800,
    elderName: '王秀兰',
    orgName: MOCK_ORG_NAME,
    category: ServiceCategory.Medical,
    staffName: '张护理员',
  },
  {
    serviceName: '康复训练指导',
    status: OrderStatus.IN_SERVICE,
    days: 0,
    hours: -1,
    amountCents: 19800,
    elderName: '陈建国',
    orgName: '康乐护理站',
    category: ServiceCategory.Rehab,
    staffName: '刘康复师',
  },
  {
    serviceName: '压疮护理',
    status: OrderStatus.PENDING_CONFIRM,
    days: 0,
    hours: -5,
    amountCents: 16800,
    elderName: '陈建国',
    orgName: '康乐护理站',
    category: ServiceCategory.Rehab,
    staffName: '刘康复师',
  },
  {
    serviceName: '聊天陪伴（半天）',
    status: OrderStatus.COMPLETED,
    days: -4,
    hours: -3,
    amountCents: 13800,
    elderName: '赵桂芳',
    orgName: MOCK_ORG_NAME,
    category: ServiceCategory.Comfort,
    staffName: '陈社工',
  },
  {
    serviceName: '居家用药指导',
    status: OrderStatus.COMPLETED,
    days: -11,
    hours: -2,
    amountCents: 6800,
    elderName: '王秀兰',
    orgName: '康乐护理站',
    category: ServiceCategory.Medical,
    staffName: '刘康复师',
  },
  {
    serviceName: '陪同户外散步',
    status: OrderStatus.CANCELED,
    days: -7,
    hours: 0,
    amountCents: 6800,
    elderName: '王秀兰',
    orgName: MOCK_ORG_NAME,
    category: ServiceCategory.Walk,
  },
  {
    serviceName: '床上擦浴护理',
    status: OrderStatus.REFUNDED,
    days: -18,
    hours: 0,
    amountCents: 12800,
    elderName: '陈建国',
    orgName: '康乐护理站',
    category: ServiceCategory.Bath,
  },
]

export const MOCK_ORDERS: IOrderBrief[] = ORDER_SEEDS.map((seed, index) => {
  const created = offset(seed.days - 2, seed.hours)
  return {
    orderId: `order_${String(index + 1).padStart(3, '0')}`,
    orderNo: `EC${dateOnly(created).replace(/-/g, '')}${String(1000 + index)}`,
    serviceName: seed.serviceName,
    status: seed.status,
    appointmentAt: isoLocal(offset(seed.days, seed.hours)),
    amountCents: seed.amountCents,
    elderName: seed.elderName,
    orgName: seed.orgName,
    coverUrl: coverOf(seed.category),
    staffName: seed.staffName,
    createdAt: isoLocal(created),
  }
})

/** 订单详情的时间轴：状态文案与 ORDER_STATUS_DICT 保持一致 */
export function buildOrderTimeline(order: IOrderBrief): Array<{
  status: OrderStatus
  label: string
  at: string
  done: boolean
}> {
  const base = new Date(order.createdAt.replace('T', ' ').replace(/-/g, '/')).getTime()
  const steps: Array<{ status: OrderStatus; label: string; offsetHours: number }> = [
    { status: OrderStatus.PENDING_PAY, label: '提交订单', offsetHours: 0 },
    { status: OrderStatus.PENDING_DISPATCH, label: '支付成功，等待派单', offsetHours: 1 },
    { status: OrderStatus.DISPATCHED, label: '已指定服务人员', offsetHours: 3 },
    { status: OrderStatus.ACCEPTED, label: '服务人员已接单', offsetHours: 5 },
    { status: OrderStatus.IN_SERVICE, label: '已上门打卡，服务中', offsetHours: 8 },
    { status: OrderStatus.PENDING_CONFIRM, label: '服务完成，待确认', offsetHours: 10 },
    { status: OrderStatus.COMPLETED, label: '已确认完成', offsetHours: 11 },
  ]
  const currentIndex = steps.findIndex((s) => s.status === order.status)
  const reached =
    currentIndex >= 0
      ? currentIndex
      : order.status === OrderStatus.CANCELED || order.status === OrderStatus.REFUNDED
        ? 1
        : steps.length - 1

  return steps.map((step, index) => ({
    status: step.status,
    label: step.label,
    at: isoLocal(new Date(base + step.offsetHours * 3600 * 1000)),
    done: index <= reached,
  }))
}

// ---------------------------------------------------------------- 服务人员任务

export const MOCK_STAFF_TASKS: IStaffTask[] = [
  {
    taskId: 'task_001',
    orderNo: 'EC202610080001',
    serviceName: '陪同就医（半天）',
    status: OrderStatus.ACCEPTED,
    appointmentAt: isoLocal(offset(0, 5)),
    distanceMeters: 820,
    elderName: '王秀兰',
    elderTags: ['高血压', '独居'],
    addressMasked: '浦东新区花木路 **** 弄 3 号 502 室',
    addressFull: '上海市浦东新区花木路 1288 弄 3 号 502 室',
    amountCents: 29800,
    serviceItems: [
      { itemId: 'si_1', name: '协助挂号' },
      { itemId: 'si_2', name: '陪同候诊' },
      { itemId: 'si_3', name: '记录医嘱' },
      { itemId: 'si_4', name: '取药送回家' },
    ],
  },
  {
    taskId: 'task_002',
    orderNo: 'EC202610090002',
    serviceName: '康复训练指导',
    status: OrderStatus.IN_SERVICE,
    appointmentAt: isoLocal(offset(0, -1)),
    distanceMeters: 3260,
    elderName: '陈建国',
    elderTags: ['术后康复', '糖尿病'],
    addressMasked: '徐汇区田林路 **** 弄 12 号 201 室',
    addressFull: '上海市徐汇区田林路 500 弄 12 号 201 室',
    amountCents: 19800,
    serviceItems: [
      { itemId: 'si_5', name: '能力评估' },
      { itemId: 'si_6', name: '动作示范' },
      { itemId: 'si_7', name: '训练计划' },
    ],
  },
  {
    taskId: 'task_003',
    orderNo: 'EC202610090003',
    serviceName: '居家日常保洁',
    status: OrderStatus.DISPATCHED,
    appointmentAt: isoLocal(offset(2, 9)),
    distanceMeters: 1740,
    elderName: '王秀兰',
    elderTags: ['高血压', '独居'],
    addressMasked: '浦东新区花木路 **** 弄 3 号 502 室',
    amountCents: 9800,
    serviceItems: [
      { itemId: 'si_8', name: '地面清洁' },
      { itemId: 'si_9', name: '厨卫清洁' },
      { itemId: 'si_10', name: '垃圾清运' },
    ],
  },
  {
    taskId: 'task_004',
    orderNo: 'EC202610090004',
    serviceName: '上门助浴（含擦浴）',
    status: OrderStatus.PENDING_DISPATCH,
    appointmentAt: isoLocal(offset(1, 10)),
    distanceMeters: 820,
    elderName: '王秀兰',
    elderTags: ['高血压', '独居'],
    addressMasked: '浦东新区花木路 **** 弄 3 号 502 室',
    amountCents: 15800,
    serviceItems: [
      { itemId: 'si_11', name: '专业助浴椅' },
      { itemId: 'si_12', name: '防滑措施' },
      { itemId: 'si_13', name: '浴后更衣' },
    ],
  },
  {
    taskId: 'task_005',
    orderNo: 'EC202610050005',
    serviceName: '聊天陪伴（半天）',
    status: OrderStatus.COMPLETED,
    appointmentAt: isoLocal(offset(-4, -3)),
    distanceMeters: 5120,
    elderName: '赵桂芳',
    elderTags: ['自理'],
    addressMasked: '静安区延长路 **** 弄 8 号 601 室',
    addressFull: '上海市静安区延长路 300 弄 8 号 601 室',
    amountCents: 13800,
    serviceItems: [
      { itemId: 'si_14', name: '聊天陪伴' },
      { itemId: 'si_15', name: '读报' },
    ],
  },
  {
    taskId: 'task_006',
    orderNo: 'EC202610020006',
    serviceName: '压疮护理',
    status: OrderStatus.COMPLETED,
    appointmentAt: isoLocal(offset(-6, -2)),
    distanceMeters: 3260,
    elderName: '陈建国',
    elderTags: ['术后康复', '行动不便'],
    addressMasked: '徐汇区田林路 **** 弄 12 号 201 室',
    amountCents: 16800,
    serviceItems: [
      { itemId: 'si_16', name: '创面评估' },
      { itemId: 'si_17', name: '换药护理' },
      { itemId: 'si_18', name: '体位指导' },
    ],
  },
]

export const MOCK_SCHEDULE: IShiftDay[] = Array.from({ length: 7 }, (_, i) => {
  const day = offset(i, 0)
  const date = dateOnly(day)
  const hasMorning = i !== 3
  const hasAfternoon = i % 2 === 0
  const shifts: IShiftDay['shifts'] = []
  if (hasMorning) {
    shifts.push({
      shiftId: `${date}-am`,
      startAt: `${date}T08:00:00`,
      endAt: `${date}T12:00:00`,
      taskCount: 2 + (i % 3),
    })
  }
  if (hasAfternoon) {
    shifts.push({
      shiftId: `${date}-pm`,
      startAt: `${date}T13:30:00`,
      endAt: `${date}T17:30:00`,
      taskCount: 1 + (i % 2),
    })
  }
  return { date, shifts }
})

// ---------------------------------------------------------------- 健康数据

export const MOCK_VITALS: IVitalSign[] = [
  ...[
    { systolic: 148, diastolic: 92, abnormal: true },
    { systolic: 136, diastolic: 84, abnormal: false },
    { systolic: 142, diastolic: 88, abnormal: true },
    { systolic: 128, diastolic: 79, abnormal: false },
    { systolic: 133, diastolic: 81, abnormal: false },
  ].map((v, i) => ({
    recordId: `vital_bp_${i + 1}`,
    elderId: MOCK_ELDER_ID,
    type: 'blood_pressure' as const,
    values: { systolic: v.systolic, diastolic: v.diastolic },
    measuredAt: isoLocal(offset(-i, 8 - i)),
    source: i % 2 === 0 ? ('device' as const) : ('manual' as const),
    deviceName: i % 2 === 0 ? '欧姆龙 HEM-7361' : undefined,
    abnormal: v.abnormal,
  })),
  ...[{ value: 6.8, abnormal: false }, { value: 7.4, abnormal: true }, { value: 6.1, abnormal: false }].map(
    (v, i) => ({
      recordId: `vital_glu_${i + 1}`,
      elderId: MOCK_ELDER_ID,
      type: 'blood_glucose' as const,
      values: { value: v.value, period: 1 },
      measuredAt: isoLocal(offset(-i * 2 - 1, 7)),
      source: 'manual' as const,
      abnormal: v.abnormal,
    }),
  ),
  ...[72, 68, 75, 70].map((v, i) => ({
    recordId: `vital_hr_${i + 1}`,
    elderId: MOCK_ELDER_ID,
    type: 'heart_rate' as const,
    values: { value: v },
    measuredAt: isoLocal(offset(-i, 9)),
    source: 'device' as const,
    deviceName: '小米手环 8',
    abnormal: false,
  })),
]

export const MOCK_MEDICATIONS: MedicationReminder[] = [
  {
    reminderId: 'med_001',
    elderId: MOCK_ELDER_ID,
    medicineName: '苯磺酸氨氯地平片',
    dosage: '5mg，每次 1 片',
    times: ['08:00'],
    startDate: dateOnly(offset(-30)),
    endDate: dateOnly(offset(60)),
    enabled: true,
    notifyFamily: true,
  },
  {
    reminderId: 'med_002',
    elderId: MOCK_ELDER_ID,
    medicineName: '阿卡波糖片',
    dosage: '50mg，每次 1 片，随餐',
    times: ['08:00', '12:00', '18:00'],
    startDate: dateOnly(offset(-15)),
    endDate: dateOnly(offset(75)),
    enabled: true,
    notifyFamily: true,
  },
  {
    reminderId: 'med_003',
    elderId: MOCK_ELDER_ID,
    medicineName: '碳酸钙 D3 片',
    dosage: '每次 1 片，睡前',
    times: ['21:00'],
    startDate: dateOnly(offset(-60)),
    endDate: dateOnly(offset(120)),
    enabled: false,
    notifyFamily: false,
  },
]

export const MOCK_HEALTH_REPORT: HealthReport = {
  periodLabel: '最近 7 天',
  summary: '血压整体平稳，有 2 次偏高记录；血糖 1 次偏高，建议复测。',
  series: [
    {
      type: 'blood_pressure',
      points: [138, 142, 136, 148, 133, 130, 136].map((v, i) => ({
        at: dateOnly(offset(i - 6)),
        value: v,
      })),
    },
    {
      type: 'blood_glucose',
      points: [6.1, 6.4, 6.8, 7.4, 6.6, 6.2, 6.0].map((v, i) => ({
        at: dateOnly(offset(i - 6)),
        value: v,
      })),
    },
    {
      type: 'heart_rate',
      points: [70, 72, 68, 75, 71, 69, 70].map((v, i) => ({
        at: dateOnly(offset(i - 6)),
        value: v,
      })),
    },
  ],
  abnormalCount: 3,
  suggestions: [
    '血压偏高时请静坐 5 分钟后复测，连续 3 天偏高请联系家庭医生。',
    '餐后 2 小时血糖建议控制在 7.8 mmol/L 以内。',
    '用药请遵医嘱，不要自行增减剂量。',
  ],
}
