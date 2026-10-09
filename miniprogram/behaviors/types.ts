/**
 * Behavior 相关的类型补丁。
 *
 * 背景：小程序运行时自基础库 2.9.2 起支持在 `Page({ behaviors: [...] })` 中挂载 Behavior，
 * 但 `miniprogram-api-typings` 的 `Page.Options` 类型里**没有声明 `behaviors` 字段**，
 * 直接写会报 TS2353。这里把它补进页面的自定义实例类型（`Page<TData, TCustom>` 的 TCustom），
 * 既让类型检查通过，又不必用 `as any` 绕过。
 */
export interface IPageBehaviorSupport {
  behaviors: string[]
}
