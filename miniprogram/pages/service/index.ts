/**
 * 服务大厅。
 * 功能：分类筛选、关键词搜索、列表分页、下拉刷新、触底加载。
 * 适老化：分类用「大图标 + 文字」，列表不做无限滚动，额外提供底部「加载更多」大按钮。
 */
import { getServiceList } from '../../api/service'
import type { IServiceItem, ServiceCategory } from '../../api/types'
import { PAGE_SIZE, SERVICE_CATEGORY_DICT } from '../../config/constant'
import { router } from '../../config/route'
import { formatMoney } from '../../utils/format'
import { logger } from '../../utils/logger'
import { syncTabBar } from '../../utils/tabbar'
import { appStore } from '../../store/app'
import { elderModeBehavior, type IElderModeData } from '../../behaviors/elder-mode'
import type { IPageBehaviorSupport } from '../../behaviors/types'
import {
  paginationBehavior,
  type IPageFetchResult,
  type IPaginationCustom,
  type IPaginationData,
} from '../../behaviors/pagination'

interface IServiceVM extends IServiceItem {
  priceText: string
  soldText: string
}

interface ICategoryVM {
  key: ServiceCategory
  label: string
  icon: string
  tip: string
}

const TAB_INDEX = 1

const CATEGORIES: ICategoryVM[] = (Object.keys(SERVICE_CATEGORY_DICT) as ServiceCategory[]).map(
  (key) => ({
    key,
    label: SERVICE_CATEGORY_DICT[key].label,
    icon: SERVICE_CATEGORY_DICT[key].icon,
    tip: SERVICE_CATEGORY_DICT[key].tip,
  }),
)

interface IServiceData extends Partial<IPaginationData<IServiceVM>>, Partial<IElderModeData> {
  categories: ICategoryVM[]
  activeCategory: ServiceCategory | ''
  keyword: string
}

type IServiceCustom = IPageBehaviorSupport &
  IPaginationCustom<IServiceItem> & {
    handleCategoryTap(event: WechatMiniprogram.TouchEvent): void
    handleKeywordInput(event: WechatMiniprogram.Input): void
    handleSearch(): void
    handleClearKeyword(): void
    handleServiceTap(event: WechatMiniprogram.TouchEvent): void
    handleRetry(): void
  }

Page<IServiceData, IServiceCustom>({
  behaviors: [elderModeBehavior, paginationBehavior],

  data: {
    categories: CATEGORIES,
    activeCategory: '',
    keyword: '',
    list: [],
  },

  onShow() {
    syncTabBar(this, TAB_INDEX)
    // switchTab 不支持带参数，首页的分类筛选通过 appStore 一次性传递
    const pending = appStore.consumeServiceCategory()
    if (pending) this.setData({ activeCategory: pending as ServiceCategory })
    // 首次进入或切换 tab 回来时刷新，保证价格 / 可约状态是最新的
    void this.refreshPage?.()
  },

  async onPullDownRefresh() {
    await this.refreshPage?.()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    void this.loadMorePage?.()
  },

  /** paginationBehavior 要求实现：取一页数据 */
  async fetchPage(pageNum: number): Promise<IPageFetchResult<IServiceItem>> {
    const res = await getServiceList({
      pageNum,
      pageSize: PAGE_SIZE,
      category: this.data.activeCategory || undefined,
      keyword: this.data.keyword.trim() || undefined,
    })
    return { list: res.list, hasMore: res.hasMore }
  },

  /** paginationBehavior 可选覆盖：DTO -> 视图模型 */
  mapPageItems(items: unknown[]): unknown[] {
    return (items as IServiceItem[]).map((item) => ({
      ...item,
      priceText: `${formatMoney(item.priceCents)}起`,
      soldText: `已服务 ${item.soldCount} 次`,
    }))
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const { key } = event.currentTarget.dataset as { key: ServiceCategory | '' }
    const next = this.data.activeCategory === key ? '' : key
    this.setData({ activeCategory: next })
    logger.event('service_category_filter', { category: next || 'all' })
    void this.refreshPage?.()
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value })
  },

  handleSearch() {
    logger.event('service_search', { keyword: this.data.keyword })
    void this.refreshPage?.()
  },

  handleClearKeyword() {
    this.setData({ keyword: '' })
    void this.refreshPage?.()
  },

  handleServiceTap(event: WechatMiniprogram.TouchEvent) {
    const { id } = event.currentTarget.dataset as { id: string }
    router.push('booking', { itemId: id })
  },

  handleRetry() {
    void this.refreshPage?.()
  },
})
