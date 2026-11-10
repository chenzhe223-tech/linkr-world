// 口径一致性检查（2026-10-10 用户反馈回归：写了"周末去"却排出周四，必须提示 + 可修正）
import { describe, expect, it } from 'vitest';
import { checkDateConsistency } from './consistency';

describe('周末口径一致性检查', () => {
  it('写了周末但日期是周四 → 提示矛盾，修正到同一周的周六 · 2 天', () => {
    // 2026-11-19 是周四
    const issues = checkDateConsistency({
      text: '周末去腾冲，想看火山和温泉',
      startDate: '2026-11-19',
      days: 2,
      today: '2026-11-10',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('weekend-mismatch');
    expect(issues[0].message).toContain('周四');
    expect(issues[0].fix.startDate).toBe('2026-11-21'); // 本周周六
    expect(issues[0].fix.days).toBe(2);
    expect(issues[0].fix.note).toContain('周五晚上出发');
    expect(issues[0].fix.note).toContain('周日晚返回');
  });

  it('写了周末但日期是周五 → 修正到同一周的周六（周五晚出发口径）', () => {
    const issues = checkDateConsistency({
      text: '周末去大理 2 天',
      startDate: '2026-11-20', // 周五
      days: 2,
      today: '2026-11-10',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].fix.startDate).toBe('2026-11-21');
  });

  it('日期已是周六但天数不是 2 → 提示口径，只改天数不改日期', () => {
    const issues = checkDateConsistency({
      text: '周末去苏州',
      startDate: '2026-11-21', // 周六
      days: 3,
      today: '2026-11-10',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].fix.startDate).toBe('2026-11-21');
    expect(issues[0].fix.days).toBe(2);
  });

  it('没填日期但写了周末 → 给下一个周六的建议（不强改）', () => {
    // 2026-11-10 是周二 → 下一个周六是 11-14
    const issues = checkDateConsistency({
      text: '周末去腾冲',
      startDate: '',
      days: 2,
      today: '2026-11-10',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].fix.startDate).toBe('2026-11-14');
  });

  it('没有周末口径 / 明确否定周末 → 不提示', () => {
    expect(
      checkDateConsistency({ text: '11月19号去腾冲 2 天', startDate: '2026-11-19', days: 2 })
    ).toHaveLength(0);
    expect(
      checkDateConsistency({ text: '错峰不是周末去腾冲', startDate: '2026-11-19', days: 2 })
    ).toHaveLength(0);
  });

  it('周六出发 + 2 天 → 口径自洽，不提示', () => {
    expect(
      checkDateConsistency({
        text: '周末去腾冲看火山',
        startDate: '2026-11-21',
        days: 2,
        today: '2026-11-10',
      })
    ).toHaveLength(0);
  });
});
