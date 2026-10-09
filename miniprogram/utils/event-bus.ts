/**
 * 极简事件总线。
 * 适用场景：登录失效通知、订单状态刷新、SOS 广播等跨页面通信。
 * 注意：页面 onUnload 必须 off，否则会内存泄漏（见 pages 内的用法示例）。
 */
type Handler<T = unknown> = (payload: T) => void

const handlers = new Map<string, Set<Handler>>()

export const bus = {
  on<T = unknown>(event: string, handler: Handler<T>): void {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(handler as Handler)
  },
  off<T = unknown>(event: string, handler?: Handler<T>): void {
    if (!handler) {
      handlers.delete(event)
      return
    }
    handlers.get(event)?.delete(handler as Handler)
  },
  emit<T = unknown>(event: string, payload?: T): void {
    handlers.get(event)?.forEach((handler) => {
      try {
        ;(handler as Handler<T>)(payload as T)
      } catch (err) {
        console.error('[bus] handler error', event, err)
      }
    })
  },
}

export const BusEvent = {
  loginExpired: 'login:expired',
  loginSuccess: 'login:success',
  orderChanged: 'order:changed',
  sosTriggered: 'sos:triggered',
  elderModeChanged: 'elder-mode:changed',
} as const
