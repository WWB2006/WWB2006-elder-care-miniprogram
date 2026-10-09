/**
 * WXS 与 TS 常量的一致性校验。
 *
 * 为什么需要：WXML 读不到 TS 常量，所以 `wxs/status.wxs` 里保留了一份状态文案副本。
 * 副本一旦漂移，页面会显示与接口语义不符的状态（例如后端新增 REFUNDING 而前端显示「未知状态」）。
 * 这里用单测把两处钉在一起——WXS 是纯 CommonJS 写法，可以直接在 Node 里求值。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ORDER_STATUS_DICT } from '../../miniprogram/config/constant'

interface StatusWxs {
  label: (status: string) => string
  tone: (status: string) => string
  desc: (status: string) => string
  LABELS: Record<string, string>
  TONES: Record<string, string>
}

/** WXS 不支持 import/export，用的是 module.exports，因此可以用 Function 构造器求值 */
function loadStatusWxs(): StatusWxs {
  const file = resolve(__dirname, '../../miniprogram/wxs/status.wxs')
  const code = readFileSync(file, 'utf8')
  const mod = { exports: {} as unknown }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function('module', 'exports', code)
  factory(mod, mod.exports)
  return mod.exports as StatusWxs
}

const wxs = loadStatusWxs()
const STATUSES = Object.keys(ORDER_STATUS_DICT) as Array<keyof typeof ORDER_STATUS_DICT>

/** WXS 输出的是语义色名，TS 里存的是设计令牌名，这里做一层映射再比对 */
const TONE_TO_TOKEN: Record<string, string> = {
  primary: '--color-primary',
  success: '--color-success',
  warning: '--color-warning',
  muted: '--color-text-tertiary',
}

describe('status.wxs 与 ORDER_STATUS_DICT 一致性', () => {
  it('状态集合完全一致（不多不少）', () => {
    expect(Object.keys(wxs.LABELS).sort()).toEqual([...STATUSES].sort())
    expect(Object.keys(wxs.TONES).sort()).toEqual([...STATUSES].sort())
  })

  it('每个状态的 label 文案一致', () => {
    STATUSES.forEach((status) => {
      expect(wxs.LABELS[status]).toBe(ORDER_STATUS_DICT[status].label)
    })
  })

  it('每个状态的 desc 文案一致', () => {
    STATUSES.forEach((status) => {
      expect(wxs.desc(status)).toBe(ORDER_STATUS_DICT[status].desc)
    })
  })

  it('语义色名与设计令牌一一对应', () => {
    STATUSES.forEach((status) => {
      const tone = wxs.TONES[status]
      expect(TONE_TO_TOKEN[tone]).toBe(ORDER_STATUS_DICT[status].color)
    })
  })
})

describe('status.wxs 取值函数', () => {
  it('label / tone / desc 对已知状态返回映射值', () => {
    expect(wxs.label('COMPLETED')).toBe('已完成')
    expect(wxs.tone('COMPLETED')).toBe('success')
    expect(wxs.desc('COMPLETED')).toBe(ORDER_STATUS_DICT.COMPLETED.desc)
  })

  it('未知状态有兜底，不会渲染 undefined', () => {
    expect(wxs.label('NOT_EXIST')).toBe('未知状态')
    expect(wxs.tone('NOT_EXIST')).toBe('muted')
    expect(wxs.desc('NOT_EXIST')).toBe('')
  })

  it('空值兜底', () => {
    expect(wxs.label('')).toBe('未知状态')
    expect(wxs.tone('')).toBe('muted')
  })
})
