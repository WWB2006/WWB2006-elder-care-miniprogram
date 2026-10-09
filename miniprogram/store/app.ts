/**
 * 全局应用态：网络、适老模式、冷启动耗时、底部安全区。
 */
import { Store } from './base'

export interface IAppState {
  /** 网络是否可用，弱网时页面展示缓存数据并禁用支付等强一致操作 */
  networkConnected: boolean
  networkType: string
  /** 适老模式：放大字号、简化文案、隐藏次要入口 */
  elderMode: boolean
  /** 冷启动首个页面渲染完成时间戳，用于启动耗时监控 */
  coldStartReadyAt: number
  /** 底部安全区高度（px） */
  safeAreaBottom: number
  /**
   * 待消费的服务分类筛选条件。
   * 为什么需要：`wx.switchTab` 不支持携带 query，首页点分类跳到「服务」tab 时
   * 参数会丢失（早期实现就是这样丢的）。这里用一次性状态传递，服务页消费后立即清空。
   */
  pendingServiceCategory: string
}

class AppStore extends Store<IAppState> {
  constructor() {
    super({
      networkConnected: true,
      networkType: 'unknown',
      elderMode: false,
      coldStartReadyAt: 0,
      safeAreaBottom: 0,
      pendingServiceCategory: '',
    })
  }

  setNetwork(payload: { isConnected: boolean; networkType: string }): void {
    this.setState({
      networkConnected: payload.isConnected,
      networkType: payload.networkType,
    })
  }

  markColdStartReady(): void {
    if (!this.getState().coldStartReadyAt) {
      this.setState({ coldStartReadyAt: Date.now() })
    }
  }

  setElderMode(enabled: boolean): void {
    this.setState({ elderMode: enabled })
  }

  setSafeAreaBottom(px: number): void {
    this.setState({ safeAreaBottom: px })
  }

  /** 首页点分类时写入，服务页 onShow 读取后调用 consumeServiceCategory 清空 */
  setServiceCategory(category: string): void {
    this.setState({ pendingServiceCategory: category })
  }

  consumeServiceCategory(): string {
    const category = this.getState().pendingServiceCategory
    if (category) this.setState({ pendingServiceCategory: '' })
    return category
  }
}

export const appStore = new AppStore()
