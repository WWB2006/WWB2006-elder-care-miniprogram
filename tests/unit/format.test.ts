/**
 * 展示层格式化的单元测试。
 * 重点覆盖此前存在的缺陷：链式 String.replace 对同一 token 只替换一次。
 */
import {
  bloodPressureLevel,
  calcAge,
  formatDate,
  formatDistance,
  formatMoney,
  fromNow,
  maskPhone,
} from '../../miniprogram/utils/format'

describe('formatDate', () => {
  it('按 pattern 输出日期时间', () => {
    expect(formatDate('2026-10-05 14:30:09', 'YYYY-MM-DD HH:mm:ss')).toBe('2026-10-05 14:30:09')
  })

  it('同一 token 出现多次时全部替换（链式 replace 会漏掉后续的）', () => {
    expect(formatDate('2026-10-05 14:30:09', 'MM/DD MM')).toBe('10/05 10')
  })

  it('支持星期 token', () => {
    // 2026-10-05 是周一
    expect(formatDate('2026-10-05 00:00:00', 'WW')).toBe('周一')
  })

  it('非法输入返回空串而不是 Invalid Date', () => {
    expect(formatDate('not-a-date')).toBe('')
    expect(formatDate('')).toBe('')
  })
})

describe('formatMoney', () => {
  it('分转元并保留两位小数', () => {
    expect(formatMoney(12345)).toBe('¥123.45')
    expect(formatMoney(0)).toBe('¥0.00')
    expect(formatMoney(5)).toBe('¥0.05')
  })

  it('非有限数值兜底为 0，不输出 NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('¥0.00')
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('¥0.00')
  })

  it('可去掉货币符号', () => {
    expect(formatMoney(12345, false)).toBe('123.45')
  })
})

describe('formatDistance', () => {
  it('小于 1 公里用米', () => {
    expect(formatDistance(999)).toBe('999m')
  })

  it('大于等于 1 公里用公里', () => {
    expect(formatDistance(1500)).toBe('1.5km')
  })

  it('负数兜底为 0', () => {
    expect(formatDistance(-10)).toBe('0m')
  })
})

describe('calcAge', () => {
  it('生日为空返回 0', () => {
    expect(calcAge('')).toBe(0)
  })

  it('未来生日返回 0（不返回负数年龄）', () => {
    expect(calcAge('2099-01-01')).toBe(0)
  })

  it('正常生日得到正数年龄', () => {
    expect(calcAge('2000-01-01')).toBeGreaterThanOrEqual(26)
  })
})

describe('fromNow', () => {
  it('未来时间显示「刚刚」而不是负数', () => {
    expect(fromNow(Date.now() + 10_000)).toBe('刚刚')
  })

  it('分钟级相对时间', () => {
    expect(fromNow(Date.now() - 120_000)).toBe('2 分钟前')
  })
})

describe('maskPhone', () => {
  it('11 位手机号脱敏', () => {
    expect(maskPhone('13800008000')).toBe('138****8000')
  })

  it('非标准长度原样返回', () => {
    expect(maskPhone('123')).toBe('123')
  })

  it('空值返回空串', () => {
    expect(maskPhone('')).toBe('')
  })
})

describe('bloodPressureLevel', () => {
  it('识别偏高', () => {
    expect(bloodPressureLevel(150, 95)).toBe('偏高')
  })

  it('识别偏低', () => {
    expect(bloodPressureLevel(80, 50)).toBe('偏低')
  })

  it('正常范围', () => {
    expect(bloodPressureLevel(120, 80)).toBe('正常')
  })

  it('非法数值不抛异常', () => {
    expect(bloodPressureLevel(Number.NaN, 80)).toBe('正常')
  })
})
