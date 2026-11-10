// Link-R World — 直飞规则 + 票价账本（预算不许杜撰）
//
// 这两组断言对应两件必须成立的事：
//   1) ≤5 天行程拿不到直飞时，必须明确问用户，推荐方案标「待确认」，
//      绝不把中转航班悄悄当成直飞排，也不机械套用到铁路上；
//   2) 票价账本里估算就是估算、录入实价才升级「已查实时」，
//      行程变更后旧实价自动失效并提示复核 —— 预算只从可追溯的数字来。

import { describe, expect, it } from 'vitest';
import { DIRECT_FLIGHT_MAX_DAYS, planIntercity } from './transport';
import { buildFareLedger, fareLineId, type ManualFare } from './fares';
import type { TripLeg } from './types';

const NODE = {
  puer: {
    name: '普洱',
    lat: 22.786,
    lng: 100.972,
    hasAirport: true,
    hasDirectRail: false,
    transferNote: '普洱无高铁直达：飞机常经昆明中转；火车走中老铁路（昆明转动车约 2 小时）',
  },
  dali: {
    name: '大理',
    lat: 25.6065,
    lng: 100.2676,
    hasAirport: true,
    hasDirectRail: true,
    transferNote: '大理站有跨省直达动车，也可直飞大理荒草坝机场',
  },
  suzhou: { name: '苏州', lat: 31.311, lng: 120.62, hasAirport: false, hasDirectRail: true },
} as const;

describe('直飞规则（≤5 天优先直飞）', () => {
  it('≤5 天且无直飞 → 必须给问句与选项，推荐方案标「待确认」', () => {
    const p = planIntercity('上海', NODE.puer, '2026-05-12', null, { days: 3, now: '2026-05-01' });
    expect(p.directFlight.applicable).toBe(true);
    expect(p.directFlight.available).toBe(false);
    expect(p.directFlight.question).toBeTruthy();
    expect(p.directFlight.choices.length).toBeGreaterThanOrEqual(2);
    expect(p.directFlight.message).toContain('没有直飞航班');
    const rec = p.options.find((o) => o.key === p.recommendedKey);
    expect(rec?.status).toBe('unconfirmed');
    expect(rec?.direct).toBe(false);
  });

  it('≤5 天且有直飞 → 优先直飞，无需用户拍板', () => {
    const p = planIntercity('上海', NODE.dali, '2026-05-12', null, { days: 4, now: '2026-05-01' });
    expect(p.directFlight.applicable).toBe(true);
    expect(p.directFlight.available).toBe(true);
    expect(p.directFlight.question).toBeNull();
    const rec = p.options.find((o) => o.key === p.recommendedKey);
    expect(rec?.direct).toBe(true);
    expect(rec?.status).toBe('estimate');
  });

  it('>5 天才把直飞与中转放在一起比较', () => {
    const p = planIntercity('上海', NODE.puer, '2026-07-12', null, {
      days: DIRECT_FLIGHT_MAX_DAYS + 2,
      now: '2026-05-01',
    });
    expect(p.directFlight.applicable).toBe(false);
    expect(p.directFlight.question).toBeNull();
    expect(p.directFlight.message).toContain('比较');
  });

  it('目的地无机场 → 明说没有航空选项；直达高铁照常推荐（铁路不套用航空规则）', () => {
    const p = planIntercity('北京', NODE.suzhou, '2026-05-12', null, { days: 3, now: '2026-05-01' });
    expect(p.directFlight.question).toBeNull();
    expect(p.directFlight.message).toContain('暂无民航航班');
    const rec = p.options.find((o) => o.key === p.recommendedKey);
    expect(rec?.key).toBe('hsr');
  });

  it('每个方案都带口径来源、生成时间与官方核对入口', () => {
    const p = planIntercity('上海', NODE.puer, '2026-05-12', null, { days: 3, now: '2026-05-01' });
    for (const o of p.options) {
      expect(o.source.length).toBeGreaterThan(8);
      expect(o.asOf).toBe('2026-05-01');
      expect(['estimate', 'unconfirmed']).toContain(o.status);
      if (o.key === 'flight' || o.key === 'hsr' || o.key === 'train') {
        expect(o.queryUrl.startsWith('https://')).toBe(true);
        // 航空给航旅纵横入口，铁路给 12306 入口 —— 不代查，只给官方核对渠道
        expect(/12306|航旅纵横/.test(o.queryLabel)).toBe(true);
      }
    }
  });
});

