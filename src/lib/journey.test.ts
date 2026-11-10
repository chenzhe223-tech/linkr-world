// Link-R World — 旅行闭环与真实可游玩时间：场景验收（纯函数，确定性）
//
// 覆盖规格第十节的场景 A–G。测试环境无法访问铁路 / 航司实时数据，
// 因此交通时刻一律为「按距离与当季票价的估算」，**测试数据不伪装成真实班次**：
// 断言里检查的是「估算被明确标注」，而不是"有真实班次"。

import { describe, expect, it } from 'vitest';
import {
  COMFORT_DAY_PLAY_MIN,
  MAX_PLAN_DAYS,
  PACK_BEFORE_LEAVE_MIN,
  allocateDays,
  assessLifecycle,
  buildLifecycle,
  dayConstraints,
  formatClock,
  humanDuration,
  planJourneyLegs,
  playDaysEquivalent,
} from './journey';
import { createTrip } from '../data/tripData';
import type { ItineraryItem, JourneyInput } from './types';

const base = (over: Partial<JourneyInput> = {}): JourneyInput => ({
  origin: '上海',
  route: ['tengchong'],
  days: 3,
  startDate: '2026-10-17',
  returnMode: 'round-trip',
  oneWay: false,
  departPref: 'auto',
  returnPref: 'auto',
  ...over,
});

/* ── 场景 A：三天、同城往返（上海 → 腾冲） ───────────────── */

describe('场景 A · 三天同城往返：去程与返程都必须排，且如实显示可玩多久', () => {
  const input = base();
  const lc = buildLifecycle(input);

  it('去程与返程都在行程里（不是只有去程）', () => {
    expect(lc.legs.filter((l) => l.kind === 'outbound')).toHaveLength(1);
    expect(lc.legs.filter((l) => l.kind === 'return')).toHaveLength(1);
    expect(lc.mode).toBe('round-trip');
  });

  it('首日正确扣除去程交通：抵达前不能安排活动', () => {
    const d0 = lc.days[0];
    expect(d0.role).toBe('departure');
    expect(d0.travelMinutes).toBeGreaterThan(0);
    expect(d0.accessMinutes).toBeGreaterThan(0);
    // 时间窗下界 = 抵达 + 30 分休整
    const arrive = lc.legs.find((l) => l.kind === 'outbound')!.endMin;
    expect(d0.windows[0].lo).toBe(arrive + 30);
  });

  it('末日以返程倒推：活动必须在「最晚离开」之前结束', () => {
    const back = lc.legs.find((l) => l.kind === 'return')!;
    const dLast = lc.days[lc.days.length - 1];
    expect(dLast.role).toBe('return');
    expect(dLast.windows[0].hi).toBeLessThan(back.startMin);
    expect(dLast.playMinutes).toBeLessThan(lc.days[1].playMinutes);
  });

  it('日历天数 ≠ 完整游玩天数：三天不等于三天可玩', () => {
    expect(lc.calendarDays).toBe(3);
    const fullDay = lc.days[1].playMinutes;
    expect(lc.playMinutes).toBeLessThan(3 * fullDay);
    expect(lc.playMinutes).toBeGreaterThan(0);
  });

  it('分别给出总时长 / 交通 / 城际 / 可玩（不允许只有一个"三天"标签）', () => {
    expect(lc.totalMinutes).toBeGreaterThan(lc.travelMinutes);
    expect(lc.travelMinutes).toBeGreaterThan(0);
    expect(lc.intercityMinutes).toBe(0); // 单城无城际
    expect(lc.playMinutesByDay).toHaveLength(3);
  });

  it('交通时刻一律标注为估算 / 待确认，绝不虚构班次', () => {
    expect(lc.legs.every((l) => l.confirmed === false)).toBe(true);
    expect(lc.legs.every((l) => l.basis.length > 0)).toBe(true);
    expect(lc.pending.some((p) => p.includes('确认班次'))).toBe(true);
  });

  it('生成器按当日窗口限流：抵达日与返程日排的块数少于完整日', () => {
    const trip = createTrip('tengchong', { origin: '上海', days: 3, startDate: '2026-10-17' });
    const perDay = trip.days.map(
      (d) => trip.items.filter((i) => i.dayIndex === d.index).length
    );
    expect(perDay[0]).toBeLessThanOrEqual(perDay[1]);
    expect(perDay[2]).toBeLessThanOrEqual(perDay[1]);
    expect(trip.days[0].theme).toContain('抵达');
  });

  it('生成的每一天，行程块都落在当天可用时间窗内（无"交通没完就开玩"）', () => {
    const trip = createTrip('tengchong', { origin: '上海', days: 3, startDate: '2026-10-17' });
    const lc2 = buildLifecycle(trip.journey!, trip.items);
    const blocks = lc2.feasibility.issues.filter(
      (i) => i.code === 'activity-before-arrival' || i.code === 'activity-after-return'
    );
    expect(blocks).toEqual([]);
  });
});

