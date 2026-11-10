// Link-R World — 行程与预算的纯函数
//
// 这一层是界面上所有数字的唯一来源：日程、预算、节奏、五 R 进度、地图投影。
// 全部为确定性纯函数，不含随机、不含网络、不含隐式推算。

import { CITY_BY_ID, getCity, type CityId, type CityInfo } from '../data/cities';
import { placeView, tripPlacesOfCity, ROAM_COMFORT_KM_PER_DAY, TRANSIT_RATE } from '../data/tripData';
import { buildMood, type TripMood } from './mood';
import type {
  CostCategory,
  FiveR,
  ItineraryItem,
  MemoryEntry,
  Place,
  TimeSlot,
  Trip,
} from './types';

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  ticket: '门票・展馆',
  food: '餐饮',
  transit: '市内交通',
  shop: '书店・购入',
  other: '其他',
};

export const SLOT_LABEL: Record<TimeSlot, string> = {
  morning: '上午',
  afternoon: '下午',
  evening: '傍晚',
};

const SLOT_ORDER: Record<TimeSlot, number> = { morning: 0, afternoon: 1, evening: 2 };

/** 五 R 的语义定义（深海蓝→靛蓝→日落金→雾松青→梅紫，品牌双色主导的低饱和序列） */
export const FIVE_R_META: Array<{ key: FiveR; label: string; labelEn: string; color: string; hint: string }> = [
  { key: 'roam', label: '探索', labelEn: 'Roam', color: '#0B3A5B', hint: '累计步行里程与舒适区的关系' },
  { key: 'route', label: '路径', labelEn: 'Route', color: '#46628A', hint: '每段通勤是否已排定时方式' },
  { key: 'relate', label: '共鸣', labelEn: 'Relate', color: '#C8862F', hint: '行程里为相遇留出的位置' },
  { key: 'real', label: '真实', labelEn: 'Real', color: '#4F7F78', hint: '票价与开放时段已对齐官方公示' },
  { key: 'remember', label: '记忆', labelEn: 'Remember', color: '#7C5A82', hint: '把一次相遇沉淀成世界记忆' },
];

