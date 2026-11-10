// Link-R World — 大交通票价账本（预算的「去程 + 返程」两行从这里来）
//
// 用户规格里最硬的一条：预算必须基于真实票价，严禁 AI 杜撰。
// 这里有三个事实要同时成立，缺一个就是撒谎：
//   1) 本平台没有接入 12306 / 航旅纵横的实时票价接口（两家都未开放公开授权的查询接口，
//      绕过验证码或访问限制不合规）——所以引擎给的一律是「估算」，并且必须标注成估算；
//   2) 每一行票价都带着「从哪来（source）+ 什么时候（queriedAt）+ 去哪核对（官方入口）」，
//      缺失的数字显示「暂未获取实时票价」，绝不拿一个像样的数填上去；
//   3) 用户手工录入真实票价后，那一行才升级为「已查实时」，并保留来源与查询时间。
//
// 只重算受影响的行：行 id 由 「方向|出发地|目的地|日期|方式」 组成 ——
// 用户改日期 / 目的地 / 方式 / 人数时，只有 id 变了的行需要重新确认；
// 没变的行连同已录入的实价一起保留（这就是「不要动不动全量重排」在数据层的落地）。

import type { TripLeg } from './types';

export type FareStatus = 'live' | 'estimate' | 'unconfirmed';

export const FARE_STATUS_LABEL: Record<FareStatus, string> = {
  live: '已查实时',
  estimate: '估算',
  unconfirmed: '待确认',
};

/** 用户手工录入的实时票价（含来源与查询时间） */
export interface ManualFare {
  /** 单人单程（元） */
  perPerson: number;
  /** 车次 / 航班号（选填） */
  service?: string;
  /** 席别 / 舱位（选填） */
  cabin?: string;
  /** 来源，如「12306 App」「航旅纵横」 */
  source: string;
  /** 查询时间（用户填写或自动取当天） */
  queriedAt: string;
}

export interface FareLine {
  /** 稳定 key：kind|from|to|date|modeKey */
  id: string;
  kind: 'outbound' | 'return';
  from: string;
  to: string;
  /** 出行日期（yyyy-mm-dd；未定日期为空串） */
  date: string;
  /** 交通方式展示名 */
  modeLabel: string;
  /** 车次 / 航班号（录入实价后才有） */
  service: string | null;
  /** 席别 / 舱位（录入实价后才有） */
  cabin: string | null;
  /** 单人单程（元） */
  perPersonLow: number;
  perPersonHigh: number;
  travelers: number;
  status: FareStatus;
  /** 数据来源（估算口径 / 用户给的来源） */
  source: string;
  /** 估算生成时间 / 实价查询时间 */
  queriedAt: string;
  /** 官方查询入口 */
  queryUrl: string;
  queryLabel: string;
  direct: boolean;
  transfer: string;
  /** 这一行是否需要用户确认（无直飞且只剩中转、或日期/班次未定） */
  needsConfirm: boolean;
  note: string;
}

export interface FareLedger {
  lines: FareLine[];
  /** 人均往返（去程 + 返程） */
  perPerson: { low: number; high: number };
  /** 同行合计（人均 × 人数） */
  party: { low: number; high: number };
  counts: { live: number; estimate: number; unconfirmed: number };
  /** 是否已经有任一行是实价 */
  hasLive: boolean;
  /** 给界面的提示（缺失 / 待确认 / 录入的实价因行程变更失效） */
  notices: string[];
  /** 已失效的手工录入 key（行程变更后不再匹配任何一行） */
  staleManualKeys: string[];
}

function lineId(kind: string, from: string, to: string, date: string, modeKey: string): string {
  return [kind, from, to, date, modeKey].join('|');
}