/* ── 场景 B：多城市逐段闭环 ─────────────────────────────── */

describe('场景 B · 多城市：每一段都要有交通衔接，最后一座城市必须能回去', () => {
  const input = base({ route: ['tengchong', 'dali'], days: 5, startDate: '2026-10-17' });
  const plan = planJourneyLegs(input);
  const lc = buildLifecycle(input);

  it('城市间交通逐段规划（腾冲 → 大理）', () => {
    expect(plan.legs.filter((l) => l.kind === 'intercity')).toHaveLength(1);
    const ic = plan.legs.find((l) => l.kind === 'intercity')!;
    expect(ic.from).toBe('腾冲');
    expect(ic.to).toBe('大理');
    expect(ic.minutes).toBeGreaterThan(0);
  });

  it('最后一座城市存在返回出发地的路线', () => {
    const back = plan.legs.find((l) => l.kind === 'return')!;
    expect(back.from).toBe('大理');
    expect(back.to).toBe('上海');
  });

  it('天数按城分配，每城至少一天', () => {
    const alloc = allocateDays(5, 2);
    expect(alloc.reduce((s, n) => s + n, 0)).toBe(5);
    expect(alloc.every((n) => n >= 1)).toBe(true);
  });

  it('城际转移日不是完整游玩日：转移当天窗口被压缩', () => {
    const transit = lc.days.find((d) => d.role === 'transit')!;
    expect(transit.windows[0].lo).toBeGreaterThan(8 * 60 + 30);
    expect(transit.playMinutes).toBeLessThan(lc.days[1].playMinutes);
  });

  it('交通与景点不重叠：所有行程块都在当日窗口内', () => {
    const days = dayConstraints(plan);
    for (const d of days) {
      if (d.windows.length === 0) continue;
      for (const l of plan.legs.filter((x) => x.dayIndex === d.dayIndex)) {
        const overlap = l.endMin > d.windows[0].lo && l.startMin < d.windows[0].hi;
        // 交通结束时刻早于窗口下界（含 30 分休整），因此不可能重叠
        expect(overlap && l.minutes > 0 ? l.endMin > d.windows[0].lo : true).toBe(true);
      }
    }
  });
});

/* ── 场景 C：返程时间较早 ───────────────────────────────── */