/** 把 "09:30–11:15" 解析为起始分钟；无法解析时返回 null，绝不猜测。 */
export function parseStartMinutes(time: string): number | null {
  if (typeof time !== 'string') return null;
  const m = time.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 时段内时长（分钟）。解析失败返回 null。 */
export function durationMinutes(time: string): number | null {
  if (typeof time !== 'string') return null;
  const parts = time.split(/[–—-]/);
  if (parts.length < 2) return null;
  const a = parseStartMinutes(parts[0]);
  const b = parseStartMinutes(parts[1]);
  if (a === null || b === null) return null;
  const d = b - a;
  return d > 0 ? d : null;
}

/** 一天的行程块，按时间升序（时间不可解析时按时段顺序兜底）。 */
export function dayItems(items: ItineraryItem[], dayIndex: number): ItineraryItem[] {
  return items
    .filter((i) => i.dayIndex === dayIndex)
    .slice()
    .sort((a, b) => {
      const am = parseStartMinutes(a.time);
      const bm = parseStartMinutes(b.time);
      if (am !== null && bm !== null && am !== bm) return am - bm;
      if (am === null && bm !== null) return 1;
      if (am !== null && bm === null) return -1;
      return SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
    });
}

export function itemsByDay(items: ItineraryItem[], dayCount: number): ItineraryItem[][] {
  return Array.from({ length: dayCount }, (_, d) => dayItems(items, d));
}

export function sumCost(items: ItineraryItem[]): number {
  return items.reduce((s, i) => s + (Number.isFinite(i.cost) ? i.cost : 0), 0);
}

export function dayCost(items: ItineraryItem[], dayIndex: number): number {
  return sumCost(dayItems(items, dayIndex));
}

export function transitRateOf(mode: string): number {
  return TRANSIT_RATE[mode] ?? 4;
}

/** 市内交通估算：逐段按固定费率累加。透明算术，费率写在界面上。 */
export function estimateTransitCost(items: ItineraryItem[]): number {
  return items.reduce((s, i) => s + transitRateOf(i.transit?.mode ?? '地铁'), 0);
}

export interface BudgetSummary {
  itemsTotal: number;
  transitTotal: number;
  total: number;
  byCategory: Array<{ key: CostCategory; label: string; amount: number; ratio: number }>;
  perDay: number[];
  avgPerDay: number;
  travelers: number;
  totalForParty: number;
}

export function budgetSummary(trip: Trip): BudgetSummary {
  const itemsTotal = sumCost(trip.items);
  const transitTotal = estimateTransitCost(trip.items);
  const total = itemsTotal + transitTotal;

  const catKeys: CostCategory[] = ['ticket', 'food', 'shop', 'transit', 'other'];
  const byCategory = catKeys
    .map((key) => {
      // 市内交通按估算值单列，其余按行程块实际登记金额汇总
      const amount =
        key === 'transit'
          ? transitTotal
          : trip.items
              .filter((i) => i.costCategory === key)
              .reduce((s, i) => s + (Number.isFinite(i.cost) ? i.cost : 0), 0);
      return { key, label: COST_CATEGORY_LABEL[key], amount, ratio: total > 0 ? amount / total : 0 };
    })
    .filter((c) => c.amount > 0);

  const perDay = trip.days.map((d) => dayCost(trip.items, d.index));
  const travelers = Math.max(1, trip.travelers || 1);

  return {
    itemsTotal,
    transitTotal,
    total,
    byCategory,
    perDay,
    avgPerDay: perDay.length > 0 ? Math.round(total / perDay.length) : 0,
    travelers,
    totalForParty: total * travelers,
  };
}

/* ── 吃住行全包预算（区间估算） ──────────────────────────── */

export type BudgetTier = 'economy' | 'comfort' | 'premium';

export const TIER_LABEL: Record<BudgetTier, string> = {
  economy: '经济档',
  comfort: '舒适档',
  premium: '轻奢档',
};

/** 识别预算档位：写"穷游/省钱"按经济档，"轻奢/高端"按轻奢档，默认舒适档 */
export function parseTierFromInput(input: string): BudgetTier {
  const t = input ?? '';
  if (/穷游|省钱|经济|背包|便宜|节约/.test(t)) return 'economy';
  if (/轻奢|高端|豪华|五星|品质|度假|网红酒店/.test(t)) return 'premium';
  return 'comfort';
}

/** 档位对住宿/餐饮参考值的缩放（经济档往下压，轻奢档往上抬） */
const TIER_SCALE: Record<BudgetTier, { stay: [number, number]; meal: [number, number] }> = {
  economy: { stay: [0.5, 0.75], meal: [0.55, 0.8] },
  comfort: { stay: [1, 1], meal: [1, 1] },
  premium: { stay: [1.4, 2.2], meal: [1.5, 2.2] },
};

export interface BudgetBreakdownRow {
  key: 'intercity' | 'stay' | 'meal' | 'ticket' | 'local';
  label: string;
  low: number;
  high: number;
  /** 透明口径：这一行怎么算的 */
  note: string;
}

export interface FullBudget {
  low: number;
  high: number;
  tier: BudgetTier;
  nights: number;
  rooms: number;
  rows: BudgetBreakdownRow[];
}

/**
 * 吃住行全包预算（单人区间 × 同行人数）：
 * 大交通（往返）+ 住宿（晚数 × 间数）+ 餐饮（天数 × 人数）+ 门票体验 + 市内交通。
 * 行程里的餐饮点位给出的是"去哪儿吃"，其金额已含在餐饮预算里，不重复计入。
 */
export function fullBudget(
  trip: Trip,
  cityRates: { stayPerNight: [number, number]; mealPerDay: [number, number] },
  intercity: { roundTripLow: number; roundTripHigh: number } | null,
  tier: BudgetTier
): FullBudget {
  const travelers = Math.max(1, trip.travelers || 1);
  const days = Math.max(1, trip.days.length);
  const nights = Math.max(0, days - 1);
  const rooms = Math.ceil(travelers / 2);
  const scale = TIER_SCALE[tier];

  const tickets = trip.items
    .filter((i) => i.costCategory === 'ticket' || i.costCategory === 'shop')
    .reduce((s, i) => s + (Number.isFinite(i.cost) ? i.cost : 0), 0);
  const local = estimateTransitCost(trip.items);

  const stayLow = Math.round(cityRates.stayPerNight[0] * scale.stay[0] * rooms * nights);
  const stayHigh = Math.round(cityRates.stayPerNight[1] * scale.stay[1] * rooms * nights);
  const mealLow = Math.round(cityRates.mealPerDay[0] * scale.meal[0] * days * travelers);
  const mealHigh = Math.round(cityRates.mealPerDay[1] * scale.meal[1] * days * travelers);
  const interLow = Math.round((intercity?.roundTripLow ?? 0) * travelers);
  const interHigh = Math.round((intercity?.roundTripHigh ?? 0) * travelers);

  const allRows: BudgetBreakdownRow[] = [
    {
      key: 'intercity',
      label: `大交通 · 往返${travelers > 1 ? ` × ${travelers} 人` : ''}`,
      low: interLow,
      high: interHigh,
      note: '按推荐交通方式的往返区间 × 人数',
    },
    {
      key: 'stay',
      label: `住宿 · ${nights} 晚${rooms > 1 ? `（${rooms} 间）` : ''}`,
      low: stayLow,
      high: stayHigh,
      note: '城市参考价 × 档位 × 晚数 × 间数',
    },
    {
      key: 'meal',
      label: `餐饮 · ${days} 天 × ${travelers} 人`,
      low: mealLow,
      high: mealHigh,
      note: '三餐 + 一杯茶饮的人均参考 × 档位 × 天数 × 人数',
    },
    {
      key: 'ticket',
      label: '门票 · 体验 · 购入',
      low: tickets,
      high: tickets,
      note: '逐日行程里登记的门票、书店与体验金额合计',
    },
    {
      key: 'local',
      label: '市内交通',
      low: local,
      high: local,
      note: '逐段固定费率估算（步行 0 / 公交 2 / 地铁 4 / 网约车 45）',
    },
  ];
  const rows = allRows.filter((r) => r.low > 0 || r.high > 0);

  const low = rows.reduce((s, r) => s + r.low, 0);
  const high = rows.reduce((s, r) => s + r.high, 0);
  return { low, high, tier, nights, rooms, rows };
}

export function dayRoamKm(items: ItineraryItem[], dayIndex: number): number {
  return dayItems(items, dayIndex).reduce((s, i) => s + (i.roamKm ?? 0), 0);
}

export function dayTransitMinutes(items: ItineraryItem[], dayIndex: number): number {
  return dayItems(items, dayIndex).reduce((s, i) => s + (i.transit?.minutes ?? 0), 0);
}

export type Pace = 'light' | 'comfortable' | 'full';

export function paceOf(km: number, limit = ROAM_COMFORT_KM_PER_DAY): Pace {
  if (!Number.isFinite(km) || km <= 0) return 'light';
  const r = km / limit;
  if (r <= 0.6) return 'light';
  if (r <= 1) return 'comfortable';
  return 'full';
}

export const PACE_LABEL: Record<Pace, string> = {
  light: '留白充足',
  comfortable: '舒适区',
  full: '偏满',
};

export interface FiveRProgress {
  key: FiveR;
  label: string;
  labelEn: string;
  color: string;
  hint: string;
  value: number;
  target: number;
  ratio: number;
  display: string;
}

/** 五 R 进度：全部由行程与记忆数据推导，无硬编码结论。 */
export function fiveRProgress(trip: Trip, memories: MemoryEntry[]): FiveRProgress[] {
  const placeOf = (i: ItineraryItem): Place | undefined => placeView(i.placeId);
  const itemPlaces = trip.items.map(placeOf).filter(Boolean) as Place[];

  const roamTotal = trip.items.reduce((s, i) => s + (i.roamKm ?? 0), 0);
  const roamTarget = Math.max(1, trip.days.length * ROAM_COMFORT_KM_PER_DAY);

  const routeTotal = trip.items.length;
  const routeDone = trip.items.filter((i) => !i.transit?.needCheck).length;

  const relateTotal = trip.items.filter((i) => i.relate).length;
  const relateTarget = 3;

  const realTotal = itemPlaces.length;
  const realAligned = itemPlaces.filter((pl) => pl.status === 'stable').length;

  const rememberTarget = 1;
  const rememberValue = memories.length;

  const rows: Array<{ key: FiveR; value: number; target: number; display: string }> = [
    { key: 'roam', value: roamTotal, target: roamTarget, display: `${roamTotal.toFixed(1)} km` },
    { key: 'route', value: routeDone, target: routeTotal, display: `${routeDone}/${routeTotal} 段已排定` },
    { key: 'relate', value: relateTotal, target: relateTarget, display: `${relateTotal} 次相遇` },
    { key: 'real', value: realAligned, target: realTotal, display: `${realAligned}/${realTotal} 时段已对齐` },
    { key: 'remember', value: rememberValue, target: rememberTarget, display: `${rememberValue} 张记忆` },
  ];

  return FIVE_R_META.map((meta) => {
    const row = rows.find((r) => r.key === meta.key)!;
    return {
      ...meta,
      value: row.value,
      target: row.target,
      ratio: progressOf(row.value, row.target),
      display: row.display,
    };
  });
}

export function progressOf(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}

// ── 地图投影 ────────────────────────────────────────────────

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * 计算点集包围盒；带最小值保护，避免单点或退化范围导致除零。
 * 点集为空时返回 fallback（通常传入城市中心附近的安全框）。
 */
export function bboxOf(
  points: Array<{ lat: number; lng: number }>,
  fallback?: BBox
): BBox {
  const valid = points.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  if (valid.length === 0) {
    return fallback ?? { minLat: 30.9, maxLat: 31.5, minLng: 121.2, maxLng: 121.8 };
  }
  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);
  const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.08, 0.006);
  const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.08, 0.006);
  return {
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
    minLng: Math.min(...lngs) - padLng,
    maxLng: Math.max(...lngs) + padLng,
  };
}