function today(): string {
  const d = new Date();
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function buildFareLedger(args: {
  legs: TripLeg[];
  travelers: number;
  manual: Record<string, ManualFare>;
}): FareLedger {
  const { legs, manual } = args;
  const travelers = Math.max(1, Math.floor(args.travelers || 1));

  const transportLegs = legs.filter(
    (l) => (l.kind === 'outbound' || l.kind === 'return') && l.fare && l.fare.modeKey !== 'none'
  );

  const lines: FareLine[] = transportLegs.map((leg) => {
    const fare = leg.fare as NonNullable<TripLeg['fare']>;
    const id = lineId(leg.kind, leg.from, leg.to, leg.dateISO, fare.modeKey);
    const m = manual[id];
    if (m && Number.isFinite(m.perPerson) && m.perPerson > 0) {
      return {
        id,
        kind: leg.kind as 'outbound' | 'return',
        from: leg.from,
        to: leg.to,
        date: leg.dateISO,
        modeLabel: m.service ? `${leg.mode} · ${m.service}` : leg.mode,
        service: m.service ?? null,
        cabin: m.cabin ?? null,
        perPersonLow: round(m.perPerson),
        perPersonHigh: round(m.perPerson),
        travelers,
        status: 'live',
        source: m.source || '用户录入',
        queriedAt: m.queriedAt || today(),
        queryUrl: fare.queryUrl,
        queryLabel: fare.queryLabel,
        direct: fare.direct,
        transfer: fare.transfer,
        needsConfirm: false,
        note: '你录入的实价：已按这一行计预算，来源与查询时间保留在右侧。',
      };
    }
    const unconfirmed = fare.status === 'unconfirmed';
    return {
      id,
      kind: leg.kind as 'outbound' | 'return',
      from: leg.from,
      to: leg.to,
      date: leg.dateISO,
      modeLabel: leg.mode,
      service: null,
      cabin: null,
      perPersonLow: round(fare.low),
      perPersonHigh: round(fare.high),
      travelers,
      status: unconfirmed ? 'unconfirmed' : 'estimate',
      source: fare.source,
      queriedAt: fare.asOf,
      queryUrl: fare.queryUrl,
      queryLabel: fare.queryLabel,
      direct: fare.direct,
      transfer: fare.transfer,
      needsConfirm: unconfirmed,
      note: unconfirmed
        ? `${fare.transfer || '班次未定'}：这一行还没有可用的方案，先确认怎么走，再来核对价格。`
        : '引擎估算区间，未获取实时票价 —— 请以官方入口查询结果为准，或直接录入实价。',
    };
  });

  const perPersonLow = lines.reduce((s, l) => s + l.perPersonLow, 0);
  const perPersonHigh = lines.reduce((s, l) => s + l.perPersonHigh, 0);
  const counts = {
    live: lines.filter((l) => l.status === 'live').length,
    estimate: lines.filter((l) => l.status === 'estimate').length,
    unconfirmed: lines.filter((l) => l.status === 'unconfirmed').length,
  };

  // 录过但已对不上当前行程的实价：提示用户重新确认，而不是悄悄丢弃
  const liveIds = new Set(lines.map((l) => l.id));
  const staleManualKeys = Object.keys(manual).filter((k) => !liveIds.has(k));

  const notices: string[] = [];
  if (lines.length === 0) {
    notices.push('还没有去程 / 返程交通可计价：填上出发地与日期后，这里会给出两行票价。');
  } else {
    if (counts.live === 0) {
      notices.push('暂未获取实时票价：下面是估算区间。点「去官网核对」查实价，或直接录入你查到的价格。');
    } else if (counts.live < lines.length) {
      notices.push(`已录入 ${counts.live} 行实价、其余 ${lines.length - counts.live} 行仍为估算。`);
    }
    if (counts.unconfirmed > 0) {
      notices.push('有班次待你确认（无直飞 / 方案未定），确认前这一行不计入可依赖的预算。');
    }
  }
  if (staleManualKeys.length > 0) {
    notices.push('行程变更后，之前录入的实价已不适用（日期或方式变了），请重新确认这几行。');
  }

  return {
    lines,
    perPerson: { low: round(perPersonLow), high: round(perPersonHigh) },
    party: { low: round(perPersonLow * travelers), high: round(perPersonHigh * travelers) },
    counts,
    hasLive: counts.live > 0,
    notices,
    staleManualKeys,
  };
}

/** 行 id（界面录入实价时用它定位要改哪一行） */
export function fareLineId(
  kind: 'outbound' | 'return',
  from: string,
  to: string,
  date: string,
  modeKey: string
): string {
  return lineId(kind, from, to, date, modeKey);
}
