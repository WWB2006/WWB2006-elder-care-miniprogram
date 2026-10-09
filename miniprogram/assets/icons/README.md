# 图标资源说明

本目录存放小程序内使用的图标（PNG，@3x 导出，显示尺寸 48rpx，单张不超过 8KB）。

## 当前已提供的文件（16 个）

| 文件名 | 用途 | 尺寸 | 颜色 |
| --- | --- | --- | --- |
| tab-home.png / tab-home-active.png | tabBar 首页 | 96 × 96 px | `#8A94A6` / `#1E5AA8` |
| tab-service.png / tab-service-active.png | tabBar 服务 | 96 × 96 px | `#8A94A6` / `#1E5AA8` |
| tab-order.png / tab-order-active.png | tabBar 订单 | 96 × 96 px | `#8A94A6` / `#1E5AA8` |
| tab-mine.png / tab-mine-active.png | tabBar 我的 | 96 × 96 px | `#8A94A6` / `#1E5AA8` |
| cat-meal.png | 助餐 | 96 × 96 px | `#1E5AA8` |
| cat-bath.png | 助浴 | 96 × 96 px | `#1E5AA8` |
| cat-clean.png | 助洁 | 96 × 96 px | `#1E5AA8` |
| cat-medical.png | 助医 | 96 × 96 px | `#1E5AA8` |
| cat-walk.png | 助行 | 96 × 96 px | `#1E5AA8` |
| cat-rehab.png | 康复护理 | 96 × 96 px | `#1E5AA8` |
| cat-escort.png | 陪诊 | 96 × 96 px | `#1E5AA8` |
| cat-comfort.png | 精神慰藉 | 96 × 96 px | `#1E5AA8` |

`cat-*.png` 的文件名与 `miniprogram/config/constant.ts` 中
`SERVICE_CATEGORY_DICT[key].icon` 一一对应，新增分类时必须同时补图标。

> 这 16 张是**代码生成的单色扁平占位图**，保证项目导入微信开发者工具后
> tabBar 与首页分类不会出现破图。上线前应替换为设计稿导出的正式图标，
> 替换时保持文件名与尺寸不变即可，无需改动任何代码。

## 引用位置

| 位置 | 引用方式 | 缺图时的表现 |
| --- | --- | --- |
| `custom-tab-bar/index.wxml` | `<image src="/assets/icons/tab-{{item.icon}}{{-active}}.png">` | 破图（无兜底），底部文字仍在 |
| `pages/home/index.wxml` | `<image src="/assets/icons/cat-{{item.icon}}.png">` | 破图（无兜底），下方分类文字仍在 |
| `components/icon` | `<icon name="cat-xxx" symbol="餐" />` | 自动回落到 `symbol` 文案，不会破图 |

因此**新增图标入口时优先使用 `components/icon` 组件**，它自带缺失兜底。

## 约定

- 图标必须配文字使用，禁止"只有图标没有标签"的入口（见 `docs/设计方案.md` 第 6.6 节）；
- 颜色走设计令牌（主色 `#1E5AA8` / 中性 `#8A94A6`），不要使用渐变与低对比度描边；
- 装饰性大图（首页 banner、活动图）放 CDN，不打进代码包，避免主包超 2MB。

## 尚未提供的图标（按需补充）

以下图标在设计方案中提到但当前代码尚未引用，需要用到时再补：

| 文件名 | 用途 | 尺寸 |
| --- | --- | --- |
| sos.png | 紧急呼叫 | 160 × 160 px |
| voice.png | 语音助手 | 96 × 96 px |
| phone.png | 亲情号码 | 96 × 96 px |