export interface ProjectCtx {
  bbox: BBox;
  width: number;
  height: number;
  padding: number;
}

/** 经纬度 → SVG 坐标（等距近似，纬度越高横向压缩）。bbox 退化时安全居中。 */
export function project(p: { lat: number; lng: number }, ctx: ProjectCtx): { x: number; y: number } {
  const { bbox, width, height, padding } = ctx;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const spanLng = bbox.maxLng - bbox.minLng;
  const spanLat = bbox.maxLat - bbox.minLat;
  const tx = spanLng > 1e-9 ? (p.lng - bbox.minLng) / spanLng : 0.5;
  const ty = spanLat > 1e-9 ? (p.lat - bbox.minLat) / spanLat : 0.5;
  return {
    x: padding + tx * innerW,
    // 纬度向上为北，SVG 的 y 向下，故取反
    y: padding + (1 - ty) * innerH,
  };
}

export function placesInTrip(trip: Trip): Place[] {
  const ids = Array.from(new Set(trip.items.map((i) => i.placeId)));
  return ids.map((id) => placeView(id)).filter(Boolean) as Place[];
}

export function placesNotInTrip(trip: Trip): Place[] {
  const ids = new Set(trip.items.map((i) => i.placeId));
  const cityId = (CITY_ID_BY_NAME[trip.destination] ?? 'shanghai') as CityId;
  return tripPlacesOfCity(cityId).filter((p) => !ids.has(p.id));
}