/* ── 票价账本 ───────────────────────────────────────────── */

function legOf(
  kind: 'outbound' | 'return',
  from: string,
  to: string,
  dateISO: string,
  fare: NonNullable<TripLeg['fare']>,
  mode = '飞机'
): TripLeg {
  return {
    id: kind === 'outbound' ? 'leg-out' : 'leg-back',
    kind,
    dayIndex: 0,
    dateISO,
    from,
    to,
    mode,
    startMin: 480,
    endMin: 700,
    hubStartMin: 520,
    hubEndMin: 660,
    minutes: 140,
    accessBefore: 135,
    accessAfter: 45,
    time: '08:00–11:40',
    hubTime: '08:40–11:00',
    confirmed: false,
    basis: '测试用口径',
    overnight: false,
    fare,
  };
}

const ESTIMATE_FARE: NonNullable<TripLeg['fare']> = {
  modeKey: 'flight',
  direct: true,
  transfer: '',
  low: 520,
  high: 780,
  status: 'estimate',
  source: '机票 = 里程基准价 × 平季折扣 + 机建燃油（估算，非实时票价）',
  asOf: '2026-05-01',
  queryUrl: 'https://www.umetrip.com/',
  queryLabel: '航旅纵横 · 航班与票价查询',
};

describe('票价账本（估算 / 实价 / 待确认，只重算受影响的行）', () => {
  it('默认给估算行：写明「暂未获取实时票价」，并给官方核对入口', () => {
    const led = buildFareLedger({
      legs: [
        legOf('outbound', '上海', '大理', '2026-05-12', ESTIMATE_FARE),
        legOf('return', '大理', '上海', '2026-05-15', ESTIMATE_FARE),
      ],
      travelers: 2,
      manual: {},
    });
    expect(led.lines).toHaveLength(2);
    expect(led.lines.every((l) => l.status === 'estimate')).toBe(true);
    expect(led.hasLive).toBe(false);
    expect(led.notices.join('')).toContain('暂未获取实时票价');
    expect(led.lines.every((l) => l.queryUrl.startsWith('https://'))).toBe(true);
    expect(led.perPerson).toEqual({ low: 1040, high: 1560 });
    expect(led.party).toEqual({ low: 2080, high: 3120 });
  });

  it('录入实价后该行升级「已查实时」，并保留来源与查询时间', () => {
    const id = fareLineId('outbound', '上海', '大理', '2026-05-12', 'flight');
    const manual: Record<string, ManualFare> = {
      [id]: { perPerson: 660, service: 'MU5401', cabin: '经济舱', source: '航旅纵横', queriedAt: '2026-05-09' },
    };
    const led = buildFareLedger({
      legs: [
        legOf('outbound', '上海', '大理', '2026-05-12', ESTIMATE_FARE),
        legOf('return', '大理', '上海', '2026-05-15', ESTIMATE_FARE),
      ],
      travelers: 2,
      manual,
    });
    const out = led.lines.find((l) => l.kind === 'outbound');
    expect(out?.status).toBe('live');
    expect(out?.perPersonLow).toBe(660);
    expect(out?.service).toBe('MU5401');
    expect(out?.source).toBe('航旅纵横');
    expect(out?.queriedAt).toBe('2026-05-09');
    expect(led.counts).toEqual({ live: 1, estimate: 1, unconfirmed: 0 });
    // 人均 = 实价 + 估算下沿
    expect(led.perPerson.low).toBe(660 + 520);
  });

  it('行程变更（日期/方式变了）→ 旧实价自动失效并提示复核，不冒充新行程的实价', () => {
    const oldId = fareLineId('outbound', '上海', '大理', '2026-05-12', 'flight');
    const led = buildFareLedger({
      legs: [legOf('outbound', '上海', '大理', '2026-05-20', ESTIMATE_FARE)],
      travelers: 1,
      manual: { [oldId]: { perPerson: 660, source: '航旅纵横', queriedAt: '2026-05-09' } },
    });
    expect(led.lines[0]?.status).toBe('estimate');
    expect(led.staleManualKeys).toEqual([oldId]);
    expect(led.notices.join('')).toContain('重新确认');
  });

  it('待确认的段（无直飞）不冒充可依赖预算', () => {
    const unconfirmed = { ...ESTIMATE_FARE, status: 'unconfirmed' as const, direct: false, transfer: '经昆明中转' };
    const led = buildFareLedger({
      legs: [legOf('outbound', '上海', '普洱', '2026-05-12', unconfirmed, '飞机（经昆明中转）')],
      travelers: 1,
      manual: {},
    });
    expect(led.lines[0]?.status).toBe('unconfirmed');
    expect(led.lines[0]?.needsConfirm).toBe(true);
    expect(led.notices.join('')).toContain('待你确认');
  });

  it('没有去程 / 返程时不编数字', () => {
    const led = buildFareLedger({ legs: [], travelers: 2, manual: {} });
    expect(led.lines).toHaveLength(0);
    expect(led.perPerson).toEqual({ low: 0, high: 0 });
    expect(led.notices.join('')).toContain('还没有去程 / 返程交通');
  });
});

