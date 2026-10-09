/**
 * 将 wx.* 回调式 API 转 Promise。
 * 说明：基础库 2.10.2+ 部分 API 已支持 promisify，但覆盖不全，
 * 统一在此处封装，保证团队写法一致。
 */
export function promisify<TResult, TOptions extends Record<string, unknown>>(
  api: (options: TOptions & { success?: (res: TResult) => void; fail?: (err: unknown) => void }) => void,
) {
  return (options: TOptions = {} as TOptions): Promise<TResult> =>
    new Promise<TResult>((resolve, reject) => {
      api({
        ...options,
        success: resolve,
        fail: reject,
      })
    })
}

/**
 * 使用示例：
 *   const showModal = promisify<WechatMiniprogram.ShowModalSuccessCallbackResult, WechatMiniprogram.ShowModalOption>(wx.showModal)
 *   const res = await showModal({ title: '提示', content: '确认删除吗？' })
 * 说明：常见 API（login / getSetting / authorize / showModal / openSetting）在较新版本的
 * miniprogram-api-typings 中已自带 Promise 重载，可直接 await；此文件用于覆盖没有重载的 API。
 */