export const CITY_ID_BY_NAME: Record<string, CityId> = Object.fromEntries(
  Object.values(CITY_BY_ID).map((c) => [c.name, c.id])
);

export function cityOfTrip(trip: Trip): CityInfo {
  return getCity(CITY_ID_BY_NAME[trip.destination] ?? 'shanghai')!;
}

// ── 自然语言输入的确定性映射 ─────────────────────────────────

const INTEREST_RULES: Array<{ keys: string[]; label: string }> = [
  { keys: ['书店', '阅读', '书'], label: '书店' },
  { keys: ['咖啡'], label: '咖啡' },
  { keys: ['美术馆', '展览', '看展', '艺术'], label: '展览' },
  { keys: ['夜市', '夜宵', '酒'], label: '夜市' },
  { keys: ['茶', '茶园'], label: '茶' },
  { keys: ['古城', '古镇', '历史'], label: '古城' },
  { keys: ['海边', '海滩', '岛'], label: '海边' },
  { keys: ['山', '徒步', '爬山'], label: '山野' },
  { keys: ['博物馆'], label: '博物馆' },
  { keys: ['市集', '菜市场', '小店'], label: '市集' },
];

const PACE_RULES: Array<{ keys: string[]; label: string }> = [
  { keys: ['不赶', '慢', '悠闲', '松弛', '轻松'], label: '不赶路' },
  { keys: ['紧凑', '高效', '多去', '尽量'], label: '节奏偏紧' },
];

const COMPANION_RULES: Array<{ keys: string[]; label: string; travelers: number }> = [
  { keys: ['一个人', '独自', '独行', '自己'], label: '独行', travelers: 1 },
  { keys: ['两个人', '情侣', '二人', '伴侣'], label: '两人', travelers: 2 },
  { keys: ['朋友', '同伴'], label: '与朋友', travelers: 2 },
  { keys: ['家人', '父母', '孩子', '带娃'], label: '与家人', travelers: 3 },
];

