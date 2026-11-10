// Link-R World — 大交通引擎：按距离与出行时间推荐交通方式，并给出价格区间
//
// 数据诚实性（对用户承诺，也是这个文件存在的意义）：
//   · 本平台没有接入 12306 / 航旅纵横的实时票价接口 —— 这两家都未开放公开授权的
//     票价查询接口，绕过其验证码或访问限制不合规，所以这里【不代查、不杜撰】，
//     只给出明确标注的「估算区间」，并把官方查询入口交给用户自己核对；
//   · 每个方案都带 status（estimate 估算 / unconfirmed 待确认）、口径来源、生成时间，
//     界面上必须原样显示，不允许把估算当成查到的实价；
//   · 用户手工录入真实票价后，那一行才升级为「已查实时」，并记录来源与查询时间。
//
// 直飞规则（用户规格）：行程 ≤5 天且目的地通航时，优先直飞、不主动推荐中转。
//   拿不到直飞就【明确告知并询问】，绝不偷偷放宽条件把中转当直飞排。
//   这条规则只针对航空 —— 铁路本来就以「直达高铁/动车」为先，不机械套用。
//
// 估算口径（全部写在界面上，实时价格以 12306 / 航司公示为准）：
// · 高铁二等座 ≈ 0.46 元/km（G 字头典型费率，区间 0.42–0.52）
// · 动车二等座 ≈ 0.31 元/km
// · 普速硬卧 ≈ 0.30 元/km
// · 机票 = 里程基准价（≈0.62 元/km + 90）× 当季常见折扣 + 机建燃油（70–130 元）
//   折扣按出行日期分档：平季 0.38–0.62 / 暑运 0.50–0.75 / 黄金周 0.85–1.00
// · 铁路里程 ≈ 大圆距离 × 1.25（线路绕行系数）；飞行里程 ≈ 大圆距离 × 1.1

import { findOrigin, normalizeCityName, type OriginCity } from '../data/geo';

export type TransportModeKey = 'rideshare' | 'hsr' | 'train' | 'flight';

export interface TransportOption {
  key: TransportModeKey;
  label: string;
  /** 一句话说明（含接驳/中转） */
  note: string;
  /** 单人单程区间（元） */
  oneWayLow: number;
  oneWayHigh: number;
  durationLabel: string;
  /** 单人单程纯在途时长区间（分钟，不含市区接驳与候车；由闭环引擎另加） */
  oneWayMinutes: [number, number];
  /** 出发地 → 枢纽 + 候车（分钟） */
  accessBefore: number;
  /** 枢纽 → 落脚点（分钟） */
  accessAfter: number;
  /** 引擎推荐 */
  recommended: boolean;
  /** 是否直达（不含中转） */
  direct: boolean;
  /** 中转说明（直达为空串） */
  transfer: string;
  /** 数据状态：estimate = 明确标注的估算；unconfirmed = 班次未定，需用户确认 */
  status: 'estimate' | 'unconfirmed';
  /** 价格口径来源（写在界面上） */
  source: string;
  /** 该口径的生成 / 查询时间（ISO 日期） */
  asOf: string;
  /** 官方查询入口（让用户自己去核对实时票价） */
  queryUrl: string;
  queryLabel: string;
}

export interface IntercityPlan {
  /** 出发地是否被识别；未识别按中程（约 1,100km）估算 */
  recognized: boolean;
  from: string;
  to: string;
  /** 大圆距离（km） */
  km: number;
  options: TransportOption[];
  recommendedKey: TransportModeKey;
  /** 单人往返区间（元，按推荐方式） */
  roundTripLow: number;
  roundTripHigh: number;
  /** 透明口径说明（写在界面上） */
  basis: string;
  /** 直飞规则结论（≤5 天优先直飞；拿不到就明确提示并询问） */
  directFlight: DirectFlightRule;
  /** 推荐理由（一句话，写在界面上，说明为什么推这个） */
  recommendReason: string;
}

