/**
 * 测试框架装载后的钩子（setupFilesAfterEnv）。
 *
 * 与 setupFiles 的分工：
 * - setupFiles（wx.ts）：只负责注入全局对象，执行时 jest 全局尚不存在；
 * - 本文件：可以安全使用 beforeEach 等 jest 全局，负责用例间的状态隔离。
 */
import { env } from '../../miniprogram/utils/env'
import { setMockLatency } from '../../miniprogram/mock'
import { clearWxStorage } from './wx'

beforeEach(() => {
  clearWxStorage()
  /**
   * 单测默认走**真实请求路径**（wx.request 已被 mock 成可控函数），
   * 因为请求层的核心契约（401 单飞刷新、重试、loading 计数）必须在真实分支上验证。
   *
   * 注意：dev 配置里 enableMock 默认为 true（本仓库没有服务端，开发者工具里
   * 必须靠 mock 才能出数据）。若不在这里复位，所有请求都会走 mock 分支，
   * 既有的 request.test.ts 会集体失配。
   * 需要验证 mock 数据的用例请显式 `env.enableMock = true`。
   */
  env.enableMock = false
  // mock 的模拟延迟对测试无意义，关掉以缩短用例耗时
  setMockLatency(0)
})