export interface PromptSummary {
  title: string;
  titleEn: string;
  preference: string;
  tags: string[];
  companions: string;
  travelers: number;
  destination: string;
  cityId: CityId;
  mood: TripMood;
  /** 从输入里识别的天数（未写明则为 null，由调用方决定默认值） */
  days: number | null;
  /** 从输入里识别的出发日期（yyyy-mm-dd，未写明则为 null） */
  startDate: string | null;
}

const CN_NUM: Record<string, number> = {
  一: 1,
  两: 2,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** 从输入里识别天数："2 天" / "三日" / "玩5天" / "周末"。识别不到返回 null。 */
export function parseDaysFromInput(input: string): number | null {
  const t = (input ?? '').trim();
  if (!t) return null;
  const arabic = t.match(/(\d{1,2})\s*(?:天|日|晚)/);
  if (arabic) {
    const n = Number(arabic[1]);
    if (n >= 1 && n <= 30) return n;
  }
  const cn = t.match(/([一二两三四五六七八九十])\s*(?:天|日|晚)/);
  if (cn && CN_NUM[cn[1]]) return CN_NUM[cn[1]];
  if (/周末/.test(t)) return 2;
  return null;
}

/** 从输入里识别出发日期："10月13号" / "4 月 13 日" / "2026-10-13"。识别不到返回 null。 */
export function parseDateFromInput(input: string): string | null {
  const t = input ?? '';
  const cn = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (cn) {
    const month = Number(cn[1]);
    const day = Number(cn[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

const DEFAULT_PREFERENCE = '书店、街巷与当地的一口热食；不赶路。';

/** 城市名的可匹配写法：中文名、英文名、去掉撇号/空格/连字符的小写英文名 */
function cityAliases(city: CityInfo): string[] {
  const flat = city.nameEn.replace(/['’\s-]/g, '').toLowerCase();
  return [city.name, city.nameEn, flat];
}

/**
 * 把一句旅行愿望映射为标题、偏好与文艺主题。
 * 城市联动：优先从输入中识别城市；识别不到时用传入的默认城市。
 */
export function summarizePrompt(raw: string, defaultCityId: CityId, month?: number, age?: number): PromptSummary {
  const input = (raw ?? '').trim();
  const lower = input.toLowerCase();

  // 城市识别（中文名 / 英文名 / 去掉撇号与空格的英文名）
  let cityId: CityId = defaultCityId;
  if (input) {
    const hit = Object.values(CITY_BY_ID).find((c) => {
      const [zh, en, flat] = cityAliases(c);
      return input.includes(zh) || lower.includes(en.toLowerCase()) || lower.includes(flat);
    });
    if (hit) cityId = hit.id;
  }
  const city = getCity(cityId)!;

  const matched = new Set<string>();
  let pace: string | null = null;

  for (const rule of INTEREST_RULES) {
    if (rule.keys.some((k) => input.includes(k))) matched.add(rule.label);
  }
  for (const rule of PACE_RULES) {
    if (rule.keys.some((k) => input.includes(k))) {
      pace = rule.label;
      break;
    }
  }
  let companions = '独行';
  let travelers = 1;
  for (const rule of COMPANION_RULES) {
    if (rule.keys.some((k) => input.includes(k))) {
      companions = rule.label;
      travelers = rule.travelers;
      break;
    }
  }

  const tags = Array.from(matched);
  if (pace) tags.push(pace);

  // 偏好句：输入里除了城市名与标点还有实质内容才采用，否则回落到默认句
  const residue = cityAliases(city).reduce(
    (acc, alias) => acc.split(alias).join(''),
    input
  ).replace(/[\s,，。.、；;：:!！?？~\-—–'’"]/g, '');

  const mood = buildMood(city, input, month, age);

  return {
    title: `${city.name} · ${mood.titleShort}`,
    titleEn: `${city.nameEn} · ${mood.themeEn}`,
    preference: residue.length >= 2 ? input : DEFAULT_PREFERENCE,
    tags: tags.length > 0 ? tags : ['城市漫游'],
    companions,
    travelers,
    destination: city.name,
    cityId,
    mood,
    days: parseDaysFromInput(input),
    startDate: parseDateFromInput(input),
  };
}

// ── 格式化 ──────────────────────────────────────────────────

export function formatCNY(n: number): string {
  if (!Number.isFinite(n)) return '¥0';
  return `¥${Math.round(n).toLocaleString('zh-CN')}`;
}

export function formatKm(n: number): string {
  if (!Number.isFinite(n)) return '0.0 km';
  return `${n.toFixed(1)} km`;
}

export function formatMinutes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 60) return `${Math.round(n)} 分钟`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}