// 回归：目的地无机场 + 无直达铁路且 ≤500km 时，flight 与 rail 都会缺席，
// options 会变成空数组。这里曾经直接 `rec.recommended = true` 抛 TypeError；
// 就算不抛，上层也会拿到 option=null，把交通段和票价一起静默丢掉。
describe('交通方案兜底（不能空手而归）', () => {
  // 距离要在 40–500km 之间：<40km 会走「同城/相邻」分支（本来就无大交通），
  // >500km 时 railOption 会给普速中转动车，就不是「空手」场景了。
  const NO_AIRPORT_NO_RAIL = {
    name: '某地',
    lat: 27.0,
    lng: 116.0,
    hasAirport: false,
    hasDirectRail: false,
  };

  it('既无民航也无直达铁路时，仍给出一个明确标注「待确认」的方案', () => {
    const plan = planIntercity('厦门', NO_AIRPORT_NO_RAIL, '2026-05-01', undefined, {
      days: 3,
      now: '2026-05-01',
    });
    expect(plan.options.length).toBeGreaterThan(0);
    expect(plan.recommendedKey).toBeTruthy();
    const rec = plan.options.find((o) => o.key === plan.recommendedKey);
    expect(rec?.status).toBe('unconfirmed');
    expect(rec?.note).toContain('无民航航班');
    expect(rec?.source).toContain('需自行确认');
    // 没有可直接出票的方案时，不能给一个官方查询入口让人误以为能查到班次
    expect(rec?.queryUrl).toBe('');
    expect(plan.recommendReason).toContain('公路口径');
  });

  it('这笔钱不会被当成可依赖的实价（账本标「待确认」）', () => {
    const plan = planIntercity('厦门', NO_AIRPORT_NO_RAIL, '2026-05-01', undefined, {
      days: 3,
      now: '2026-05-01',
    });
    const rec = plan.options.find((o) => o.key === plan.recommendedKey)!;
    const leg = {
      id: 'leg-out',
      kind: 'outbound' as const,
      dayIndex: 0,
      dateISO: '2026-05-01',
      from: '厦门',
      to: '某地',
      mode: rec.label,
      startMin: 0,
      endMin: 60,
      hubStartMin: 0,
      hubEndMin: 60,
      minutes: 60,
      accessBefore: 0,
      accessAfter: 0,
      time: '08:00–09:00',
      hubTime: '08:00–09:00',
      confirmed: false,
      basis: 'x',
      overnight: false,
      fare: {
        modeKey: rec.key,
        direct: rec.direct,
        transfer: rec.transfer,
        low: rec.oneWayLow,
        high: rec.oneWayHigh,
        status: rec.status,
        source: rec.source,
        asOf: rec.asOf,
        queryUrl: rec.queryUrl,
        queryLabel: rec.queryLabel,
      },
    };
    const led = buildFareLedger({ legs: [leg], travelers: 1, manual: {} });
    expect(led.lines).toHaveLength(1);
    expect(led.lines[0]?.status).toBe('unconfirmed');
    expect(led.lines[0]?.needsConfirm).toBe(true);
    expect(led.counts.unconfirmed).toBe(1);
  });
});
