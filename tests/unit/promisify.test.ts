/**
 * promisify 工具的单测。
 * 它的价值在于「成功/失败分别 resolve/reject」，且不丢失调用方传入的 options。
 */
import { promisify } from '../../miniprogram/utils/promisify'

/**
 * 注意：这里必须用 type alias 而不是 interface。
 * `TOptions extends Record<string, unknown>` 约束下，interface 缺少隐式索引签名会报
 * TS2344；type alias（对象字面量类型）才带隐式索引签名。
 */
type Options = { title: string }

describe('promisify', () => {
  it('回调成功时 resolve 结果', async () => {
    const api = promisify<{ confirm: boolean }, Options>((options) => {
      options.success?.({ confirm: true })
    })
    await expect(api({ title: 'x' })).resolves.toEqual({ confirm: true })
  })

  it('回调失败时 reject 错误', async () => {
    const api = promisify<unknown, Options>((options) => {
      options.fail?.({ errMsg: 'fail' })
    })
    await expect(api({ title: 'x' })).rejects.toEqual({ errMsg: 'fail' })
  })

  it('调用方传入的 options 会透传给底层 API', async () => {
    const received: Options[] = []
    const api = promisify<unknown, Options>((options) => {
      received.push({ title: options.title })
      options.success?.(undefined)
    })

    await api({ title: '确认删除' })
    expect(received).toEqual([{ title: '确认删除' }])
  })

  it('不传参数时使用空对象，不会因 undefined 解构而报错', async () => {
    const api = promisify<unknown, Record<string, unknown>>((options) => {
      options.success?.(undefined)
    })
    await expect(api()).resolves.toBeUndefined()
  })

  it('成功/失败回调会覆盖调用方传入的同名回调', async () => {
    const callerSuccess = jest.fn()
    const api = promisify<string, Record<string, unknown>>((options) => {
      // 底层 API 调用的必然是 promisify 注入的那个 success
      options.success?.('injected')
    })

    await expect(api({ success: callerSuccess })).resolves.toBe('injected')
    expect(callerSuccess).not.toHaveBeenCalled()
  })
})
