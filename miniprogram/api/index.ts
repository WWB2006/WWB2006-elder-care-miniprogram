/**
 * 接口层统一出口。
 * 页面里推荐按需引入具体域，而不是 `import * as api`，便于代码分割与可读性：
 *   import { getServiceList } from '@/api/service'
 */
export * as userApi from './user'
export * as serviceApi from './service'
export * as orderApi from './order'
export * as healthApi from './health'
export * as staffApi from './staff'
export * from './types'
