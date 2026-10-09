/**
 * 订单 / 工单进度条。
 * 适老化要求：大节点 + 文字说明，状态不能只靠颜色区分（同时用「✓」「当前」「未开始」文字）。
 */
interface IStepInput {
  label: string
  desc?: string
}

interface IStepNode extends IStepInput {
  index: number
  /** done 已完成 | active 当前 | todo 未开始 | error 异常 */
  state: 'done' | 'active' | 'todo' | 'error'
  stateText: string
}

const STATE_TEXT: Record<IStepNode['state'], string> = {
  done: '已完成',
  active: '进行中',
  todo: '未开始',
  error: '有异常',
}

Component({
  options: {
    addGlobalClass: true,
  },

  properties: {
    steps: { type: Array, value: [] },
    /** 当前所处步骤下标（从 0 开始） */
    current: { type: Number, value: 0 },
    /** 异常步骤下标，-1 表示无异常 */
    errorIndex: { type: Number, value: -1 },
  },

  data: {
    nodes: [] as IStepNode[],
  },

  observers: {
    'steps, current, errorIndex'() {
      this.buildNodes()
    },
  },

  lifetimes: {
    attached() {
      this.buildNodes()
    },
  },

  methods: {
    buildNodes() {
      const steps = (this.properties.steps ?? []) as IStepInput[]
      const current = this.properties.current
      const errorIndex = this.properties.errorIndex
      const nodes: IStepNode[] = steps.map((step, index) => {
        let state: IStepNode['state'] = 'todo'
        if (errorIndex >= 0 && index === errorIndex) state = 'error'
        else if (index < current) state = 'done'
        else if (index === current) state = 'active'
        return {
          label: step.label,
          desc: step.desc,
          index,
          state,
          stateText: STATE_TEXT[state],
        }
      })
      this.setData({ nodes })
    },
  },
})

// 显式声明为 ES Module：否则文件内顶层 const 会泄漏到全局作用域，与其它组件的同名常量冲突
export {}
