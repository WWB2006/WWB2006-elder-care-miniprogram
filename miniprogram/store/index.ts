/**
 * 状态层出口。页面按需引入：
 *   import { appStore } from '@/store/app'
 *   import { userStore } from '@/store/user'
 */
export { appStore } from './app'
export { userStore } from './user'
export { Store, connectStore } from './base'
export type { IAppState } from './app'
export type { IUserState } from './user'
