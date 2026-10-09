/**
 * 列表分页 Behavior。
 *
 * 用法（页面里）：
 *   behaviors: [paginationBehavior],
 *   data: { list: [] as IServiceVM[] },
 *   async fetchPage(pageNum) {
 *     const res = await getServiceList({ pageNum, pageSize: PAGE_SIZE })
 *     return { list: res.list, hasMore: res.hasMore }
 *   },
 *   // 可选：把接口 DTO 映射为视图模型（金额转文本、状态转文案）
 *   mapPageItems(items) { return items.map(decorate) }
 *
 * 设计说明：列表字段名统一叫 `list`，由本 Behavior 负责「追加 or 替换」的逻辑，
 * 页面只关心「怎么取一页数据」和「怎么映射成视图模型」，避免每个列表页重复写分页游标。
 */
export interface IPageFetchResult<T = unknown> {
  list: T[]
  hasMore: boolean
}

/**
 * Behavior 提供的数据字段。
 * 为什么需要显式声明：`Behavior()` 的返回值是 `string`，TypeScript 无法从
 * `behaviors: [paginationBehavior]` 反推页面实例上多了哪些字段与方法。
 * 因此页面需写成 `Page<IPaginationData<T> & {...}, IPaginationCustom<T> & {...}>({...})`，
 * 既保留了 Behavior 的运行时复用，又拿到完整的类型提示。
 */
export interface IPaginationData<T = unknown> {
  list: T[]
  pageNum: number
  hasMore: boolean
  listLoading: boolean
  listError: boolean
}

/**
 * Behavior 提供的方法字段。
 * 注意 `loadPage / refreshPage / loadMorePage` 标记为**可选**：
 * 它们由 Behavior 在运行时注入，页面 options 里并不需要（也不应该）重复实现，
 * 而 `Page.Options` 要求 TCustom 的所有字段都出现在 options 对象里。
 * 因此页面调用时统一写成 `this.refreshPage?.()`——类型上承认「可能不存在」，
 * 运行时由 Behavior 保证存在。`fetchPage` 必须由页面实现，故为必选。
 */
export interface IPaginationCustom<T = unknown> {
  fetchPage(pageNum: number): Promise<IPageFetchResult<T>>
  mapPageItems?(items: unknown[]): unknown[]
  loadPage?(reset?: boolean): Promise<void>
  refreshPage?(): Promise<void>
  loadMorePage?(): Promise<void>
}

export const paginationBehavior = Behavior({
  data: {
    list: [] as unknown[],
    pageNum: 1,
    hasMore: true,
    listLoading: false,
    listError: false,
  },

  methods: {
    /**
     * 页面必须覆盖此方法，返回本页数据。
     * 默认实现直接抛错，避免忘记实现时静默无数据、难以排查。
     */
    fetchPage(_pageNum: number): Promise<IPageFetchResult> {
      return Promise.reject(new Error('paginationBehavior: 页面未实现 fetchPage'))
    },

    /** 页面可选覆盖：把接口 DTO 映射为视图模型 */
    mapPageItems(items: unknown[]): unknown[] {
      return items
    },

    /** 加载一页；reset = true 表示下拉刷新 / 首次加载 */
    async loadPage(reset = false): Promise<void> {
      if (this.data.listLoading) return
      const pageNum = reset ? 1 : this.data.pageNum
      if (!reset && !this.data.hasMore) return

      this.setData({ listLoading: true, listError: false })
      try {
        const result = await this.fetchPage(pageNum)
        const mapped = this.mapPageItems(result.list)
        const list = reset ? mapped : (this.data.list as unknown[]).concat(mapped)
        this.setData({
          list,
          pageNum: pageNum + 1,
          hasMore: result.hasMore,
          listLoading: false,
        })
      } catch (err) {
        console.error('[pagination] load failed', err)
        this.setData({ listLoading: false, listError: true })
      }
    },

    /** 下拉刷新入口 */
    async refreshPage(): Promise<void> {
      await this.loadPage(true)
    },

    /** 触底加载入口 */
    async loadMorePage(): Promise<void> {
      await this.loadPage(false)
    },
  },
})

export {}