/** 两点大圆距离（km） */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 出行日期 → 当季折扣档（黄金周 / 暑运 / 平季） */
export function seasonOf(dateISO: string): { key: 'peak' | 'summer' | 'normal'; label: string; disc: [number, number] } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO || '');
  const mm = m ? Number(m[2]) : 0;
  const dd = m ? Number(m[3]) : 0;
  if ((mm === 10 && dd <= 8) || (mm === 5 && dd <= 5) || (mm === 4 && dd >= 4 && dd <= 6)) {
    return { key: 'peak', label: '黄金周（机票紧俏）', disc: [0.85, 1.0] };
  }
  if (mm >= 7 && mm <= 8) return { key: 'summer', label: '暑运', disc: [0.5, 0.75] };
  return { key: 'normal', label: '平季', disc: [0.38, 0.62] };
}

/** 官方查询入口：本平台不代查票价，只把入口交给用户 */
export const OFFICIAL_QUERY = {
  rail: {
    label: '12306 中国铁路 · 余票与票价查询',
    url: 'https://kyfw.12306.cn/otn/leftTicket/init',
  },
  flight: {
    label: '航旅纵横 · 航班与票价查询',
    url: 'https://www.umetrip.com/',
  },
} as const;

/** 直飞优先的行程天数上限（超过这个天数才主动比较中转） */
export const DIRECT_FLIGHT_MAX_DAYS = 5;