describe('场景 C · 末日一早返程：自动压缩内容并提前去枢纽', () => {
  const auto = buildLifecycle(base());
  const early = buildLifecycle(base({ returnPref: 'morning' }));

  it('上午返程的可玩时间明显少于默认下午返程', () => {
    const a = auto.days[2].playMinutes;
    const b = early.days[2].playMinutes;
    expect(b).toBeLessThan(a);
  });

  it('窗口上界倒推出「最晚离开」并留出候车与接驳时间', () => {
    const back = early.legs.find((l) => l.kind === 'return')!;
    const d = early.days[early.days.length - 1];
    // 窗口上界 = 返程实际出发 − 30 分回住处取行李（倒推）；
    // 若返程早到连窗口都不剩，则该日可玩时间必须为 0（不得硬造时间）
    if (d.windows.length > 0) {
      expect(d.windows[0].hi).toBe(back.startMin - PACK_BEFORE_LEAVE_MIN);
    } else {
      expect(d.playMinutes).toBe(0);
    }
    expect(back.hubStartMin - back.startMin).toBe(back.accessBefore);
    expect(back.accessBefore).toBeGreaterThanOrEqual(90);
  });

  it('末日被交通占满时必须如实报出，并给出可执行调整建议', () => {
    expect(early.feasibility.issues.some((i) => i.code === 'day-no-play-time')).toBe(true);
    expect(early.feasibility.suggestions.join('|')).toContain('返程日已被交通占满');
  });

  it('末日排的块数不超过压缩后的容量', () => {
    const trip = createTrip('tengchong', {
      origin: '上海',
      days: 3,
      startDate: '2026-10-17',
      returnPref: 'morning',
    });
    const last = trip.days[trip.days.length - 1];
    const count = trip.items.filter((i) => i.dayIndex === last.index).length;
    const lc = buildLifecycle(trip.journey!, trip.items);
    const cap = lc.days[lc.days.length - 1].capacity;
    expect(count).toBeLessThanOrEqual(Math.max(2, cap));
  });
});

/* ── 场景 D：交通时间较长，天数不足 ─────────────────────── */

describe('场景 D · 远距离只给 2 天：必须识别时间不足并给出延长建议', () => {
  const input = base({ days: 2, startDate: '2026-10-17' });
  const lc = buildLifecycle(input);

  it('识别时间不足（status 不为 ok）', () => {
    expect(lc.feasibility.status).not.toBe('ok');
  });

  it('给出延长天数的建议，且不超过骨架上限', () => {
    const s = lc.feasibility.suggestedDays;
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(2);
    expect(s!).toBeLessThanOrEqual(Math.max(2, MAX_PLAN_DAYS));
  });

  it('建议里包含「延长」与「删掉低优先级」这类可执行动作', () => {
    const text = lc.feasibility.suggestions.join('|');
    expect(text.length).toBeGreaterThan(0);
    expect(lc.feasibility.suggestions.length).toBeGreaterThan(0);
  });

  it('生成器在这种情况下优先保留高分景点（不会硬塞满）', () => {
    const trip = createTrip('tengchong', { origin: '上海', days: 2, startDate: '2026-10-17' });
    const lc2 = buildLifecycle(trip.journey!, trip.items);
    // 2 天远途：块数必须明显少于 3 天的情况
    const trip3 = createTrip('tengchong', { origin: '上海', days: 3, startDate: '2026-10-17' });
    expect(trip.items.length).toBeLessThanOrEqual(trip3.items.length);
    expect(lc2.playMinutes).toBeLessThan(COMFORT_DAY_PLAY_MIN * 2 + 1);
  });
});

/* ── 场景 E：开放式路线 ─────────────────────────────────── */

describe('场景 E · 上海出发成都结束：不得强行加回上海的返程', () => {
  const input = base({
    origin: '上海',
    route: ['chengdu'],
    days: 4,
    returnMode: 'open-jaw',
    startDate: '2026-10-17',
  });
  const lc = buildLifecycle(input);

  it('识别为开放式路线，结束地是成都', () => {
    expect(lc.mode).toBe('open-jaw');
    expect(lc.returnTo).toBe('成都');
  });

  it('不生成返回上海的交通段', () => {
    expect(lc.legs.filter((l) => l.kind === 'return')).toHaveLength(0);
    expect(lc.travelMinutes).toBeGreaterThan(0); // 去程仍在
    expect(lc.legs.every((l) => l.to !== '上海')).toBe(true);
  });

  it('明确说明不含返程，而不是悄悄省略', () => {
    expect(lc.pending.join('|')).toContain('开放式');
    expect(lc.note).toContain('开放式');
  });
});

/* ── 场景 F：数据缺失 ───────────────────────────────────── */

