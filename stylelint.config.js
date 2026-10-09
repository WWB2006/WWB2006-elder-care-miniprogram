/**
 * WXSS 规范。
 * 关键约束：
 * 1) 颜色 / 字号 / 间距 一律使用 styles/variables.wxss 中的令牌，禁止硬编码色值；
 * 2) 老人端字号不得低于设计规范（见 docs/设计方案.md 第 6.6 节）。
 *
 * 类名规范：BEM（block / block__element / block--modifier），短横线小写。
 * 注意：早期配置写成 `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`，它会把代码里大量 BEM 类名
 * （如 `tabbar__item`、`sos-entry__title`）判为违规，导致 lint:style 对既有代码直接失败。
 */
module.exports = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['miniprogram/miniprogram_npm/**', 'node_modules/**'],
  rules: {
    'color-no-hex': [true, { message: '请使用 var(--color-*) 设计令牌' }],
    'declaration-no-important': true,
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
      { message: '类名请遵循 BEM：block / block__element / block--modifier' },
    ],
    // WXSS 专有单位，stylelint-config-standard 不认识 rpx，必须显式放行
    'unit-no-unknown': [true, { ignoreUnits: ['rpx'] }],
    // WXSS 的 @import 语法不带 url()，且 page 是 WXSS 内置选择器
    'import-notation': null,
    'selector-type-no-unknown': [true, { ignoreTypes: ['page'] }],
    // 设计令牌按功能分组、组间留空行更易读，与"自定义属性前禁止空行"冲突，关闭
    'custom-property-empty-line-before': null,
    // WXSS 环境下 rgba() 的旧写法（逗号分隔 + 小数透明度）兼容性最好，
    // 现代写法 rgb(0 0 0 / 50%) 在部分低端 Android WebView 上不生效，因此关闭这两条自动升级规则
    'color-function-notation': null,
    'alpha-value-notation': null,
    'no-descending-specificity': null,
    'font-family-no-missing-generic-family-keyword': null,
  },
  overrides: [
    {
      files: ['miniprogram/styles/variables.wxss'],
      rules: { 'color-no-hex': null },
    },
  ],
}

