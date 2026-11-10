// Link-R World — 旅行闭环与「真实可游玩时间」引擎
//
// 解决的问题：过去只排了「去程 + 景点」，没有把返程、城际交通、接驳与候车
// 放进同一本时间账里，于是标着「3 天」的行程可能只剩一天可玩。
//
// 这一层把一次旅行拆成：
//   出发地 → 去程交通 → 抵达 → 每日游玩与住宿 → 返程交通 → 返回地 → 旅行结束
// 并给出三个必须分开说的概念：
//   1) 日历天数        首尾都算的自然日数量
//   2) 旅行总时长      去程实际出发 → 返程抵达结束地
//   3) 实际可游玩时间  总时长扣掉去/返/城际交通、接驳候车、用餐休整与缓冲后，真正能玩的时间
//
// 口径（全部为确定性算术，不含随机、不含网络、不含真实班次）：
//   · 每天的可用时间窗默认 08:30–21:30；抵达日从「抵达 + 30 分钟休整」起算；
//     返程日到「返程实际出发 − 接驳候车 − 30 分钟回住处取行李」为止（倒推）。
//   · 用餐预留 午餐 60 分 / 晚餐 75 分：只有当时间窗真的覆盖饭点时才计入，
//     且只计「行程块里没有覆盖到」的部分 —— 不重复扣减。
//   · 块间缓冲 30 分/天；一个行程块按 120 分（含块间通勤）折算生成容量。
//   · 交通时长按距离与方式估算，**不虚构航班号与具体发车时刻**，
//     所有交通段一律标记 confirmed = false（估算 / 待确认），界面必须如实标注。
//
// 依赖方向：journey.ts 只依赖数据层（cities / cityRates / geo）与 transport.ts，
// 不反向依赖 tripData.ts，避免循环引用。

import { CITY_BY_ID, getCity, type CityId } from '../data/cities';
import { CITY_RATES } from '../data/cityRates';
import { findOrigin, normalizeCityName, type OriginCity } from '../data/geo';
import {
  planIntercity,
  type DirectFlightRule,
  type IntercityPlan,
  type TransportOption,
} from './transport';
import type {
  DayBudget,
  FeasibilityIssue,
  ItineraryItem,
  JourneyInput,
  JourneyRole,
  Span,
  TripFeasibility,
  TripLeg,
  TripLifecycle,
} from './types';

/** 精选路线支持的天数上限（与 tripData.MAX_TRIP_DAYS 同源，这里定义避免循环依赖） */
export const MAX_PLAN_DAYS = 5;

/** 一天的起点 / 收尾（分钟）。收尾到 22:30，留出夜宵与小酒馆的时段 */
export const DAY_START_MIN = 8 * 60 + 30;
export const DAY_END_MIN = 22 * 60 + 30;
/** 抵达后休整 */
export const REST_AFTER_ARRIVAL_MIN = 30;
/** 返程前回住处取行李 / 整队 */
export const PACK_BEFORE_LEAVE_MIN = 30;
/** 用餐预留 */
export const MEAL_LUNCH_MIN = 60;
export const MEAL_DINNER_MIN = 75;
/** 块间缓冲（每天） */
export const BUFFER_PER_DAY_MIN = 30;
/** 一个行程块 ≈ 2 小时（含块间通勤与缓冲） */
export const SLOT_MINUTES = 120;
/** 全程可玩低于 6 小时 → 判定「时间不足」 */
export const MIN_PLAY_MINUTES = 6 * 60;
/** 一个完整游玩日的舒适可玩量（用于反推建议天数） */
export const COMFORT_DAY_PLAY_MIN = 5 * 60;

export type TimePref = JourneyInput['departPref'];

/** 去程枢纽出发时刻：上午 09:00 / 下午 13:30 / 傍晚 18:30（auto 取上午） */
const DEPART_AT: Record<TimePref, number> = {
  auto: 9 * 60,
  morning: 9 * 60,
  afternoon: 13 * 60 + 30,
  evening: 18 * 60 + 30,
};

/** 返程枢纽出发时刻：auto 默认 15:30（上午与午后都还能玩） */
const RETURN_AT: Record<TimePref, number> = {
  auto: 15 * 60 + 30,
  morning: 10 * 60,
  afternoon: 15 * 60 + 30,
  evening: 19 * 60,
};

/* ── 小工具（不依赖 tripData，避免循环引用） ─────────────── */