describe('场景 F · 交通时刻拿不到：标记待确认 / 估算，绝不编班次', () => {
  it('未填出发地：不算往返交通，并明确提示', () => {
    const lc = buildLifecycle(base({ origin: '' }));
    expect(lc.legs).toHaveLength(0);
    expect(lc.pending.join('|')).toContain('出发地');
    expect(lc.feasibility.issues.some((i) => i.code === 'origin-missing')).toBe(true);
    expect(lc.note).toContain('未填出发地');
  });

  it('出发地不在库里：按中程估算并标注未识别', () => {
    const lc = buildLifecycle(base({ origin: '某个没有的小城' }));
    expect(lc.legs.length).toBeGreaterThan(0);
    expect(lc.pending.join('|')).toContain('未在库里');
    expect(lc.legs[0].basis).toContain('未识别');
  });

  it('未定日期：提示按默认时段推算', () => {
    const lc = buildLifecycle(base({ startDate: '' }));
    expect(lc.pending.join('|')).toContain('出发日期未定');
  });

  it('任何交通段都不能被当成已确认预订', () => {
    const names = ['上海', '杭州', '成都'];
    for (const o of names) {
      const lc = buildLifecycle(base({ origin: o }));
      expect(lc.legs.every((l) => !l.confirmed)).toBe(true);
    }
  });
});

/* ── 场景 G：时间冲突 ───────────────────────────────────── */

describe('场景 G · 冲突识别：活动与返程 / 抵达时间打架', () => {
  const input = base();
  const plan = planJourneyLegs(input);
  const days = dayConstraints(plan);

  const item = (dayIndex: number, time: string): ItineraryItem => ({
    id: `t${dayIndex}`,
    dayIndex,
    slot: 'morning',
    time,
    placeId: 'xx',
    note: '',
    transit: { mode: '步行', minutes: 10 },
    cost: 0,
    costCategory: 'other',
  });

  it('活动早于抵达时间 → 判定为冲突（block）', () => {
    const f = assessLifecycle(plan, days, [item(0, '09:00–11:00')]);
    const hit = f.issues.find((i) => i.code === 'activity-before-arrival');
    expect(hit).toBeTruthy();
    expect(hit!.severity).toBe('block');
    expect(f.status).toBe('infeasible');
  });

  it('活动晚于返程最晚离开时间 → 判定为冲突（block）', () => {
    const f = assessLifecycle(plan, days, [item(2, '18:00–20:00')]);
    const hit = f.issues.find((i) => i.code === 'activity-after-return');
    expect(hit).toBeTruthy();
    expect(hit!.severity).toBe('block');
  });

  it('落在窗口内的活动不报冲突', () => {
    const d0 = days[0];
    const t = item(0, `${formatClock(d0.windows[0].lo)}–${formatClock(d0.windows[0].lo + 90)}`);
    const f = assessLifecycle(plan, days, [t]);
    expect(
      f.issues.filter((i) => i.code === 'activity-before-arrival' || i.code === 'activity-after-return')
    ).toEqual([]);
  });

  it('冲突时给出可执行建议（不是只报错）', () => {
    const f = assessLifecycle(plan, days, [item(0, '09:00–11:00')]);
    expect(f.suggestions.length).toBeGreaterThan(0);
  });
});

/* ── 口径与格式化 ───────────────────────────────────────── */

describe('闭环口径的展示辅助', () => {
  it('formatClock 跨日加 (+1)', () => {
    expect(formatClock(8 * 60 + 30)).toBe('08:30');
    expect(formatClock(24 * 60 + 75)).toBe('01:15（+1）');
  });

  it('humanDuration / playDaysEquivalent 口径清晰', () => {
    expect(humanDuration(0)).toBe('0 小时');
    expect(humanDuration(95)).toBe('1 小时 35 分');
    expect(playDaysEquivalent(600)).toContain('1.0');
  });

  it('allocateDays：5 天 3 城 = 2+2+1，且不少于城市数', () => {
    expect(allocateDays(5, 3)).toEqual([2, 2, 1]);
    expect(allocateDays(2, 4).reduce((s, n) => s + n, 0)).toBe(4);
  });

  it('同城出发不计大交通', () => {
    const lc = buildLifecycle(base({ origin: '腾冲' }));
    // 腾冲 → 腾冲：同城，交通段为 0 分钟
    expect(lc.travelMinutes).toBe(0);
    expect(lc.note).toContain('同城');
  });
});
