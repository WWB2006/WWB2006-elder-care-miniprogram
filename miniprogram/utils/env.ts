/**
 * 环境配置。
 * 环境判定不依赖"改代码"，而是读取小程序版本号：
 *   develop -> dev（开发版，连测试后端，可开 mock）
 *   trial   -> uat（体验版，连预发后端）
 *   release -> prod（正式版）
 * 注意：域名必须在小程序后台「开发管理-服务器域名」白名单中，否则真机请求会被拦截。
 */
export type EnvName = 'dev' | 'uat' | 'prod'

export interface EnvConfig {
  name: EnvName
  /** HTTP 接口基址（必须 https 且已配置白名单） */
  apiBaseUrl: string
  /** WebSocket 基址，用于工单实时提醒、SOS 广播 */
  wsBaseUrl: string
  /** 静态资源 / 上传文件 CDN */
  cdnUrl: string
  /** 是否开启本地 mock（仅 dev） */
  enableMock: boolean
  /** 是否打印调试日志 */
  debug: boolean
}

const CONFIG_MAP: Record<EnvName, EnvConfig> = {
  dev: {
    name: 'dev',
    apiBaseUrl: 'https://api-dev.example.com/elder-care/api/v1',
    wsBaseUrl: 'wss://api-dev.example.com/elder-care/ws',
    cdnUrl: 'https://cdn-dev.example.com',
    // 本仓库不含服务端，dev 域名是占位域名。默认开启 mock，否则每个列表页都是
    // 「暂时加载失败」——开发者工具一打开就是一片红，等于项目不可用。
    // 需要联调真实后端时，在 Console 执行 wx.setStorageSync('__enable_mock__', false)。
    enableMock: true,
    debug: true,
  },
  uat: {
    name: 'uat',
    apiBaseUrl: 'https://api-uat.example.com/elder-care/api/v1',
    wsBaseUrl: 'wss://api-uat.example.com/elder-care/ws',
    cdnUrl: 'https://cdn-uat.example.com',
    enableMock: false,
    debug: true,
  },
  prod: {
    name: 'prod',
    apiBaseUrl: 'https://api.example.com/elder-care/api/v1',
    wsBaseUrl: 'wss://api.example.com/elder-care/ws',
    cdnUrl: 'https://cdn.example.com',
    enableMock: false,
    debug: false,
  },
}

/** 当前生效配置（可被 initEnv 就地覆盖，保持引用稳定，便于各模块直接 import） */
export const env: EnvConfig = { ...CONFIG_MAP.dev }

export function isDev(): boolean {
  return env.name === 'dev'
}

export function isProd(): boolean {
  return env.name === 'prod'
}

/**
 * 生产环境不允许出现测试域名（见 docs/设计方案.md 第 6.8 节「环境隔离」）。
 * 这里做运行时兜底告警：真正的拦截应在 CI（对 release 构建做静态扫描），
 * 但线上误连测试域名的代价太大，多一道防线不亏。
 */
const FORBIDDEN_PROD_PATTERNS: RegExp[] = [
  /localhost/i,
  /127\.0\.0\.1/,
  /192\.168\./,
  /https?:\/\/10\./,
  /api-dev/i,
  /api-uat/i,
  /-dev\./i,
  /-uat\./i,
]

/**
 * 各字段在生产环境必须使用的协议。
 * 踩过的坑：早期实现对所有字段统一用 `^https://` 校验，而 wsBaseUrl 的合法值是
 * `wss://`——于是每次生产启动都会误报一条「必须使用 https」，
 * 告警天天刷屏，真正的风险反而被淹没。协议要求必须按字段区分。
 */
