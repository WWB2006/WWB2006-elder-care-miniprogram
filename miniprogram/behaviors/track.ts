/**
 * 页面曝光埋点 Behavior。
 *
 * 作用：把「进入页面 / 停留时长 / 离开页面」这类通用埋点收敛到一处，
 * 页面只需声明 `trackPage`（可选 `trackParams`），不必每页重复写 onShow/onHide 逻辑。
 *
 * 注意：埋点不能影响主流程，任何异常都在 logger 内部被吞掉。
 */
import { logger } from '../utils/logger'

const enterMap = new WeakMap<object, number>()

export const trackBehavior = Behavior({
  data: {
    /** 页面名，用于埋点；不传时回退到当前路由 */
    trackPage: '',
  },

  methods: {
    /** 页面可选覆盖：返回附加埋点参数（如筛选条件） */
    trackParams(): Record<string, unknown> {
      return {}
    },

    onShow() {
      const page = this.resolveTrackPage()
      enterMap.set(this, Date.now())
      logger.event('page_view', { page, ...this.trackParams() })
    },

    onHide() {
      const enterAt = enterMap.get(this)
      if (!enterAt) return
      const stayMs = Date.now() - enterAt
      enterMap.delete(this)
      logger.event('page_leave', { page: this.resolveTrackPage(), stayMs })
    },

    onUnload() {
      this.onHide()
    },

    resolveTrackPage(): string {
      if (this.data.trackPage) return this.data.trackPage
      try {
        const pages = getCurrentPages()
        return pages[pages.length - 1]?.route ?? 'unknown'
      } catch {
        return 'unknown'
      }
    },
  },
})

export {}