/** 估算口径的生成时间（无法拿到构建时刻就退化为空串，由界面按需展示） */
function estimateAsOf(now?: string): string {
  if (now && /^\d{4}-\d{2}-\d{2}/.test(now)) return now.slice(0, 10);
  const d = new Date();
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

function flightOption(
  km: number,
  season: ReturnType<typeof seasonOf>,
  transferNote: string | undefined,
  asOf: string
): TransportOption {
  const flightKm = km * 1.1;
  const base = Math.max(280, flightKm * 0.62 + 90);
  const needTransfer = !!transferNote && transferNote.includes('飞机');
  const mult = needTransfer ? 1.2 : 1;
  const taxes: [number, number] = [70, 130];
  const low = round10(base * season.disc[0] * mult + taxes[0]);
  const high = round10(base * season.disc[1] * mult + taxes[1]);
  // 纯在途：巡航 + 起降滑行/绕飞（+ 中转停留）
  const cruise = (flightKm / 750) * 60 + 25;
  const inAir = needTransfer ? cruise + 150 : cruise;
  const hours = flightKm / 750 + 1.5 + (needTransfer ? 2.5 : 0);
  const durationLabel = needTransfer
    ? `约 ${Math.floor(hours)}–${Math.ceil(hours + 1.5)} 小时（中转）`
    : `约 ${Math.max(1, Math.round(hours - 0.4))}–${Math.round(hours + 0.5)} 小时（含往返机场与安检）`;
  return {
    key: 'flight',
    label: needTransfer ? '飞机（经昆明中转）' : '飞机',
    note: needTransfer
      ? '无直飞航班，常见经昆明中转；小机场航线折扣波动大'
      : '含机建燃油；提前 2–4 周买票更容易落在区间下沿',
    oneWayLow: low,
    oneWayHigh: high,
    durationLabel,
    oneWayMinutes: [Math.round(inAir * 0.92), Math.round(inAir * 1.12)],
    accessBefore: 45 + 90,
    accessAfter: 45,
    recommended: false,
    direct: !needTransfer,
    transfer: needTransfer ? (transferNote ?? '需中转') : '',
    status: 'estimate',
    source: `机票 = 里程基准价（${Math.round(base)} 元）× ${season.label}折扣 ${season.disc[0]}–${season.disc[1]} + 机建燃油 70–130 元（估算，非实时票价）`,
    asOf,
    queryUrl: OFFICIAL_QUERY.flight.url,
    queryLabel: OFFICIAL_QUERY.flight.label,
  };
}

function railOption(km: number, direct: boolean, asOf: string): TransportOption | null {
  const railKm = km * 1.25;
  if (direct) {
    const low = round10(railKm * 0.42);
    const high = round10(railKm * 0.52);
    const hours = railKm / 260 + 0.7;
    const inTrain = (railKm / 260) * 60;
    return {
      key: 'hsr',
      label: '高铁 / 动车',
      note: '二等座按 0.42–0.52 元/km 估算（12306 G/D 字头典型费率）',
      oneWayLow: low,
      oneWayHigh: high,
      durationLabel: `约 ${Math.max(0.5, Math.round(hours * 10) / 10)} 小时（准点率高，车站都在市区）`,
      oneWayMinutes: [Math.round(inTrain * 0.94), Math.round(inTrain * 1.1)],
      accessBefore: 25 + 45,
      accessAfter: 25,
      recommended: false,
      direct: true,
      transfer: '',
      status: 'estimate',
      source: `高铁二等座按 0.42–0.52 元/km 估算（${Math.round(railKm)} km 铁路里程，12306 G/D 字头典型费率），非实时票价`,
      asOf,
      queryUrl: OFFICIAL_QUERY.rail.url,
      queryLabel: OFFICIAL_QUERY.rail.label,
    };
  }
  // 无直达高铁：普速硬卧（部分线路）或中转动车，给宽区间
  if (km > 500) {
    const low = round10(railKm * 0.28);
    const high = round10(railKm * 0.5 + 60);
    const hours = railKm / 130 + 3;
    const inTrain = (railKm / 130) * 60;
    return {
      key: 'train',
      label: '火车（含中转）',
      note: '无高铁直达：普速硬卧或经枢纽中转动车，价格区间更宽',
      oneWayLow: low,
      oneWayHigh: high,
      durationLabel: `约 ${Math.round(hours)}–${Math.round(hours * 1.6)} 小时（含中转等候）`,
      oneWayMinutes: [Math.round(inTrain * 0.8), Math.round(inTrain * 1.06)],
      accessBefore: 30 + 60,
      accessAfter: 30,
      recommended: false,
      direct: false,
      transfer: '无高铁直达，需经枢纽中转（普速硬卧或中转动车）',
      status: 'estimate',
      source: `无直达高铁，按普速硬卧 / 中转动车的宽区间估算（${Math.round(railKm)} km 铁路里程），非实时票价`,
      asOf,
      queryUrl: OFFICIAL_QUERY.rail.url,
      queryLabel: OFFICIAL_QUERY.rail.label,
    };
  }
  return null;
}

function rideshareOption(km: number, asOf: string): TransportOption {
  const oneWay = km * 2.4 + 12;
  const driveMin = (km / 75) * 60;
  return {
    key: 'rideshare',
    label: '网约车 / 自驾',
    note: '按滴滴快车典型费率 ≈2.4 元/km + 起步；自驾另计油费过路费',
    oneWayLow: round10(oneWay * 0.85),
    oneWayHigh: round10(oneWay * 1.25),
    durationLabel: `约 ${Math.max(0.5, Math.round((km / 75) * 10) / 10)} 小时（高速直达）`,
    oneWayMinutes: [Math.round(driveMin * 0.95), Math.round(driveMin * 1.25)],
    accessBefore: 0,
    accessAfter: 0,
    recommended: false,
    direct: true,
    transfer: '',
    status: 'estimate',
    source: '网约车 / 自驾按 ≈2.4 元/km + 起步费估算（不含油费过路费的分摊口径）',
    asOf,
    queryUrl: '',
    queryLabel: '',
  };
}

/**
 * 直飞规则结论（用户规格：行程 ≤5 天时优先直飞，拿不到就明确告知并询问，
 * 绝不把中转折算成直飞、也不偷偷放宽条件）。
 */
export interface DirectFlightRule {
  /** ≤5 天的直飞优先规则是否适用于本次行程 */
  applicable: boolean;
  /** 是否存在直飞航班 */
  available: boolean;
  /** 一句话结论（写在界面上） */
  message: string;
  /** 需要用户拍板时的问句（null = 不需要） */
  question: string | null;
  /** 可选做法 */
  choices: string[];
}

export interface IntercityPlanOptions {
  /** 行程天数：用于「≤5 天优先直飞」规则 */
  days?: number;
  /** 口径生成时间（ISO），便于测试固定 */
  now?: string;
}

function directFlightRule(a: {
  days: number;
  hasAirport: boolean;
  fromName: string;
  toName: string;
  flight: TransportOption | undefined;
  railDirect: boolean;
  shortHaul: boolean;
}): DirectFlightRule {
  const none: DirectFlightRule = {
    applicable: false,
    available: false,
    message: '',
    question: null,
    choices: [],
  };
  if (a.shortHaul) {
    return {
      ...none,
      available: false,
      message: `${a.fromName} → ${a.toName} 为短途，航空不是候选方式，按门到门方式排。`,
    };
  }
  if (a.days <= 0) {
    return { ...none, message: '天数未定，暂不套用直飞规则。' };
  }
  const applicable = a.days <= DIRECT_FLIGHT_MAX_DAYS;
  if (!applicable) {
    return {
      applicable: false,
      available: !!a.flight?.direct,
      message: `${a.days} 天的行程时间宽裕，已把直飞与中转放在一起比较（总耗时 / 价格 / 衔接风险）。`,
      question: null,
      choices: [],
    };
  }
  if (!a.hasAirport) {
    return {
      applicable: true,
      available: false,
      message: `${a.toName} 暂无民航航班，本次按铁路排 —— 这是没有航空选项，不是放宽直飞条件。`,
      question: null,
      choices: [],
    };
  }
  if (a.flight && a.flight.direct) {
    return {
      applicable: true,
      available: true,
      message: `${a.days} 天行程，已优先直飞：${a.fromName} → ${a.toName} 直飞。`,
      question: null,
      choices: [],
    };
  }
  if (a.flight && !a.flight.direct) {
    return {
      applicable: true,
      available: false,
      message: `${a.fromName} → ${a.toName} 没有直飞航班（${a.flight.transfer}）。${a.days} 天的行程不建议把时间花在中转上。`,
      question: `${a.toName} 没有直飞航班，要按哪种方式排？`,
      choices: [
        '接受中转，按飞机排（在途多约 2.5 小时）',
        a.railDirect ? '改乘直达高铁 / 动车' : '改乘火车（含中转，需再确认）',
        '换一个目的地',
      ],
    };
  }
  return {
    ...none,
    message: `${a.days} 天的行程暂无可用的航空方案，已按铁路排。`,
  };
}

/**
 * 生成大交通方案：识别出发地 → 距离 → 候选方式 → 按「价格 + 时间 + 直达性」推荐。
 *
 * 顺序上这是行程生成的第一步：先把往返班次和时刻定下来，逐日可玩时间才有依据，
 * 之后才轮到排景点（见 journey.ts）。
 *
 * fromNode：已经解析好的出发地坐标（可选）。调用方若已从目的地城市库里认出出发地
 * （例如出发地本身就是目的地之一），必须传进来 —— 否则这里只查「出发地库」会认不出，
 * 于是把「同城出发」误当成 1,100 km 的中程旅行，凭空多出几小时在途时间。
 *
 * opts.days ≤ 5 时启用直飞优先：不主动推荐中转，拿不到直飞会给出 directFlight.question
 * 让界面去问用户（见 directFlightRule）。
 */
export function planIntercity(
  originInput: string,
  toCity: { name: string; lat: number; lng: number; hasAirport: boolean; hasDirectRail: boolean; transferNote?: string },
  startDateISO: string,
  fromNode?: { name: string; lat: number; lng: number; hasAirport: boolean; hasDirectRail: boolean } | null,
  opts: IntercityPlanOptions = {}
): IntercityPlan {
  const asOf = estimateAsOf(opts.now);
  const days = Math.max(0, Math.floor(opts.days ?? 0));
  const from = fromNode ?? findOrigin(originInput);
  const to: OriginCity = {
    name: normalizeCityName(toCity.name),
    lat: toCity.lat,
    lng: toCity.lng,
    hasAirport: toCity.hasAirport,
    hasDirectRail: toCity.hasDirectRail,
  };
  const season = seasonOf(startDateISO);
  const basis = `高铁 ≈0.42–0.52 元/km（12306 二等座口径）· 机票 = 里程基准价 × ${season.label}折扣 ${season.disc[0]}–${season.disc[1]} + 机建燃油 · 数据状态：普通估算（本平台未接入实时票价接口）· 实时价格以 12306 与航司公示为准`;

  // 未识别出发地：按中程（约 1,100km）估算
  if (!from) {
    const km = 1100;
    const flight = flightOption(km, season, undefined, asOf);
    const hsr: TransportOption = {
      key: 'hsr',
      label: '高铁 / 动车',
      note: '按中程距离估算；识别出发地后更准',
      oneWayLow: round10(km * 1.25 * 0.42),
      oneWayHigh: round10(km * 1.25 * 0.52),
      durationLabel: '约 4.5–6 小时',
      oneWayMinutes: [270, 335],
      accessBefore: 25 + 45,
      accessAfter: 25,
      recommended: false,
      direct: true,
      transfer: '',
      status: 'estimate',
      source: `未识别出发地，按中程 1,100km 估算（高铁 ${round10(km * 1.25 * 0.42)}–${round10(km * 1.25 * 0.52)} 元）`,
      asOf,
      queryUrl: OFFICIAL_QUERY.rail.url,
      queryLabel: OFFICIAL_QUERY.rail.label,
    };
    const opts2 = [flight, hsr];
    const rec = flight;
    rec.recommended = true;
    return {
      recognized: false,
      from: normalizeCityName(originInput) || '未识别出发地',
      to: to.name,
      km,
      options: opts2,
      recommendedKey: rec.key,
      roundTripLow: rec.oneWayLow * 2,
      roundTripHigh: rec.oneWayHigh * 2,
      directFlight: {
        applicable: false,
        available: true,
        message: '出发地未识别，直飞规则暂不适用；填上出发地后按真实航线判断。',
        question: null,
        choices: [],
      },
      recommendReason: '出发地未识别，按中程口径给一个「可比较的起点」，填上出发地会重算',
      basis: `未识别出发地「${originInput}」，按中程约 1,100km 估算 · ${basis}`,
    };
  }

  const km = Math.round(haversineKm(from.lat, from.lng, to.lat, to.lng));

  // 本地出发：无大交通
  if (km < 40) {
    return {
      recognized: true,
      from: from.name,
      to: to.name,
      km,
      options: [],
      recommendedKey: 'rideshare',
      roundTripLow: 0,
      roundTripHigh: 0,
      directFlight: {
        applicable: false,
        available: false,
        message: `${from.name} 与 ${to.name} 同城或相邻，没有大交通，也就不涉及直飞规则。`,
        question: null,
        choices: [],
      },
      recommendReason: '同城 / 相邻（<40km）：不计大交通',
      basis: `${from.name}与${to.name}同城或相邻，本次按无大交通估算 · ${basis}`,
    };
  }

  const options: TransportOption[] = [];
  const directRail = from.hasDirectRail && to.hasDirectRail;
  const shortHaul = km < 160;

  if (shortHaul) {
    const car = rideshareOption(km, asOf);
    car.recommended = true;
    const hsr = railOption(km, directRail, asOf);
    if (hsr) options.push(hsr);
    options.push(car);
    const rec = car;
    return {
      recognized: true,
      from: from.name,
      to: to.name,
      km,
      options,
      recommendedKey: rec.key,
      roundTripLow: rec.oneWayLow * 2,
      roundTripHigh: rec.oneWayHigh * 2,
      directFlight: directFlightRule({
        days,
        hasAirport: toCity.hasAirport,
        fromName: from.name,
        toName: to.name,
        flight: options.find((x) => x.key === 'flight'),
        railDirect: directRail,
        shortHaul: true,
      }),
      recommendReason: `${km}km 短途：门到门比等车换乘更快`,
      basis: `${km}km 短途 · ${basis}`,
    };
  }

  const flight = toCity.hasAirport ? flightOption(km, season, toCity.transferNote, asOf) : undefined;
  if (flight) options.push(flight);
  const rail = railOption(km, directRail, asOf);
  if (rail) options.push(rail);

  // 兜底：目的地无机场（不给 flight）+ 无直达铁路且距离 ≤500km（railOption 返回 null）
  // 会让 options 变成空数组。这里绝不能就这样返回 —— 上层 makeLeg 拿到 option=null 后
  // 会把交通段与票价一起静默丢掉，用户只看到预算里少了一行，查不出原因。
  // 给一个明确标注「待确认」的门到门方案，把不确定性写出来，而不是藏起来。
  if (options.length === 0) {
    const road = rideshareOption(km, asOf);
    options.push({
      ...road,
      label: '大巴 / 包车 / 自驾（需自行确认）',
      note: `${to.name} 无民航航班${directRail ? '' : '、也无直达铁路'}，本段没有可直接出票的公共交通方案：请按大巴、包车或自驾处理，出发前自行确认班次`,
      status: 'unconfirmed',
      source: `${to.name} 无可直接出票的公共交通方案，按 ≈2.4 元/km 公路口径给出参考区间（非票价，需自行确认）`,
      queryUrl: '',
      queryLabel: '',
    });
  }

  const rule = directFlightRule({
    days,
    hasAirport: toCity.hasAirport,
    fromName: from.name,
    toName: to.name,
    flight,
    railDirect: !!rail && rail.direct,
    shortHaul: false,
  });

  // 推荐：≤1,200km 优先高铁（市区到市区，准点）；更远优先飞机。
  // 但 ≤5 天行程拿不到直飞时，不把中转航班当推荐 —— 要么改直达铁路，要么把它标成「待确认」交给用户拍板。
  let rec: TransportOption | undefined;
  let recommendReason = '';
  if (km <= 1200) {
    rec = options.find((x) => x.key === 'hsr') ?? options.find((x) => x.key === 'train');
    if (rec) {
      recommendReason = `${km}km 中短途：高铁市区到市区、准点率高，优先于飞机`;
    } else if (flight) {
      recommendReason = `${km}km 中短途：无直达铁路方案，按飞机排（需注意中转与否）`;
    } else {
      rec = options[0];
      recommendReason = `${km}km 中短途：目的地无民航航班、也无直达铁路，只能按公路口径给参考区间`;
    }
  } else if (rule.applicable && flight && !flight.direct) {
    const hsrDirect = options.find((x) => x.key === 'hsr');
    if (hsrDirect) {
      rec = hsrDirect;
      recommendReason = `${days} 天行程且无直飞 → 改推直达高铁，不主动推荐中转航班`;
    } else {
      rec = flight;
      flight.status = 'unconfirmed';
      recommendReason = `${days} 天行程且无直飞 → 只剩中转航班可行，已标为「待确认」，请先确认是否接受中转`;
    }
  } else {
    rec = flight ?? options.find((x) => x.key === 'hsr') ?? options.find((x) => x.key === 'train') ?? options[0];
    if (flight && flight.direct) recommendReason = `${km}km 长途：直飞最省时间`;
    else if (flight && !flight.direct)
      recommendReason = `${km}km 长途且行程 ${days || '未定'} 天：中转航班在总耗时上仍占优`;
    else recommendReason = `${km}km：目的地无民航航班，改乘铁路`;
  }
  if (!rec) rec = options[0];
  rec.recommended = true;

  return {
    recognized: true,
    from: from.name,
    to: to.name,
    km,
    options,
    recommendedKey: rec.key,
    roundTripLow: rec.oneWayLow * 2,
    roundTripHigh: rec.oneWayHigh * 2,
    directFlight: rule,
    recommendReason,
    basis: `${km}km（大圆距离）· ${season.label} · ${basis}`,
  };
}