function toDate(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00`);
}

function addDaysISO(dateISO: string, n: number): string {
  const d = toDate(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = toDate(a);
  const db = toDate(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** 分钟 → 'HH:MM'（跨日加 (+1)） */
export function formatClock(min: number): string {
  if (!Number.isFinite(min)) return '—';
  const over = min >= 24 * 60;
  const v = ((Math.round(min) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${over ? '（+1）' : ''}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 行程块时段 → 分钟区间（与 tripData.spanOf 同口径） */
function spanOfTime(time: string): Span | null {
  if (typeof time !== 'string') return null;
  const toks = Array.from(time.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g)).map(
    (m) => Number(m[1]) * 60 + Number(m[2])
  );
  if (toks.length === 0) return null;
  const lo = toks[0];
  const hi = toks.length > 1 ? toks[toks.length - 1] : lo + 90;
  return { lo, hi: Math.max(hi, lo + 30) };
}

function spanMinutes(spans: Span[]): number {
  return spans.reduce((s, x) => s + Math.max(0, x.hi - x.lo), 0);
}

/** 该时间窗是否覆盖某个饭点（覆盖才计用餐预留） */
function mealAllowance(spans: Span[]): number {
  let m = 0;
  for (const s of spans) {
    if (s.lo <= 13 * 60 + 30 && s.hi >= 12 * 60 + 30) m += MEAL_LUNCH_MIN;
    if (s.lo <= 20 * 60 && s.hi >= 18 * 60) m += MEAL_DINNER_MIN;
  }
  return m;
}

/* ── 城市与天数分配 ──────────────────────────────────────── */

/**
 * 把总天数分给各城市：每城至少 1 天，余数先分给靠前的城市。
 * 例：5 天 3 城 → [2, 2, 1]（第一个城市通常是进出门户，多留一天缓冲）。
 */
export function allocateDays(totalDays: number, cityCount: number): number[] {
  const n = Math.max(1, Math.round(cityCount));
  const d = Math.max(n, Math.round(totalDays));
  const base = Math.floor(d / n);
  const rest = d - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** 城市坐标与通达性（先用出发地库，再用目的地城市库兜底） */
function cityNode(cityId: string): (OriginCity & { transferNote?: string }) | null {
  const city = getCity(cityId as CityId);
  if (!city) return null;
  const rates = CITY_RATES[city.id];
  return {
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    hasAirport: rates?.hasAirport ?? true,
    hasDirectRail: rates?.hasDirectRail ?? true,
    transferNote: rates?.transferNote,
  };
}

function resolveNode(name: string): (OriginCity & { transferNote?: string }) | null {
  const hit = findOrigin(name);
  if (hit) return hit;
  const byName = Object.values(CITY_BY_ID).find((c) => c.name === name);
  return byName ? cityNode(byName.id) : null;
}

/* ── 交通段 ─────────────────────────────────────────────── */

interface LegBuild {
  kind: TripLeg['kind'];
  /** 行程天数（≤5 天启用直飞优先规则） */
  days: number;
  /** 口径生成时间 */
  now: string;
  id: string;
  dayIndex: number;
  dateISO: string;
  from: string;
  to: string;
  /** 目的地节点（含中转说明） */
  node: OriginCity & { transferNote?: string };
  /** 期望的枢纽出发时刻 */
  targetMin: number;
  /** 已知在途分钟（同城 / 无交通时为 0） */
  fixedMinutes?: number;
}

function legFareOf(option: TransportOption | null, fixedMinutes: number | null): TripLeg['fare'] {
  if (!option) {
    return fixedMinutes === 0
      ? {
          modeKey: 'none',
          direct: true,
          transfer: '',
          low: 0,
          high: 0,
          status: 'estimate',
          source: '同城 / 相邻，本段不计大交通',
          asOf: '',
          queryUrl: '',
          queryLabel: '',
        }
      : null;
  }
  return {
    modeKey: option.key,
    direct: option.direct,
    transfer: option.transfer,
    low: option.oneWayLow,
    high: option.oneWayHigh,
    status: option.status,
    source: option.source,
    asOf: option.asOf,
    queryUrl: option.queryUrl,
    queryLabel: option.queryLabel,
  };
}

function makeLeg(spec: LegBuild): {
  leg: TripLeg;
  option: TransportOption | null;
  known: boolean;
  plan: IntercityPlan | null;
} {
  // 出发地可能是「目的地城市之一」（例如从腾冲出发去腾冲）：先把坐标解出来再算距离，
  // 否则 planIntercity 只查出发地库会认不出，把同城当成 1,100km 中程旅行。
  const fromNode = spec.fixedMinutes === 0 ? null : resolveNode(spec.from);
  const plan = planIntercity(spec.from, spec.node, spec.dateISO, fromNode, {
    days: spec.days,
    now: spec.now,
  });
  const option =
    plan.options.find((o) => o.key === plan.recommendedKey) ?? plan.options[0] ?? null;

  // 同城 / 相邻（<40km）：无大交通
  const sameCity =
    normalizeCityName(spec.from) === normalizeCityName(spec.to) &&
    normalizeCityName(spec.from).length > 0;
  const noTransport =
    (spec.fixedMinutes ?? null) !== null && (spec.fixedMinutes ?? 0) === 0;
  if (noTransport || sameCity || plan.options.length === 0) {
    const minutes = spec.fixedMinutes ?? 0;
    return {
      known: plan.recognized,
      option: null,
      plan,
      leg: {
        id: spec.id,
        kind: spec.kind,
        dayIndex: spec.dayIndex,
        dateISO: spec.dateISO,
        from: spec.from,
        to: spec.to,
        mode: minutes === 0 ? '同城接驳' : '在途',
        startMin: spec.targetMin,
        endMin: spec.targetMin + minutes,
        hubStartMin: spec.targetMin,
        hubEndMin: spec.targetMin + minutes,
        minutes,
        accessBefore: 0,
        accessAfter: 0,
        time: `${formatClock(spec.targetMin)}–${formatClock(spec.targetMin + minutes)}`,
        hubTime: `${formatClock(spec.targetMin)}–${formatClock(spec.targetMin + minutes)}`,
        confirmed: false,
        basis: `${spec.from}与${spec.to}同城或相邻，本段不计大交通`,
        overnight: false,
        fare: legFareOf(null, spec.fixedMinutes ?? null),
      },
    };
  }

  const accessBefore = option?.accessBefore ?? 0;
  const accessAfter = option?.accessAfter ?? 0;
  const range = option?.oneWayMinutes ?? [0, 0];
  const minutes = Math.round((range[0] + range[1]) / 2);
  const hubStartMin = spec.targetMin;
  const startMin = hubStartMin - accessBefore;
  const arriveHub = hubStartMin + minutes;
  const endMin = arriveHub + accessAfter;

  const basis = `${option?.label ?? '在途'} · 在途约 ${Math.floor(minutes / 60)} 小时 ${
    minutes % 60
  } 分（按 ${plan.km} km 与当季票价估算，非实时班次）· 含出发地到枢纽 ${Math.max(
    0,
    accessBefore
  )} 分（含候车安检）与落地接驳 ${accessAfter} 分`;

  return {
    known: plan.recognized,
    option,
    plan,
    leg: {
      id: spec.id,
      kind: spec.kind,
      dayIndex: spec.dayIndex,
      dateISO: spec.dateISO,
      from: spec.from,
      to: spec.to,
      mode: option?.label ?? '在途',
      startMin,
      endMin,
      hubStartMin,
      hubEndMin: arriveHub,
      minutes,
      accessBefore,
      accessAfter,
      time: `${formatClock(startMin)}–${formatClock(endMin)}`,
      hubTime: `${formatClock(hubStartMin)}–${formatClock(arriveHub)}`,
      confirmed: false,
      basis: plan.recognized ? basis : `出发地未识别，按中程 1,100km 估算 · ${basis}`,
      overnight: endMin >= 24 * 60,
      fare: legFareOf(option, null),
    },
  };
}

/* ── 逐日骨架（日期 / 城市 / 角色） ───────────────────────── */

export interface DaySlot {
  dayIndex: number;
  dateISO: string;
  cityId: string;
  city: string;
  role: JourneyRole;
}

export interface LegPlan {
  legs: TripLeg[];
  days: DaySlot[];
  mode: 'round-trip' | 'open-jaw';
  oneWay: boolean;
  origin: string;
  returnTo: string;
  route: string[];
  departDate: string;
  returnDate: string;
  outboundDepartMin: number;
  outboundArriveMin: number;
  returnDepartMin: number;
  returnArriveMin: number;
  totalMinutes: number;
  travelMinutes: number;
  intercityMinutes: number;
  pending: string[];
  note: string;
  /** 出发地是否被识别（未识别时全部按中程估算） */
  originRecognized: boolean;
  /** 未填出发地：无法计算往返交通 */
  originMissing: boolean;
  /** ≤5 天直飞优先规则的结论（取自去程方案；无去程时为 null） */
  directFlight: DirectFlightRule | null;
  /** 推荐理由（一句话） */
  recommendReason: string;
  /** 本趟是否有大交通 */
  hasTransport: boolean;
}

/**
 * 规划整条闭环：去程 → 各城 → 返程，并给出每一天的角色与所在城市。
 * 只依赖输入参数（不依赖已排景点），因此可用于「先算时间账、再排景点」。
 */
export function planJourneyLegs(input: JourneyInput): LegPlan {
  const route = (input.route.length > 0 ? input.route : ['shanghai']).slice();
  const alloc = allocateDays(input.days, route.length);
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : '';
  const departDate = startDate || '';
  const pending: string[] = [];

  const nodes = route.map((id) => ({ id, node: cityNode(id) }));
  const valid = nodes.filter((x) => x.node);
  const firstCity = valid[0];
  const lastCity = valid[valid.length - 1];

  const originResolved = resolveNode(input.origin);
  const originName = originResolved?.name ?? (input.origin || '').trim();
  const originRecognized = !!originResolved && !!input.origin.trim();

  if (!input.origin.trim()) pending.push('还没填出发地：填上之后才能算出往返交通与真实可游玩时间');
  else if (!originResolved) pending.push(`出发地「${input.origin}」未在库里，按中程约 1,100 km 估算`);
  if (!startDate) pending.push('出发日期未定：交通时刻按默认时段推算，确定后请复核');

  // 逐日骨架：按分配合计天数铺开
  const days: DaySlot[] = [];
  let cursor = 0;
  for (let c = 0; c < alloc.length; c++) {
    const rec = nodes[c];
    for (let k = 0; k < alloc[c]; k++) {
      days.push({
        dayIndex: cursor,
        dateISO: startDate ? addDaysISO(startDate, cursor) : '',
        cityId: rec?.id ?? 'shanghai',
        city: rec?.node?.name ?? '目的地',
        role: 'full',
      });
      cursor += 1;
    }
  }
  const D = days.length;
  if (D > 0) days[0].role = 'departure';
  // 城际转移日：每个后继城市的第 1 天
  let acc = 0;
  for (let c = 1; c < alloc.length; c++) {
    acc += alloc[c - 1];
    if (days[acc]) days[acc].role = 'transit';
  }
  if (input.returnMode === 'round-trip' && D > 0) days[D - 1].role = 'return';

  const legs: TripLeg[] = [];
  let outboundDepartMin = 0;
  let outboundArriveMin = 0;
  let returnDepartMin = 0;
  let returnArriveMin = 0;
  let travelMinutes = 0;
  let intercityMinutes = 0;
  let hasTransport = false;

  const push = (leg: TripLeg, bucket: 'travel' | 'intercity') => {
    legs.push(leg);
    if (bucket === 'travel') travelMinutes += leg.endMin - leg.startMin;
    else intercityMinutes += leg.endMin - leg.startMin;
    if (leg.minutes > 0) hasTransport = true;
  };

  // 去程（没填出发地时不硬算：宁可不给数字，也不编一段不存在的交通）
  let outboundPlan: IntercityPlan | null = null;
  if (firstCity?.node && originName) {
    const built = makeLeg({
      kind: 'outbound',
      days: input.days,
      now: input.now ?? '',
      id: 'leg-out',
      dayIndex: 0,
      dateISO: days[0]?.dateISO ?? departDate,
      from: originName,
      to: firstCity.node.name,
      node: firstCity.node,
      targetMin: DEPART_AT[input.departPref],
    });
    push(built.leg, 'travel');
    outboundPlan = built.plan;
    outboundDepartMin = built.leg.hubStartMin;
    outboundArriveMin = built.leg.hubEndMin;
  }

  // 城际
  for (let c = 1; c < alloc.length; c++) {
    const from = nodes[c - 1]?.node;
    const to = nodes[c]?.node;
    if (!from || !to) continue;
    const dayIndex = alloc.slice(0, c).reduce((s, n) => s + n, 0);
    const built = makeLeg({
      kind: 'intercity',
      days: input.days,
      now: input.now ?? '',
      id: `leg-ic-${c}`,
      dayIndex,
      dateISO: days[dayIndex]?.dateISO ?? departDate,
      from: from.name,
      to: to.name,
      node: to,
      targetMin: DEPART_AT[input.departPref],
    });
    push(built.leg, 'intercity');
  }

  // 返程
  const returnTo =
    input.returnMode === 'open-jaw' ? lastCity?.node?.name ?? '' : originName;
  if (input.returnMode === 'round-trip' && lastCity?.node && originName) {
    const backNode = (resolveNode(returnTo) ??
      originResolved ??
      lastCity.node) as OriginCity & { transferNote?: string };
    const built = makeLeg({
      kind: 'return',
      days: input.days,
      now: input.now ?? '',
      id: 'leg-back',
      dayIndex: Math.max(0, D - 1),
      dateISO: days[D - 1]?.dateISO ?? departDate,
      from: lastCity.node.name,
      to: returnTo,
      node: backNode,
      targetMin: RETURN_AT[input.returnPref],
    });
    push(built.leg, 'travel');
    returnDepartMin = built.leg.hubStartMin;
    returnArriveMin = built.leg.hubEndMin;
  }

  const returnDate =
    input.returnMode === 'round-trip' ? days[D - 1]?.dateISO ?? departDate : days[D - 1]?.dateISO ?? departDate;

  // 旅行总时长
  let totalMinutes = 0;
  const outLeg = legs.find((l) => l.kind === 'outbound');
  const backLeg = legs.find((l) => l.kind === 'return');
  if (outLeg) {
    if (backLeg) {
      const span = daysBetween(outLeg.dateISO, backLeg.dateISO) * 24 * 60;
      totalMinutes = span + backLeg.endMin - outLeg.startMin;
    } else {
      // 开放式：结束于最后一座城市，算到最后一日的收尾
      const last = days[D - 1];
      const span = last ? daysBetween(outLeg.dateISO, last.dateISO) * 24 * 60 : 0;
      totalMinutes = span + DAY_END_MIN - outLeg.startMin;
    }
  }

  if (input.returnMode === 'open-jaw') {
    pending.push(
      `开放式路线：结束于${returnTo || '终点城市'}，不强制返回${originName || '出发地'}，因此不含返程段`
    );
  }

  return {
    legs,
    days,
    mode: input.returnMode,
    oneWay: input.oneWay,
    origin: originName || '出发地',
    returnTo,
    route: valid.map((x) => x.node!.name),
    departDate,
    returnDate,
    outboundDepartMin,
    outboundArriveMin,
    returnDepartMin,
    returnArriveMin,
    totalMinutes,
    travelMinutes,
    intercityMinutes,
    pending,
    note: '',
    originRecognized,
    originMissing: !input.origin.trim(),
    hasTransport,
    directFlight: outboundPlan?.directFlight ?? null,
    recommendReason: outboundPlan?.recommendReason ?? '',
  };
}

/* ── 逐日时间预算 ───────────────────────────────────────── */

/**
 * 当天可安排活动的时间窗：
 *  下界 = 抵达落脚点 + 30 分钟休整（去程日 / 转移日）
 *  上界 = 返程实际出发 − 接驳候车 − 30 分钟回住处取行李（返程日，倒推）
 * 一天同时受去程与返程约束时取交集（例如一日往返）。
 */
function windowsForDay(
  slot: DaySlot,
  legs: TripLeg[],
  returnMode: 'round-trip' | 'open-jaw'
): { windows: Span[]; note: string } {
  const dep = legs.find(
    (l) => (l.kind === 'outbound' || l.kind === 'intercity') && l.dayIndex === slot.dayIndex
  );
  const back = legs.find((l) => l.kind === 'return' && l.dayIndex === slot.dayIndex);

  let lo = DAY_START_MIN;
  let hi = DAY_END_MIN;
  const bits: string[] = [];

  if (dep && (slot.role === 'departure' || slot.role === 'transit')) {
    lo = Math.max(lo, dep.endMin + REST_AFTER_ARRIVAL_MIN);
    bits.push(
      `${formatClock(dep.endMin)} 抵达${slot.city}并落脚（留 ${REST_AFTER_ARRIVAL_MIN} 分休整），此后才能安排需要到场的活动`
    );
  }
  if (back && returnMode === 'round-trip') {
    const leave = back.startMin - PACK_BEFORE_LEAVE_MIN;
    hi = Math.min(hi, leave);
    bits.push(
      `返程 ${formatClock(back.hubStartMin)} 从${back.from}出发：最晚 ${formatClock(
        leave
      )} 结束活动，留出回住处取行李与候车安检`
    );
  }

  if (lo >= hi) {
    return {
      windows: [],
      note:
        bits.length > 0
          ? `${bits.join('；')} —— 两者之间已没有可安排活动的余量`
          : '这一天没有可安排活动的余量',
    };
  }
  return {
    windows: [{ lo, hi }],
    note: bits.length > 0 ? bits.join('；') : '完整游玩日：08:30–22:30 全窗可用（用餐与块间缓冲已单独扣除）',
  };
}

/**
 * 逐日约束（不依赖已排景点）——生成器决定「当天放几块」与时间账本用的是同一份口径，
 * 避免一边按 08:30–22:30 全天排、另一边按抵达时刻算的两套算法。
 */
export function dayConstraints(plan: LegPlan): DayBudget[] {
  return plan.days.map((slot) => {
    const { windows, note } = windowsForDay(slot, plan.legs, plan.mode);
    const windowMinutes = spanMinutes(windows);
    const dayLegs = plan.legs.filter((l) => l.dayIndex === slot.dayIndex);
    const travelMinutes = dayLegs.reduce((s, l) => s + l.minutes, 0);
    const accessMinutes = dayLegs.reduce((s, l) => s + l.accessBefore + l.accessAfter, 0);
    const meal = windows.length > 0 ? mealAllowance(windows) : 0;
    const buffer = windows.length > 0 ? BUFFER_PER_DAY_MIN : 0;
    const rest = slot.role === 'departure' || slot.role === 'transit' ? REST_AFTER_ARRIVAL_MIN : 0;
    const play = Math.max(0, windowMinutes - meal - buffer);

    return {
      dayIndex: slot.dayIndex,
      dateISO: slot.dateISO,
      city: slot.city,
      role: slot.role,
      windows,
      windowMinutes,
      travelMinutes,
      accessMinutes,
      mealMinutes: meal,
      restMinutes: rest,
      bufferMinutes: buffer,
      playMinutes: play,
      plannedMinutes: 0,
      capacity: clamp(Math.floor(play / SLOT_MINUTES), 0, 5),
      note,
    };
  });
}

/* ── 可行性校验 ─────────────────────────────────────────── */

function activityIssues(day: DayBudget, items: ItineraryItem[]): FeasibilityIssue[] {
  const out: FeasibilityIssue[] = [];
  if (items.length === 0) return out;
  const windows = day.windows;
  for (const it of items) {
    const sp = spanOfTime(it.time);
    if (!sp) continue;
    if (windows.length === 0) {
      out.push({
        code: day.role === 'return' ? 'activity-after-return' : 'activity-before-arrival',
        severity: 'block',
        dayIndex: day.dayIndex,
        message: `第 ${day.dayIndex + 1} 天没有可安排活动的时间窗，但排了「${it.time}」这一块`,
      });
      continue;
    }
    const inside = windows.some((w) => sp.lo >= w.lo && sp.hi <= w.hi);
    if (inside) continue;
    const lo = windows[0].lo;
    const hi = windows[windows.length - 1].hi;
    if (sp.lo < lo) {
      out.push({
        code: day.role === 'return' ? 'activity-outside-window' : 'activity-before-arrival',
        severity: 'block',
        dayIndex: day.dayIndex,
        message: `第 ${day.dayIndex + 1} 天 ${it.time} 的活动早于当天可用时间窗（${formatClock(
          lo
        )} 起），交通还没完成`,
      });
    } else if (sp.hi > hi) {
      out.push({
        code: day.role === 'return' ? 'activity-after-return' : 'activity-outside-window',
        severity: 'block',
        dayIndex: day.dayIndex,
        message: `第 ${day.dayIndex + 1} 天 ${it.time} 的活动晚于时间窗结束（${formatClock(
          hi
        )}），会与返程冲突`,
      });
    } else {
      out.push({
        code: 'activity-outside-window',
        severity: 'warn',
        dayIndex: day.dayIndex,
        message: `第 ${day.dayIndex + 1} 天 ${it.time} 的活动不在可用时间窗内`,
      });
    }
  }
  return out;
}

/** 逐日窗口 + 已排活动 → 可行性结论与建议（纯函数） */
export function assessLifecycle(
  plan: LegPlan,
  days: DayBudget[],
  items: ItineraryItem[],
  opts: { perDay: number } = { perDay: 3 }
): TripFeasibility {
  const issues: FeasibilityIssue[] = [];

  if (plan.originMissing) {
    issues.push({
      code: 'origin-missing',
      severity: 'warn',
      dayIndex: null,
      message: '未填出发地：往返交通与「真实可游玩时间」暂时算不出来，填上出发地即可精确计算',
    });
  }

  for (const d of days) {
    const dayItems = items.filter((i) => i.dayIndex === d.dayIndex);
    issues.push(...activityIssues(d, dayItems));
    if (d.windowMinutes <= 0) {
      // 交通吃掉了整天：必须说出来，否则用户以为「3 天」里最后一天还能玩
      issues.push({
        code: 'day-no-play-time',
        severity: 'warn',
        dayIndex: d.dayIndex,
        message: `第 ${d.dayIndex + 1} 天已被交通占满，没有可安排活动的时间窗${
          d.note ? `（${d.note}）` : ''
        }`,
      });
      continue;
    }
    if ((d.role === 'departure' || d.role === 'transit') && d.windowMinutes < 120) {
      issues.push({
        code: 'arrival-too-late',
        severity: 'warn',
        dayIndex: d.dayIndex,
        message: `第 ${d.dayIndex + 1} 天抵达过晚，只剩 ${Math.round(
          d.windowMinutes / 60
        )} 小时窗口（可玩 ${Math.round(d.playMinutes / 60)} 小时 ），当天排不下重点`,
      });
    }
    if (d.role === 'return' && d.windowMinutes < 180) {
      issues.push({
        code: 'return-too-early',
        severity: 'warn',
        dayIndex: d.dayIndex,
        message: `第 ${d.dayIndex + 1} 天返程偏早，可玩仅 ${Math.round(
          d.playMinutes / 60
        )} 小时；返程越早，末日能玩的时间越短`,
      });
    }
  }

  const playMinutes = days.reduce((s, d) => s + d.playMinutes, 0);
  if (playMinutes < MIN_PLAY_MINUTES) {
    issues.push({
      code: 'not-enough-play-time',
      severity: 'block',
      dayIndex: null,
      message: `全程实际可游玩约 ${Math.round(playMinutes / 60)} 小时，低于一次可用旅行的下限（6 小时）`,
    });
  }
  if (plan.travelMinutes > 0 && plan.travelMinutes >= playMinutes) {
    issues.push({
      code: 'travel-too-long',
      severity: 'warn',
      dayIndex: null,
      message: `往返交通 ${Math.round(plan.travelMinutes / 60)} 小时，已不少于实际可游玩时间 ${Math.round(
        playMinutes / 60
      )} 小时，属于「大部分时间在路上」`,
    });
  }

  const blocked = issues.some((i) => i.severity === 'block');
  const warned = issues.length > 0;

  // 建议：按「已排活动量 vs 可玩时间」反推天数（差额不足一整块时不建议加天数，避免无意义加日）
  const demand = opts.perDay * days.length * SLOT_MINUTES;
  const shortfall = Math.max(0, demand - playMinutes);
  const extra = shortfall >= SLOT_MINUTES ? Math.ceil(shortfall / COMFORT_DAY_PLAY_MIN) : 0;
  const suggestedDays =
    extra > 0 ? clamp(days.length + extra, days.length, Math.max(days.length, MAX_PLAN_DAYS)) : null;

  const deadDays = days.filter((d) => d.windowMinutes <= 0);
  const deadReturn = deadDays.some((d) => d.role === 'return');
  const deadArrival = deadDays.some((d) => d.role === 'departure' || d.role === 'transit');

  const suggestions: string[] = [];
  if (blocked) {
    suggestions.push('先删掉低优先级景点，保留你最想去的两三处，行程才落得下地');
    suggestions.push('把不适合抵达日 / 返程日的活动挪到中间完整日');
  }
  if (deadReturn) {
    suggestions.push('返程日已被交通占满：把返程改到 15:00 之后，或在前一晚就近住到枢纽附近');
  }
  if (deadArrival) {
    suggestions.push('抵达日已被交通占满：去程改早一班，或前一晚出发，抵达当天才不浪费');
  }
  if (suggestedDays && suggestedDays > days.length) {
    suggestions.push(
      `这条线路按每天 ${Math.round(
        COMFORT_DAY_PLAY_MIN / 60
      )} 小时可玩估算，建议延长到 ${suggestedDays} 天再出发`
    );
  }
  if (issues.some((i) => i.code === 'return-too-early')) {
    suggestions.push('返程改到 15:00 之后（或加一晚），末日就还能玩半天');
  }
  if (issues.some((i) => i.code === 'arrival-too-late')) {
    suggestions.push('去程改早一班（或前一晚出发），抵达日才不浪费');
  }
  if (issues.some((i) => i.code === 'travel-too-long')) {
    suggestions.push('远距离优先飞机：在途时间换回来的正好是可玩时间');
  }
  if (warned && suggestions.length === 0) {
    suggestions.push('行程时间账基本成立，出发前只需确认班次时刻');
  }

  return {
    status: blocked ? 'infeasible' : warned ? 'tight' : 'ok',
    issues,
    suggestions,
    suggestedDays,
  };
}

/* ── 组装完整时间账本 ───────────────────────────────────── */

/**
 * 旅行闭环时间账本：同一份数据供概况、逐日行程、地图与海报使用。
 * items 传入后即可算出「已排活动是否落在可用时间窗内」。
 */
export function buildLifecycle(input: JourneyInput, items: ItineraryItem[] = []): TripLifecycle {
  const plan = planJourneyLegs(input);
  const days = dayConstraints(plan).map((d) => {
    const planned = items
      .filter((i) => i.dayIndex === d.dayIndex)
      .reduce((s, i) => s + ((spanOfTime(i.time)?.hi ?? 0) - (spanOfTime(i.time)?.lo ?? 0)), 0);
    return { ...d, plannedMinutes: Math.max(0, planned) };
  });
  const playMinutes = days.reduce((s, d) => s + d.playMinutes, 0);
  const feasibility = assessLifecycle(plan, days, items);

  const pending = plan.pending.slice();
  if (plan.hasTransport) {
    pending.push('往返与城际交通均为按距离与当季票价的估算区间，未预订；出发前请在 12306 / 航司确认班次');
  }

  const noOrigin = !input.origin.trim();
  const note = noOrigin
    ? '未填出发地：往返交通与真实可游玩时间暂按「无大交通」估算，填上出发地后可精确计算'
    : plan.mode === 'open-jaw'
      ? `开放式路线：${plan.origin} 出发 · 结束于 ${plan.returnTo || '终点城市'}（不含返程）`
      : plan.hasTransport
        ? `闭环：${plan.origin} 出发 · ${plan.returnTo} 结束，去程与返程都已排定`
        : `${plan.origin} 与目的地同城或相邻，本次不计大交通`;

  return {
    mode: plan.mode,
    oneWay: plan.oneWay,
    origin: plan.origin,
    directFlight: plan.directFlight,
    recommendReason: plan.recommendReason,
    returnTo: plan.returnTo,
    route: plan.route,
    departDate: plan.departDate,
    returnDate: plan.returnDate,
    outboundDepartMin: plan.outboundDepartMin,
    outboundArriveMin: plan.outboundArriveMin,
    returnDepartMin: plan.returnDepartMin,
    returnArriveMin: plan.returnArriveMin,
    calendarDays: days.length,
    totalMinutes: plan.totalMinutes,
    travelMinutes: plan.travelMinutes,
    intercityMinutes: plan.intercityMinutes,
    playMinutes,
    playMinutesByDay: days.map((d) => d.playMinutes),
    legs: plan.legs,
    days,
    feasibility,
    pending,
    note,
  };
}

/** '3 天' / '16 小时 20 分' 这类口语时长（用于"实际能玩多久"的结论句） */
export function humanDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 小时';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} 分钟`;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

/** 把可玩分钟数折算成「约 N 个完整游玩日」（每天按 10 小时可玩计） */
export function playDaysEquivalent(playMinutes: number): string {
  const d = playMinutes / (10 * 60);
  return d < 1 ? `${(d * 10).toFixed(1)} 个白天` : `约 ${d.toFixed(1)} 个完整游玩日`;
}
