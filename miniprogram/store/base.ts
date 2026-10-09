/**
 * 轻量状态容器。
 * 选型说明：小程序端全局状态需求集中在「用户态 + 订单筛选 + 首页快照」，
 * 引入完整状态库收益有限；此处提供 80 行实现即可满足，且完全类型安全。
 * 若团队要求响应式视图（自动 setData），可在这一层替换为 mobx-miniprogram，改动面仅此文件。
 */
export type StoreListener<T> = (state: Readonly<T>, changed: Partial<T>) => void

export class Store<T extends object> {
  protected state: T
  private listeners = new Set<StoreListener<T>>()

  constructor(initialState: T) {
    this.state = { ...initialState }
  }

  getState(): Readonly<T> {
    return this.state
  }

  subscribe(listener: StoreListener<T>): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  protected setState(patch: Partial<T>): void {
    Object.assign(this.state, patch)
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, patch)
      } catch (err) {
        console.error('[store] listener error', err)
      }
    })
  }
}

/** 只要能 setData 的宿主（页面或自定义组件）即可绑定 */
export interface IDataHolder {
  setData(data: Record<string, unknown>): void
}

/**
 * 把 store 绑定到页面 data。
 * 用法：
 *   onLoad() { this.unbind = connectStore(this, appStore, (s) => ({ online: s.networkConnected })) }
 *   onUnload() { this.unbind?.() }
 */
export function connectStore<S extends object>(
  page: IDataHolder,
  store: Store<S>,
  selector: (state: Readonly<S>) => Record<string, unknown>,
): () => void {
  const apply = (state: Readonly<S>) => {
    try {
      page.setData(selector(state))
    } catch (err) {
      console.error('[store] setData failed', err)
    }
  }
  apply(store.getState())
  return store.subscribe(apply)
}
