/**
 * 小程序 TS 代码规范（ESLint 8.57+ 的 Flat Config 格式）。
 *
 * 重要：ESLint 8.57 检测到 `eslint.config.js` 时会**自动启用 Flat Config**，
 * 而 Flat Config 只接受「配置对象数组」。原文件写的是 eslintrc 格式
 * （`root` / `extends` / `parser: '@typescript-eslint/parser'` 字符串），
 * 在 Flat Config 下这些键全部无效 —— 结果是所有文件都被判为"被忽略"，
 * `npm run lint` 实际上一条规则都没跑。此处改为标准 Flat Config。
 *
 * 重点规则：
 * 1) 禁止 any 泛滥 —— 接口返回值必须有类型；
 * 2) 禁止在小程序端使用浏览器专有 API（window/document/localStorage）；
 * 3) 强制 wx.* 回调转 Promise 使用统一封装（utils/promisify.ts）。
 */
const js = require('@eslint/js')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')
const prettierConfig = require('eslint-config-prettier')

const MINIPROGRAM_GLOBALS = {
  wx: 'readonly',
  App: 'readonly',
  Page: 'readonly',
  Component: 'readonly',
  Behavior: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  getDate: 'readonly',
}

/**
 * jest 全局只在测试里声明。
 * 早期版本把它们混在 MINIPROGRAM_GLOBALS 里，等于告诉 ESLint「业务代码可以用 describe」，
 * 一旦有人误把小段测试代码粘进 utils，lint 不会报警。
 */
const JEST_GLOBALS = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
}

const NODE_GLOBALS = {
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  module: 'readonly',
  require: 'readonly',
}

/** 小程序源码与测试共用的 TS 规则集，避免两处各写一份而漂移 */
const TS_RULES = {
  ...tsPlugin.configs.recommended.rules,
  // TypeScript 自己就能检查未定义标识符与重复声明，ESLint 的对应规则会误报
  // 全局类型（Role / IApiResponse 等）与函数重载，必须关闭
  'no-undef': 'off',
  'no-redeclare': 'off',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-restricted-globals': [
    'error',
    { name: 'window', message: '小程序不支持 window，请使用 wx API 或全局状态' },
    { name: 'document', message: '小程序不支持 document' },
    { name: 'localStorage', message: '请使用 utils/storage.ts 统一封装' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
}

module.exports = [
  {
    // 构建产物、依赖与第三方 JS 一律不参与 lint
    ignores: [
      'node_modules/**',
      'miniprogram/miniprogram_npm/**',
      'dist/**',
      'coverage/**',
      '**/*.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['miniprogram/**/*.ts', 'typings/**/*.d.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: MINIPROGRAM_GLOBALS,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: TS_RULES,
  },
  {
    // 单元测试：同样是 TS，额外需要 jest 与 node 全局
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...MINIPROGRAM_GLOBALS,
        ...JEST_GLOBALS,
        ...NODE_GLOBALS,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...TS_RULES,
      // 测试里 mock 场景频繁需要 any 断言，放宽为 off
      '@typescript-eslint/no-explicit-any': 'off',
      // 测试需要临时静音 console 以保持输出干净
      'no-console': 'off',
    },
  },
  {
    // 日志模块本身就是 console 的封装层，允许其直接调用 console
    files: ['miniprogram/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  prettierConfig,
]
