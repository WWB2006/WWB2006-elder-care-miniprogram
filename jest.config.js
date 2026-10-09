/**
 * Jest 配置。
 * 说明：项目此前只声明了 `npm test` 却没有 jest 配置与任何用例，
 * 直接执行会以「no tests found」失败——这里补齐配置与 ts 转换。
 */
module.exports = {
  testEnvironment: 'node',
  /**
   * 必须把 miniprogram 也列进 roots。
   * 踩过的坑：roots 只写 tests 时，jest 只在 tests 目录内爬取文件，
   * 于是 collectCoverageFrom 里「尚未被任何用例引用」的源文件根本不会被载入统计——
   * 覆盖率虚高（utils 报 90%，实际只有 38%），阈值形同虚设。
   */
  roots: ['<rootDir>/tests', '<rootDir>/miniprogram'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup/wx.ts'],
  // setupFiles 早于测试框架装载，beforeEach 必须放在 setupFilesAfterEnv 里
  setupFilesAfterEnv: ['<rootDir>/tests/setup/after-env.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/miniprogram/$1',
  },
  collectCoverageFrom: [
    'miniprogram/utils/**/*.ts',
    'miniprogram/store/**/*.ts',
    'miniprogram/config/**/*.ts',
    'miniprogram/mock/**/*.ts',
    '!miniprogram/**/*.d.ts',
  ],
  /**
   * 阈值按「当前水位略降一档」设定，作用是防回退而不是刷数字。
   * 当前实测：stmts 96.2 / branch 85.7 / funcs 96.8 / lines 97.5。
   */
  coverageThreshold: {
    global: { statements: 85, branches: 75, functions: 85, lines: 85 },
  },
  clearMocks: true,
  // json-summary 供 scripts/report.js 生成可视化报告使用
  coverageReporters: ['text', 'json-summary'],
}