const REQUIRED_SCHEMES: Record<string, { pattern: RegExp; label: string }> = {
  apiBaseUrl: { pattern: /^https:\/\//, label: 'https://' },
  wsBaseUrl: { pattern: /^wss:\/\//, label: 'wss://' },
  cdnUrl: { pattern: /^https:\/\//, label: 'https://' },
}

/** 返回生产配置中不合规的项，供告警与单测使用；非生产环境恒为空数组 */
export function findProdConfigIssues(config: EnvConfig = env): string[] {
  if (config.name !== 'prod') return []
  const issues: string[] = []
  const targets: Array<[string, string]> = [
    ['apiBaseUrl', config.apiBaseUrl],
    ['wsBaseUrl', config.wsBaseUrl],
    ['cdnUrl', config.cdnUrl],
  ]
  targets.forEach(([field, url]) => {
    if (FORBIDDEN_PROD_PATTERNS.some((p) => p.test(url))) {
      issues.push(`${field} 命中测试域名规则：${url}`)
    }
    const rule = REQUIRED_SCHEMES[field]
    if (rule && !rule.pattern.test(url)) {
      issues.push(`${field} 必须使用 ${rule.label}：${url}`)
    }
  })
  return issues
}

/** 在 app.ts 最早期调用一次 */
export function initEnv(): EnvConfig {
  let envVersion = 'develop'
  try {
    envVersion = wx.getAccountInfoSync().miniProgram.envVersion
  } catch (err) {
    // 开发者工具个别版本或未登录时可能抛错，按开发环境处理
    console.warn('[env] getAccountInfoSync failed', err)
  }
  const name: EnvName = envVersion === 'release' ? 'prod' : envVersion === 'trial' ? 'uat' : 'dev'
  Object.assign(env, CONFIG_MAP[name])
  // 本地调试开关：在开发者工具 Console 执行 wx.setStorageSync('__enable_mock__', true|false)
  // 注意只在「显式写入过布尔值」时才覆盖配置默认值。
  // 早期实现写成 `env.enableMock = wx.getStorageSync(...) === true`，
  // 未设置时会被强制成 false，等于 dev 的默认值永远失效。
  if (env.name === 'dev') {
    try {
      const stored = wx.getStorageSync('__enable_mock__')
      if (typeof stored === 'boolean') env.enableMock = stored
    } catch {
      /* 读不到 storage 就沿用配置默认值 */
    }
  }
  // 硬兜底：占位域名下必须走 mock。
  // 本仓库不含服务端，apiBaseUrl 默认是 *.example.com 占位值。若开关被关掉（例如
  // 之前手动 setStorageSync('__enable_mock__', false)），请求会打到不存在的域名上，
  // 页面一律「网络连接失败」——但真实原因其实是「没有后端」，排查方向完全跑偏。
  if (env.name === 'dev' && !env.enableMock && isPlaceholderBaseUrl(env.apiBaseUrl)) {
    env.enableMock = true
    console.warn(
      '[env] apiBaseUrl 仍是占位域名，已强制开启本地 mock。\n' +
        '      如需联调真实后端，请先把 utils/env.ts 的 apiBaseUrl 改成真实地址，\n' +
        '      再在 Console 执行 wx.setStorageSync("__enable_mock__", false) 并重新编译。',
    )
  }

  // 启动横幅：开发者工具 Console 里一眼确认当前走的是 mock 还是真实请求。
  // 不加这条时，页面报错与运行时开关状态对不上，非常难排查。
  printEnvBanner(env)

  const issues = findProdConfigIssues(env)
  if (issues.length) {
    console.error('[env] 生产环境配置存在风险，请检查 utils/env.ts：', issues)
  }
  return env
}

/**
 * 打印环境横幅。
 * 刻意用 console.info 而不是 logger：logger 的输出受 debug 开关与缓冲队列控制，
 * 而这个横幅的职责就是「无论如何都要让人看到当前走的是哪条路」。
 */
function printEnvBanner(config: EnvConfig): void {
  if (config.enableMock) {
    // 启动横幅是刻意保留的诊断输出，用于确认运行时是否走 mock
    // eslint-disable-next-line no-console
    console.info(
      '[env] 本地 mock 已开启（env=%s）：所有接口走 miniprogram/mock，不会发起真实请求',
      config.name,
    )
  } else {
    // 同上：关闭时也要明确打印真实目标地址，避免"以为在调真实后端其实是 mock"
    // eslint-disable-next-line no-console
    console.info('[env] 本地 mock 已关闭（env=%s）：请求将发往 %s', config.name, config.apiBaseUrl)
  }
}

/** 判断接口基址是否还是仓库自带的占位值 */
export function isPlaceholderBaseUrl(url: string): boolean {
  return /(^|\.)example\.com($|\/)/.test(url)
}

/** 拼接完整接口地址，便于日志与调试 */
export function resolveUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${env.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}
