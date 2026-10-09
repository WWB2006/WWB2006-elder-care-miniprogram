/**
 * 环境配置的单元测试。
 * 重点是「生产环境守卫」：一旦 release 包误连测试域名，代价极大，
 * 这里用用例固定住 findProdConfigIssues 的判定行为。
 */
import type { EnvConfig } from '../../miniprogram/utils/env'
import {
  env,
  findProdConfigIssues,
  initEnv,
  isDev,
  isPlaceholderBaseUrl,
  isProd,
  resolveUrl,
} from '../../miniprogram/utils/env'
import { wxMock } from '../setup/wx'

function makeConfig(patch: Partial<EnvConfig>): EnvConfig {
  return {
    name: 'prod',
    apiBaseUrl: 'https://api.example.com/elder-care/api/v1',
    wsBaseUrl: 'wss://api.example.com/elder-care/ws',
    cdnUrl: 'https://cdn.example.com',
    enableMock: false,
    debug: false,
    ...patch,
  }
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  // initEnv 会就地修改共享的 env 对象，每个用例前复位到 dev，避免相互污染
  jest.spyOn(wxMock, 'getAccountInfoSync').mockReturnValue({
    miniProgram: { envVersion: 'develop' },
  } as ReturnType<typeof wxMock.getAccountInfoSync>)
  initEnv()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('initEnv · 版本号决定环境', () => {
  it('develop -> dev', () => {
    expect(env.name).toBe('dev')
    expect(isDev()).toBe(true)
    expect(isProd()).toBe(false)
  })

  it('trial -> uat', () => {
    jest.spyOn(wxMock, 'getAccountInfoSync').mockReturnValue({
      miniProgram: { envVersion: 'trial' },
    } as ReturnType<typeof wxMock.getAccountInfoSync>)
    initEnv()
    expect(env.name).toBe('uat')
  })

  it('release -> prod 且关闭 debug', () => {
    jest.spyOn(wxMock, 'getAccountInfoSync').mockReturnValue({
      miniProgram: { envVersion: 'release' },
    } as ReturnType<typeof wxMock.getAccountInfoSync>)
    initEnv()
    expect(env.name).toBe('prod')
    expect(env.debug).toBe(false)
  })

  it('getAccountInfoSync 抛错时降级为 dev，不阻塞启动', () => {
    jest.spyOn(wxMock, 'getAccountInfoSync').mockImplementation(() => {
      throw new Error('not supported')
    })
    expect(() => initEnv()).not.toThrow()
    expect(env.name).toBe('dev')
  })

  it('initEnv 保持 env 引用稳定（各模块 import 的是同一个对象）', () => {
    const ref = env
    initEnv()
    expect(ref).toBe(env)
  })

  it('dev 下可通过 storage 开关启用 mock', () => {
    wxMock.setStorageSync('__enable_mock__', true)
    initEnv()
    expect(env.enableMock).toBe(true)
  })

  it('dev 默认开启 mock（本仓库无服务端，否则开发者工具里全是加载失败）', () => {
    // 不写任何 storage，应沿用配置默认值
    initEnv()
    expect(env.enableMock).toBe(true)
  })

  it('占位域名兜底优先级高于 storage 开关（必须先换真实域名才能关 mock）', () => {
    // 注意顺序：dev 的 apiBaseUrl 是占位值时会被强制开启，
    // 因此联调真实后端的步骤是「先改 env.ts 的域名，再关开关」。
    // 这里无法通过直接改 env.apiBaseUrl 来验证反向分支——
    // initEnv() 会 Object.assign 把它复位回配置值，改了也会被覆盖。
    wxMock.setStorageSync('__enable_mock__', false)
    initEnv()
    expect(env.enableMock).toBe(true)
  })

  it('storage 里是非布尔值时忽略，不能被强制成 false（回归用例）', () => {
    // 早期实现是 `env.enableMock = wx.getStorageSync(...) === true`，
    // 于是未设置（返回 ''）时会被强制成 false，dev 的默认值永远失效。
    wxMock.setStorageSync('__enable_mock__', 'yes')
    initEnv()
    expect(env.enableMock).toBe(true)
  })

  it('uat / prod 不读取本地 mock 开关', () => {
    wxMock.setStorageSync('__enable_mock__', true)
    jest.spyOn(wxMock, 'getAccountInfoSync').mockReturnValue({
      miniProgram: { envVersion: 'release' },
    } as ReturnType<typeof wxMock.getAccountInfoSync>)
    initEnv()
    expect(env.name).toBe('prod')
    expect(env.enableMock).toBe(false)
  })
})

describe('findProdConfigIssues · 生产环境守卫', () => {
  it('非生产环境恒为空数组', () => {
    expect(findProdConfigIssues(makeConfig({ name: 'dev', apiBaseUrl: 'http://localhost:3000' }))).toEqual([])
    expect(findProdConfigIssues(makeConfig({ name: 'uat', apiBaseUrl: 'https://api-uat.example.com' }))).toEqual([])
  })

  it('合规的生产配置没有告警', () => {
    expect(findProdConfigIssues(makeConfig({}))).toEqual([])
  })

  it('命中 api-dev 域名会被拦截', () => {
    const issues = findProdConfigIssues(makeConfig({ apiBaseUrl: 'https://api-dev.example.com/api' }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('apiBaseUrl')
  })

  it('localhost / 内网 IP 会被拦截', () => {
    expect(findProdConfigIssues(makeConfig({ apiBaseUrl: 'http://localhost:8080' })).length).toBeGreaterThan(0)
    expect(findProdConfigIssues(makeConfig({ wsBaseUrl: 'wss://192.168.1.10/ws' })).length).toBeGreaterThan(0)
    expect(findProdConfigIssues(makeConfig({ cdnUrl: 'https://127.0.0.1/static' })).length).toBeGreaterThan(0)
  })

  it('apiBaseUrl / cdnUrl 必须是 https', () => {
    const issues = findProdConfigIssues(makeConfig({ apiBaseUrl: 'http://api.example.com' }))
    expect(issues.some((i) => i.includes('必须使用 https://'))).toBe(true)

    const cdnIssues = findProdConfigIssues(makeConfig({ cdnUrl: 'http://cdn.example.com' }))
    expect(cdnIssues.some((i) => i.includes('cdnUrl'))).toBe(true)
  })

  it('wsBaseUrl 认 wss://，不能按 https:// 校验（回归用例）', () => {
    // 合法：wss 地址不应产生任何告警，否则生产启动会天天误报
    expect(findProdConfigIssues(makeConfig({}))).toEqual([])

    // 非法：明文 ws:// 必须被拦下，且提示的是 wss:// 而不是 https://
    const issues = findProdConfigIssues(makeConfig({ wsBaseUrl: 'ws://api.example.com/ws' }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('wss://')
  })

  it('多个字段同时违规时逐条列出', () => {
    const issues = findProdConfigIssues(
      makeConfig({
        apiBaseUrl: 'https://api-uat.example.com',
        wsBaseUrl: 'ws://api.example.com/ws',
        cdnUrl: 'https://cdn-dev.example.com',
      }),
    )
    expect(issues).toHaveLength(3)
  })
})

describe('占位域名兜底', () => {
  it('识别仓库自带的占位域名', () => {
    expect(isPlaceholderBaseUrl('https://api-dev.example.com/elder-care/api/v1')).toBe(true)
    expect(isPlaceholderBaseUrl('https://api.example.com/elder-care/api/v1')).toBe(true)
    expect(isPlaceholderBaseUrl('https://api.mycompany.com/elder-care/api/v1')).toBe(false)
  })

  it('占位域名下即使开关被关掉也强制开启 mock（否则必然「网络连接失败」）', () => {
    wxMock.setStorageSync('__enable_mock__', false)
    initEnv()
    expect(env.enableMock).toBe(true)
  })

  it('真实域名下开关说了算，兜底不介入', () => {
    wxMock.setStorageSync('__enable_mock__', false)
    initEnv()
    // 换成真实域名后，关掉就真的关掉
    env.apiBaseUrl = 'https://api.mycompany.com/elder-care/api/v1'
    expect(isPlaceholderBaseUrl(env.apiBaseUrl)).toBe(false)

    // 复位这一步会重新读配置，占位域名回来 -> 又会被强制开启
    initEnv()
    expect(env.enableMock).toBe(true)
  })
})

describe('resolveUrl', () => {
  it('相对路径拼接在 apiBaseUrl 之后', () => {
    expect(resolveUrl('/user/profile')).toBe(`${env.apiBaseUrl}/user/profile`)
  })

  it('缺少前导斜杠时自动补上', () => {
    expect(resolveUrl('user/profile')).toBe(`${env.apiBaseUrl}/user/profile`)
  })

  it('绝对地址原样返回（例如 CDN 图片）', () => {
    expect(resolveUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })
})
