/**
 * 适老模式 Behavior。
 * 页面只需 `behaviors: [elderModeBehavior]`，即可获得：
 *   - data.elderMode：直接绑定到根节点 class（`class="page-root {{elderMode ? 'elder-mode' : ''}}"`）；
 *   - 全局开关变化时自动刷新，无需每个页面自己订阅 store。
 * 卸载时自动解绑，避免 store 监听泄漏。
 */
import { appStore } from '../store/app'

const unbindMap = new WeakMap<object, () => void>()

/** Behavior 注入到页面 data 的字段（见 pagination.ts 中关于 Behavior 类型的说明） */
export interface IElderModeData {
  elderMode: boolean
}

export const elderModeBehavior = Behavior({
  data: {
    elderMode: false,
  },

  lifetimes: {
    attached() {
      this.setData({ elderMode: appStore.getState().elderMode })
      const unbind = appStore.subscribe((state, changed) => {
        if ('elderMode' in changed) this.setData({ elderMode: state.elderMode })
      })
      unbindMap.set(this, unbind)
    },
    detached() {
      unbindMap.get(this)?.()
      unbindMap.delete(this)
    },
  },
})

export {}
