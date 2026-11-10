// Link-R World — 行程组装器
//
// 把「城市档案 × 地点库 × 逐日骨架 × 旅行闭环」装配成一份行程。
// 四条硬规则：
//   1) 门票费用一律取自地点库（单一来源），这里不做任何推算或补全；
//   2) 天数与出发日期由用户输入驱动，输入几天就排几天；
//   3) 路线按用户关键词个性化精排 —— 打卡点不在于多，而在于精和准确；
//   4) **先算时间账，再排景点**：每一天能放几块由闭环引擎给出的
//      「当日可玩时间窗」决定（抵达日 / 返程日天然放得少），
//      绝不允许先把景点堆满、再回头硬塞交通。

import type { CityId } from './cities';
import { getCity } from './cities';
import type { CityProgram, ProgramItem, ProgramTable } from './programSchema';
import { PROGRAMS_EAST } from './programsEast';
import { PROGRAMS_WEST } from './programsWest';
import { getPlace, placesOfCity } from './places';
import { TRIP_CURRENCY } from './rates';
import {
  DAY_END_MIN,
  DAY_START_MIN,
  MAX_PLAN_DAYS,
  dayConstraints,
  planJourneyLegs,
} from '../lib/journey';
import type {
  ItineraryItem,
  JourneyInput,
  JourneyRole,
  Place,
  Span,
  Trip,
  TripDay,
} from '../lib/types';

export { ROAM_COMFORT_KM_PER_DAY, TRANSIT_RATE, TRIP_CURRENCY } from './rates';

const PROGRAMS: ProgramTable = { ...PROGRAMS_EAST, ...PROGRAMS_WEST };

/** 未写明天数时的默认天数（骨架最完整的长度） */
export const DEFAULT_TRIP_DAYS = 5;
/** 精选路线支持的天数上限（地点库按 5 天精选组织） */
export const MAX_TRIP_DAYS = MAX_PLAN_DAYS;
/** 每天行程块的默认数量：少而准，不堆点 */
export const DEFAULT_ITEMS_PER_DAY = 3;

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function toDate(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00`);
}

function formatDayLabel(dateISO: string): string {
  const d = toDate(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${WEEKDAYS[d.getDay()]}`;
}

export function addDays(dateISO: string, n: number): string {
  const d = toDate(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 某个 ISO 日期是星期几（0=周日） */
export function weekdayOf(dateISO: string): number {
  const d = toDate(dateISO);
  return Number.isNaN(d.getTime()) ? 0 : d.getDay();
}

/** 地点库原始数据 → 行程展示视图（status 由开放时段是否"需再确认"推导） */
function toTripPlace(raw: NonNullable<ReturnType<typeof getPlace>>): Place {
  const flexible =
    raw.hours.includes('不固定') ||
    raw.hours.includes('以当日公示为准') ||
    raw.hours.includes('以店内公示为准') ||
    raw.hours.includes('以庙内公示为准');
  return {
    id: raw.id,
    name: raw.name,
    nameEn: raw.nameEn,
    district: raw.district,
    lat: raw.lat,
    lng: raw.lng,
    status: flexible ? 'check' : 'stable',
    kind: raw.kind,
    ticket: raw.ticket,
    hours: raw.hours,
    tip: raw.tip,
    source: raw.source,
  };
}

/**
 * 每座城市骨架 items 的"天分界"：breaks[n] = 第 n 天第一位的下标。
 * 骨架按 D1..D5 顺序书写，这里显式登记，保证 dayIndex 与书写分组一致。
 */
export const PROGRAM_DAY_BREAKS: Record<CityId, number[]> = {
  shanghai: [0, 3, 7, 11, 15],
  beijing: [0, 4, 8, 10, 14],
  suzhou: [0, 3, 7, 10, 13],
  hangzhou: [0, 3, 6, 9, 11],
  wuxi: [0, 2, 6, 8, 11],
  puer: [0, 2, 4, 7, 9],
  xishuangbanna: [0, 3, 6, 8, 10],
  dali: [0, 3, 7, 10, 14],
  tengchong: [0, 3, 6, 9, 12],
  lijiang: [0, 3, 6, 9, 12],
  xian: [0, 4, 8, 10, 13],
  quanzhou: [0, 4, 9, 12, 14],
  chengdu: [0, 3, 6, 9, 12],
};

/** 行程展示视图的地点登记表（placeId 全局唯一，直接平铺） */
const PLACE_VIEW: Record<string, Place> = {};

/** 用户从地图搜索加进来的自定义地点（会话内有效，与内置地点同一套展示逻辑） */
const CUSTOM_PLACES: Record<string, Place> = {};

/**
 * 登记一个自定义地点（来自地图 POI 搜索或用户手填）。
 * id 由城市 + 名称 + 坐标稳定哈希：同名同址重复添加不会生成两份。
 */
export function registerCustomPlace(input: {
  cityId: CityId;
  name: string;
  district: string;
  lat: number;
  lng: number;
  address?: string;
  kind?: Place['kind'];
}): Place {
  const key = `${input.cityId}|${input.name}|${input.lat.toFixed(4)}|${input.lng.toFixed(4)}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  const id = `cus-${h.toString(36)}`;
  const exist = CUSTOM_PLACES[id];
  if (exist) return exist;
  const place: Place = {
    id,
    name: input.name,
    nameEn: '',
    district: input.district || '地图搜索',
    lat: input.lat,
    lng: input.lng,
    status: 'check',
    kind: input.kind ?? 'landmark',
    ticket: 0,
    hours: '以店内公示为准',
    tip: input.address ? `地图收录取自：${input.address}` : '来自地图搜索的点位，出发前确认营业状态。',
    source: input.address || '腾讯位置服务 · 用户搜索添加',
  };
  CUSTOM_PLACES[id] = place;
  return place;
}

export function placeView(placeId: string): Place | undefined {
  return PLACE_VIEW[placeId] ?? CUSTOM_PLACES[placeId];
}

/** 某座城市全部地点的展示视图 */
export function tripPlacesOfCity(cityId: CityId): Place[] {
  return placesOfCity(cityId).map(toTripPlace);
}

// ── 个性化精排 ────────────────────────────────────────────────

/** 兴趣标签 → 地点类别（kind） */
const TAG_KINDS: Record<string, string[]> = {
  书店: ['bookstore'],
  咖啡: ['cafe', 'food', 'street'],
  展览: ['museum'],
  夜市: ['market', 'food'],
  茶: ['tea', 'cafe', 'park'],
  古城: ['street', 'temple', 'landmark'],
  海边: ['park', 'street'],
  山野: ['park', 'tea'],
  博物馆: ['museum'],
  市集: ['market'],
  美食: ['food', 'market'],
  甜品: ['dessert'],
  小吃: ['food'],
};

/** 精排只需地点的最小字段集（地点库与展示视图都满足） */
type ScoreablePlace = Pick<Place, 'id' | 'name' | 'nameEn' | 'kind' | 'ticket' | 'hours'>;

export interface CurateOptions {
  /** 期望天数（1..5），未传或越界回落默认 */
  days?: number;
  /** 出发日期 ISO（yyyy-mm-dd） */
  startDate?: string;
  /** 用户原始输入（用于关键词匹配） */
  keywords?: string;
  /** 每天行程块数（2..4），由节奏决定 */
  perDay?: number;
  /** 用户年龄（选填）：60+ 或带长辈关键词时，节奏自动放慢 */
  age?: number;
  /** 出发地（大交通与闭环计算用） */
  origin?: string;
  /** 到访城市（有序）；缺省为单城 [cityId] */
  route?: CityId[];
  /** 结束方式：round-trip 回到出发地 / open-jaw 结束于最后一座城市 */
  returnMode?: 'round-trip' | 'open-jaw';
  /** 用户明确要单程 */
  oneWay?: boolean;
  /** 去程出发时段偏好 */
  departPref?: JourneyInput['departPref'];
  /** 返程出发时段偏好 */
  returnPref?: JourneyInput['returnPref'];
}

/** 单城精排的输入：在用户选项之上补「闭环引擎」给出的逐日约束 */
export interface CityPlanOptions extends CurateOptions {
  /** 每天可放几块的上限（由当日可玩时间窗算出；缺省用 perDay） */
  caps?: number[];
  /** 每天的角色（抵达 / 完整 / 转场 / 返程） */
  roles?: JourneyRole[];
  /** 每天的可玩时间窗（缺省按 08:30–21:30 全天） */
  windows?: Array<Span | null>;
  /**
   * 当天确实在路上的分钟数（在途 + 接驳候车）。
   * 只有 > 0 时「抵达日不排上午 / 返程日不排傍晚」才成立 ——
   * 没填出发地、或出发地与目的地同城时当天并没有在路上，早晚时段照样可用。
   */
  travel?: number[];
  /** 该城第一天在整趟行程中的天序号 */
  dayOffset?: number;
}

/** 夜生活意图：写了这些词才排小酒馆，不硬塞（准确 > 数量） */
const NIGHT_RE = /酒吧|酒馆|微醺|小酌|精酿|livehouse|夜生活|喝一杯/i;
/**
 * 餐位补贴：餐位不占用「可玩时间」预算，每天在闭环引擎给的块数上限之外多留 1 个名额。
 * 与 injectIntoDay 里给餐位保底的 max(1, …) 同源 —— 至少一顿正餐 + 一处茶咖甜品。
 */
const MEAL_SLOT_BONUS = 1;
/** 家庭 / 长辈出行：每天少排一个重点，多留空 */
const FAMILY_RE = /亲子|孩子|带娃|父母|爸妈|老人|家人|带小孩/;
/** 紧凑意图：用户明确要"多走多看"才放宽每日块数上限 */
const INTENSE_RE = /紧凑|特种兵|高效|多去|尽量|打卡/;

/** 判断某地点是否在指定星期闭馆（依据开放时段文案里的"周X闭馆"） */
function closedOn(place: ScoreablePlace, weekday: number): boolean {
  if (weekday !== 1) return false; // 目前数据里的闭馆日只有周一
  return place.hours.includes('周一');
}

/** 单个候选行程块的得分：关键词命中 + 类别契合 + 相遇加成 */
function scoreItem(raw: ProgramItem, place: ScoreablePlace, text: string, tags: string[]): number {
  const hay = `${place.name}${place.nameEn}${place.kind}${raw.note}`;
  let s = 0;
  for (const tag of tags) {
    if (tag.length >= 2 && hay.includes(tag)) s += 4;
    const kinds = TAG_KINDS[tag];
    if (kinds && kinds.includes(place.kind)) s += 3;
  }
  if (text && text.length >= 2) {
    // 输入里的实词（≥2 字）直接命中地名或提示
    if (hay.includes(text)) s += 3;
  }
  if (raw.relate) s += 1.2;
  if (place.ticket > 0) s += 0.3;
  return s;
}

/**
 * 从五日骨架里为用户挑出最贴合的 N 天。
 * 选择在天级别完成（骨架的每一天本来就是同一片区的地理聚类），保证路线不走冤枉路。
 *
 * 闭环约束（2026-10-10 新增）：
 *  · caps[i]  —— 第 i 天由「可玩时间窗」算出的块数上限（抵达日 / 返程日天然放得少）；
 *  · roles[i] —— 当天角色；配合 travel[i] 决定早晚偏好：真的在路上的抵达日不排上午，
 *               真的在路上的返程日不排傍晚（当天不在路上则不做早晚限制）；
 *  · dayOffset —— 该城第一天在整趟行程里的天序号（多城市串起来时用）。
 */
function planCityDays(program: CityProgram, cityId: CityId, opts: CityPlanOptions) {
  const breaks = PROGRAM_DAY_BREAKS[cityId];
  const dayCount = Math.min(
    MAX_TRIP_DAYS,
    Math.max(1, Math.round(opts.days ?? DEFAULT_TRIP_DAYS))
  );
  const perDayRaw = Math.min(4, Math.max(2, Math.round(opts.perDay ?? DEFAULT_ITEMS_PER_DAY)));
  const text = (opts.keywords ?? '').trim();
  // 亲子 / 带父母 / 60+：节奏放慢半拍——每天少排一个重点，剩下的时间留给吃饭和歇脚
  const family = FAMILY_RE.test(text) || (typeof opts.age === 'number' && Number.isFinite(opts.age) && opts.age >= 60);
  const perDay = family ? Math.max(2, perDayRaw - 1) : perDayRaw;
  const night = NIGHT_RE.test(text);
  const tags = Array.from(
    new Set(
      Object.keys(TAG_KINDS).filter((tag) => {
        const keys = [tag, ...extraKeys(tag)];
        return keys.some((k) => text.includes(k));
      })
    )
  );

  const startISO =
    opts.startDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.startDate) ? opts.startDate : fallbackStart();
  const dayOffset = Math.max(0, Math.round(opts.dayOffset ?? 0));

  // 1) 逐块打分
  const scored = program.items.map((raw) => {
    const place = getPlace(raw.placeId);
    return { raw, place, score: place ? scoreItem(raw, place, text, tags) : 0 };
  });

  // 2) 天级得分 = 该天行程块得分之和
  const dayScores = breaks.map((start, d) => {
    const end = d + 1 < breaks.length ? breaks[d + 1] : program.items.length;
    let sum = 0;
    for (let i = start; i < end; i++) sum += scored[i].score;
    return { day: d, start, end, sum };
  });

  // 3) 选出得分最高的 N 天，保持原有先后顺序（地理逻辑不乱）
  const chosen = dayScores
    .slice()
    .sort((a, b) => b.sum - a.sum)
    .slice(0, dayCount)
    .map((r) => r.day)
    .sort((a, b) => a - b);

  // 4) 每天块数裁剪：优先保留关键词命中的块，再按分数补足
  const pickedItems: ItineraryItem[] = [];
  const pickedDays: TripDay[] = [];
  // 餐饮选点池：本城的正餐 / 咖啡 / 茶馆 / 甜品（真实门店）
  const fnbPool = placesOfCity(cityId).filter((x) => FN_KINDS.includes(x.kind));
  // 小酒馆池：只在用户表达了夜生活意图时启用
  const barPool = placesOfCity(cityId).filter((x) => x.kind === 'bar');
  // 跨天不重复用店
  const fnbUsed = new Set<string>();

  chosen.forEach((origDay, newIdx) => {
    const dayIndex = dayOffset + newIdx;
    const dateISO = addDays(startISO, newIdx);
    const wd = weekdayOf(dateISO);
    const role: JourneyRole = opts.roles?.[newIdx] ?? 'full';
    // 当天确实在路上（在途 + 接驳 > 0）才做早晚限制：
    // 抵达日 / 转场日「上午还在路上」、返程日「傍晚已经走了」的前提都是真的走了这段路。
    const travelled = (opts.travel?.[newIdx] ?? 0) > 0;
    const skipMorning = travelled && (role === 'departure' || role === 'transit');
    const skipEvening = travelled && role === 'return';
    const rolePenalty = (raw: ProgramItem) =>
      (skipMorning && raw.slot === 'morning' ? 2.5 : 0) + (skipEvening && raw.slot === 'evening' ? 2.5 : 0);

    const span = scored.slice(dayScores[origDay].start, dayScores[origDay].end);

    // 周一闭馆的地点优先剔除（准确 > 数量）；剔除后不足 2 块再放回并留痕
    const open = span.filter((r) => !(r.place && closedOn(r.place, wd)));
    const dropped = span.filter((r) => r.place && closedOn(r.place, wd));
    const base = open.length >= 2 ? open : span;

    // 闭环引擎给的上限：抵达日可能只有 1 块，返程日可能只有 1 块
    const cap = Math.max(0, Math.min(5, Math.round(opts.caps?.[newIdx] ?? perDay)));
    const take = Math.min(perDay, cap);
    const sorted = base
      .slice()
      .sort(
        (a, b) =>
          b.score - rolePenalty(b.raw) - (a.score - rolePenalty(a.raw)) ||
          a.raw.placeId.localeCompare(b.raw.placeId)
      )
      .slice(0, take);

    // 恢复时间顺序（骨架本来就按时段书写）
    const kept = sorted
      .slice()
      .sort((a, b) => span.indexOf(a) - span.indexOf(b));

    // 转换骨架块 → 行程块
    const keptConverted: ItineraryItem[] = kept.map((r, k) => {
      const place = r.place;
      const cost = r.raw.costCategory === 'ticket' ? place?.ticket ?? 0 : r.raw.cost;
      return {
        id: `${cityId}-d${dayIndex + 1}-${k + 1}`,
        dayIndex,
        slot: r.raw.slot,
        time: r.raw.time,
        placeId: r.raw.placeId,
        note: r.raw.note,
        transit: r.raw.transit,
        cost,
        costCategory: r.raw.costCategory,
        roamKm: r.raw.roamKm,
        relate: r.raw.relate,
      };
    });

    // 5) 注入"吃饭的地儿"：正餐 / 茶咖 / 甜品按时段空档补进一天（因人而异选店）
    //    空档必须落在这天的可用时间窗内 —— 落地当天不可能 12:30 已在城里吃饭
    const seed = `${cityId}|${text}|${startISO}|${dayCount}`;
    const taken = dayWindows(opts, newIdx);
    const dayItemsFinal =
      taken === null || taken.hi > taken.lo
        ? injectIntoDay(
            cityId,
            keptConverted,
            fnbPool,
            text,
            tags,
            dayIndex,
            seed,
            fnbUsed,
            {
              bars: barPool,
              night,
              window: taken ?? { lo: DAY_START_MIN, hi: DAY_END_MIN },
              // 传「当天总块数上限」，由 injectIntoDay 自己减去已排骨架块。
              // 传「剩余块数」会导致再减一次（上限 5、骨架 3 时被算成 −1），餐饮与酒馆全被压掉。
              //
              // +1 是「餐位补贴」：闭环引擎的 cap 只衡量可玩时间能放几块，而餐位（至少一顿）
              // 本就不占观光时间预算（injectIntoDay 里也一直用 max(1, …) 给餐位保底）。
              // 不补这 1 个名额，抵达日会只剩 1 个餐位，"一顿正餐 + 一处茶咖甜品"永远凑不齐，
              // 短行程于是整趟都坐不到咖啡馆（2026-10-11 实测）。
              capacityLeft: cap + MEAL_SLOT_BONUS,
            }
          )
        : keptConverted;
    for (const item of dayItemsFinal) {
      if (item.id.includes('-fnb-')) fnbUsed.add(item.placeId);
    }
    pickedItems.push(...dayItemsFinal);

    const suffix =
      role === 'departure' && newIdx === 0
        ? ''
        : role === 'transit'
          ? '・转场抵达'
          : role === 'return'
            ? '・返程收尾'
            : '';
    const lateArrival = (role === 'departure' || role === 'transit') && cap === 0;
    pickedDays.push({
      index: dayIndex,
      date: formatDayLabel(dateISO),
      dateISO,
      theme: lateArrival ? '抵达・落脚休整' : `${program.days[origDay].theme}${suffix}`,
      themeEn: lateArrival
        ? 'Arrival & Rest'
        : `${program.days[origDay].themeEn}${role === 'return' ? ' · Departure' : role === 'transit' ? ' · Transit' : ''}`,
      pace: program.days[origDay].pace,
    });

    // 剔除信息不丢：写在主题里留痕，用户可自行加回
    if (dropped.length > 0 && open.length >= 2) {
      const names = dropped.map((r) => r.place?.name).filter(Boolean).join('、');
      pickedDays[pickedDays.length - 1].pace = `${program.days[origDay].pace} · ${names}周一闭馆，本日未排`;
    }
  });

  return { days: pickedDays, items: pickedItems };
}

/** 取某天由闭环引擎给出的时间窗（没有约束时返回 null，按默认全天处理） */
function dayWindows(opts: CityPlanOptions, dayIdx: number): Span | null {
  const w = opts.windows?.[dayIdx];
  return w ?? null;
}

/** 兴趣标签的同义触发词（与 tripMath 的规则保持一致的口径） */
function extraKeys(tag: string): string[] {
  switch (tag) {
    case '书店':
      return ['阅读', '旧书', '书'];
    case '咖啡':
      return ['咖啡馆', '街角'];
    case '展览':
      return ['美术馆', '看展', '艺术'];
    case '夜市':
      return ['夜宵', '酒'];
    case '茶':
      return ['茶园', '茶山'];
    case '古城':
      return ['古镇', '历史'];
    case '海边':
      return ['海滩', '岛'];
    case '山野':
      return ['徒步', '爬山'];
    case '博物馆':
      return [];
    case '市集':
      return ['菜市场', '小店'];
    default:
      return [];
  }
}

/** 未显式给出出发日期时的默认值：今天起第 3 天 */
function fallbackStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

// ── 餐饮 · 茶咖 · 甜品的因人而异注入 ────────────────────────────

/** 稳定的字符串哈希（同一输入恒定，不同输入不同序）——"因人而异"的确定性来源 */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 与 tripMath.parseStartMinutes 同口径（复制一份避免循环依赖） */
function startMin(time: string): number {
  const m = time.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 餐饮选点池的类别范围 */
const FN_KINDS: string[] = ['food', 'cafe', 'tea', 'dessert'];

type FnKind = 'food' | 'cafe' | 'tea' | 'dessert';
function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mi = Math.round(m % 60);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** 行程块的占用区间：'09:00–11:00' → {lo,hi}；只有起点时按 90 分钟估算 */
function spanOf(time: string): Span | null {
  const toks = Array.from(time.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g)).map(
    (m) => Number(m[1]) * 60 + Number(m[2])
  );
  if (toks.length === 0) return null;
  const lo = toks[0];
  const hi = toks.length > 1 ? toks[toks.length - 1] : lo + 90;
  return { lo, hi: Math.max(hi, lo + 30) };
}

/** 把已占用区间合并后求空档（升序）；dayEnd 是一天的收尾线（夜生活意图时更晚） */
function freeGaps(spans: Span[], dayEnd: number = DAY_END_MIN, dayStart: number = DAY_START_MIN): Span[] {
  const merged: Span[] = [];
  for (const s of spans.slice().sort((a, b) => a.lo - b.lo)) {
    const last = merged[merged.length - 1];
    if (last && s.lo <= last.hi) last.hi = Math.max(last.hi, s.hi);
    else merged.push({ ...s });
  }
  const gaps: Span[] = [];
  let cursor = dayStart;
  for (const s of merged) {
    if (s.lo > cursor) gaps.push({ lo: cursor, hi: Math.min(s.lo, dayEnd) });
    cursor = Math.max(cursor, s.hi);
  }
  if (cursor < dayEnd) gaps.push({ lo: cursor, hi: dayEnd });
  return gaps.filter((g) => g.hi - g.lo >= 30);
}

/** 一天里想补进来的餐饮时段：午餐 / 下午茶 / 晚餐（按关键词决定先后） */
const FN_SLOTS: Array<{
  key: 'lunch' | 'tea' | 'dinner' | 'sweet';
  label: string;
  kinds: FnKind[];
  dur: number;
  /** 期望入座时间（用于在空档里挑最像饭点的那一段） */
  anchor: number;
  winLo: number;
  winHi: number;
}> = [
  { key: 'lunch', label: '午餐 · 就近吃当地', kinds: ['food'], dur: 60, anchor: 12 * 60 + 30, winLo: 11 * 60 + 30, winHi: 13 * 60 + 30 },
  { key: 'tea', label: '下午茶 · 茶咖甜品', kinds: ['cafe', 'tea', 'dessert'], dur: 45, anchor: 15 * 60 + 30, winLo: 14 * 60, winHi: 17 * 60 + 45 },
  { key: 'dinner', label: '晚餐 · 当地味', kinds: ['food'], dur: 75, anchor: 19 * 60, winLo: 17 * 60 + 15, winHi: 20 * 60 + 30 },
  { key: 'sweet', label: '甜品茶歇 · 歇个脚', kinds: ['dessert', 'cafe', 'tea'], dur: 30, anchor: 16 * 60 + 15, winLo: 13 * 60 + 30, winHi: 21 * 60 },
];

/**
 * 把「吃饭的地儿 + 茶咖甜品」补进一天，按真实空档落位。
 * 规则：
 *  1) 只在骨架没占用的空档里插，不覆盖已有行程（准确 > 数量）；
 *  2) 一天最多 3 处餐饮，其中"茶咖甜品"只放 1 处：一餐 + 一杯 + 一餐，合计不超 6 块；
 *  3) 选哪家店由「兴趣标签 + 输入关键词 + 稳定哈希」决定；
 *     茶咖甜品的店跨天不重复（是"特色"点位），正餐优先没去过的，
 *     池子用尽时允许回访一次老店 —— 宁可重复一家面馆，也不让某一天没有吃饭的地儿。
 */
function injectIntoDay(
  cityId: CityId,
  kept: ItineraryItem[],
  /** 餐饮选点池（地点库原始数据，只要最小字段） */
  pool: Array<{ id: string; name: string; kind: string; ticket: number; tip: string }>,
  text: string,
  tags: string[],
  dayIdx: number,
  seedText: string,
  usedAcrossDays: Set<string>,
  /** 小酒馆：用户写了酒吧/精酿/微醺才启用 */
  nightOpts?: {
    bars: Array<{ id: string; name: string; kind: string; ticket: number; tip: string }>;
    night: boolean;
    /** 当天的可用时间窗（抵达日不可能 12:30 就在城里吃饭） */
    window?: Span;
    /** 闭环引擎给出的剩余块数（抵达日 / 返程日可能只放得下 1 块） */
    capacityLeft?: number;
  }
): ItineraryItem[] {
  // 松弛有度：一天总块数封顶（骨架块 + 餐饮 + 酒馆）。默认 5（约 3 玩 + 2 吃），
  // 家庭 / 长辈出行 4，用户明确要"紧凑 / 特种兵"才放宽到 6（2026-10-10 用户反馈）。
  const DAY_CAP = INTENSE_RE.test(text) ? 6 : FAMILY_RE.test(text) ? 4 : 5;
  // 抵达日 / 返程日：当日上限由闭环引擎按可玩时间窗压缩，不再固定 5 块
  const dayCap = Math.max(1, Math.min(DAY_CAP, nightOpts?.capacityLeft !== undefined ? nightOpts.capacityLeft : DAY_CAP));
  const win = nightOpts?.window ?? { lo: DAY_START_MIN, hi: DAY_END_MIN };
  const MAX_FNB_PER_DAY = 3;
  const MAX_DRINK_PER_DAY = 1;
  const totalBudget = Math.max(1, dayCap - kept.length);
  const reserveBar = nightOpts?.night ? 1 : 0;
  const fnbBudget = Math.max(0, totalBudget - reserveBar);
  const usedIds = new Set(kept.map((i) => i.placeId));
  const used = new Set(usedIds);
  for (const id of usedAcrossDays) used.add(id);

  const busy: Span[] = [];
  for (const i of kept) {
    const s = spanOf(i.time);
    if (s) busy.push(s);
  }
  // 抵达日来得晚：空档从抵达时刻起算，不从 08:30 起算
  busy.push({ lo: -60, hi: win.lo } as Span);
  const gaps = () => freeGaps(busy, win.hi, Math.max(DAY_START_MIN, win.lo));

  // 顺序：先保证"茶咖甜品"排得进，再补午餐与晚餐（用户明确要的咖啡 / 茶 / 甜品店）；
  // 2026-10-10 起按意图排序：点了咖啡/茶/甜品的，饮品位最优先（宁可少一顿正餐也不丢点名的茶咖位）。
  // 2026-10-11 修正：没点名时由「午餐→晚餐→茶咖」改为「午餐→茶咖→晚餐」——
  // 闭环引擎把抵达日 / 返程日的块数上限压到 1–2 块后，按旧顺序一顿晚餐就把第二个名额吃掉，
  // 短行程于是整趟没有一处茶咖甜品（用户此前明确要求每个行程都能坐到咖啡馆）。
  // 晚餐位仍在队列里：只要当天还有第三个名额，晚餐照样排得进。
  const DRINK_INTENT_RE = /咖啡|咖啡馆|喝茶|茶馆|茶咖|甜品|奶茶|下午茶/;
  const order = DRINK_INTENT_RE.test(text)
    ? ['tea', 'lunch', 'sweet', 'dinner']
    : ['lunch', 'tea', 'dinner', 'sweet'];
  const isDrinkSlot = (slot: (typeof FN_SLOTS)[number]) =>
    slot.kinds.every((k) => k === 'cafe' || k === 'tea' || k === 'dessert');
  const slots = order
    .map((k) => FN_SLOTS.find((s) => s.key === k)!)
    .filter((s) =>
      pool.some(
        (p) =>
          s.kinds.includes(p.kind as FnKind) &&
          !(isDrinkSlot(s) && used.has(p.id)) // 茶咖甜品坚持不重复用店
      )
    );

  const picks: Array<{
    place: { id: string; name: string; kind: string; ticket: number; tip: string };
    slot: { label: string; dur: number };
    start: number;
    /** 为排进这一块而让位的骨架块（留痕用） */
    yields?: { name: string; span: Span };
  }> = [];
  let drinksPicked = 0;

  for (const slot of slots) {
    if (picks.length >= Math.min(MAX_FNB_PER_DAY, fnbBudget)) break;
    const drink = isDrinkSlot(slot);
    if (drink && drinksPicked >= MAX_DRINK_PER_DAY) continue;
    // 在剩余空档里挑「最像饭点」且放得下的那一段
    const fits = gaps()
      .map((g) => {
        const start = Math.min(Math.max(slot.anchor, g.lo), g.hi - slot.dur);
        const ok =
          start >= g.lo &&
          start >= slot.winLo &&
          start <= slot.winHi &&
          start + slot.dur <= g.hi;
        return ok ? { start, dist: Math.abs(start - slot.anchor) } : null;
      })
      .filter((x): x is { start: number; dist: number } => x !== null)
      .sort((a, b) => a.dist - b.dist || a.start - b.start);
    const placed = fits[0];
    if (!placed) continue;

    const score = (x: { id: string; name: string; kind: string; tip: string }) => {
      const hay = `${x.name}${x.kind}${x.tip}`;
      let s = 0;
      for (const t of tags) {
        const kk = TAG_KINDS[t];
        if (kk && kk.includes(x.kind)) s += 3;
        if (t.length >= 2 && hay.includes(t)) s += 2;
      }
      for (const rule of FOOD_RULES) {
        if (rule.keys.some((k) => text.includes(k)) && rule.kinds.includes(x.kind as FnKind)) s += 3;
      }
      s += (hashStr(`${cityId}-${dayIdx}-${x.id}-${seedText}`) % 97) / 100;
      return s;
    };
    const inSlot = pool.filter((x) => slot.kinds.includes(x.kind as FnKind));
    // 茶咖甜品：只用没去过的店；正餐：先用没去过的，池子见底时才允许回访老店
    const fresh = inSlot.filter((x) => !used.has(x.id));
    const candidates = (drink ? fresh : fresh.length > 0 ? fresh : inSlot)
      .map((x) => ({ x, s: drink && !fresh.includes(x) ? -1 : score(x) }))
      .sort((a, b) => b.s - a.s || a.x.id.localeCompare(b.x.id));
    const pick = candidates[0]?.x;
    if (!pick) continue;

    used.add(pick.id);
    if (drink) drinksPicked += 1;
    busy.push({ lo: placed.start, hi: placed.start + slot.dur });
    picks.push({ place: pick, slot, start: placed.start });
  }

  // 小酒馆：用户写了"酒吧 / 精酿 / 微醺 / 夜生活"→ 当天 20 点后补一家特色点位。
  // 只在放得下时排（同样计入当日总块数上限）；店跨天绝不重复（每家只去一次，宁缺毋滥）。
  // 用户点名要夜生活 → 属于"高优先级意图"：若当天傍晚已被骨架块占满，
  // 让当天最晚的那一块让位（在酒馆备注里留痕，用户可自行加回）。
  let yielded: { name: string; span: Span } | null = null;
  if (nightOpts?.night && nightOpts.bars.length > 0 && picks.length < totalBudget) {
    const dur = 75;
    const anchor = 21 * 60 + 15;
    const winLo = 20 * 60;
    const gapHi = Math.max(DAY_START_MIN, win.lo);
    const fitIn = (busyList: Span[]) =>
      freeGaps(busyList, win.hi, gapHi)
        .map((g) => {
          const start = Math.min(Math.max(anchor, g.lo), g.hi - dur);
          const ok = start >= g.lo && start >= winLo && start + dur <= g.hi;
          return ok ? { start, dist: Math.abs(start - anchor) } : null;
        })
        .filter((x): x is { start: number; dist: number } => x !== null)
        .sort((a, b) => a.dist - b.dist || a.start - b.start);

    let placed = fitIn(busy)[0];
    if (!placed) {
      const latest = kept
        .map((i) => ({ i, s: spanOf(i.time) }))
        .filter((x): x is { i: ItineraryItem; s: Span } => !!x.s && x.s.hi > winLo)
        .sort((a, b) => b.s.lo - a.s.lo)[0];
      if (latest) {
        const trial = busy.filter((b) => !(b.lo === latest.s.lo && b.hi === latest.s.hi));
        const fit2 = fitIn(trial)[0];
        if (fit2) {
          placed = fit2;
          yielded = { name: placeView(latest.i.placeId)?.name ?? '其中一个傍晚安排', span: latest.s };
        }
      }
    }

    const fresh = nightOpts.bars.filter((x) => !used.has(x.id));
    if (placed && fresh.length > 0) {
      // 榜内点名（输入里写了店名 / 酒系词）优先，其余按稳定哈希轮换，跨天不重样
      const pick = fresh
        .map((x) => ({
          x,
          s:
            (text.length >= 2 && `${x.name}${x.tip}`.includes(text.trim()) ? 2 : 0) +
            (hashStr(`${cityId}-${dayIdx}-${x.id}-${seedText}`) % 97) / 100,
        }))
        .sort((a, b) => b.s - a.s || a.x.id.localeCompare(b.x.id))[0]!.x;
      used.add(pick.id);
      busy.push({ lo: placed.start, hi: placed.start + dur });
      picks.push({
        place: pick,
        slot: { label: '小酒馆 · 微醺一把', dur },
        start: placed.start,
        ...(yielded ? { yields: yielded } : {}),
      });
    }
  }

  if (picks.length === 0) return kept;

  picks.sort((a, b) => a.start - b.start);

  // 让位的骨架块从当天移除（其名称已写进酒馆备注，用户可自行加回）
  const yieldedSpans = picks
    .map((p) => p.yields?.span)
    .filter((s): s is Span => !!s);
  const keptFinal = kept.filter((i) => {
    const s = spanOf(i.time);
    return !s || !yieldedSpans.some((y) => y.lo === s.lo && y.hi === s.hi);
  });

  const merged: ItineraryItem[] = [
    ...keptFinal,
    ...picks.map(({ place, slot, start, yields }, n) => ({
      id: `${cityId}-d${dayIdx + 1}-fnb-${n + 1}`,
      dayIndex: dayIdx,
      slot: (start < 17 * 60 ? 'afternoon' : 'evening') as ItineraryItem['slot'],
      time: `${fmtMin(start)}–${fmtMin(start + slot.dur)}`,
      placeId: place.id,
      note: `${slot.label.split(' · ')[0]}：${place.tip}${
        yields ? `（原定「${yields.name}」让位给夜生活，可自行加回）` : ''
      }`,
      transit: { mode: '步行', minutes: 12 },
      cost: place.ticket,
      costCategory: 'food' as const,
      roamKm: 0.6,
    })),
  ];
  return merged.sort((a, b) => {
    const ma = startMin(a.time);
    const mb = startMin(b.time);
    if (ma !== mb) return ma - mb;
    return a.id.localeCompare(b.id);
  });
}

/** 餐饮关键词规则（与 TAG_KINDS 同口径） */
const FOOD_RULES: Array<{ keys: string[]; kinds: Array<'food' | 'cafe' | 'tea' | 'dessert'> }> = [
  { keys: ['咖啡', '咖啡馆'], kinds: ['cafe'] },
  { keys: ['茶', '茶馆', '奶茶'], kinds: ['tea'] },
  { keys: ['甜品', '糖水', '糕点'], kinds: ['dessert'] },
  { keys: ['吃', '美食', '小吃', '夜市', '米干', '面'], kinds: ['food'] },
];

/** 把闭环引擎给出的「逐日角色 / 容量 / 时间窗」整理成单城精排能吃的入参 */
/**
 * 组装行程。
 * days / startDate / keywords / origin / route 全部来自用户输入：
 * 写两天就排两天，写哪天出发就从哪天开始排；多城市按顺序串起来。
 *
 * 关键：**先算闭环时间账（去程、城际、返程与每日可玩窗口），再排每天的景点**。
 * 抵达日与返程日会按真实时间窗自动少排，绝不出现「交通还没完成、景点已经开始」。
 */
export function createTrip(cityId: CityId, opts: CurateOptions = {}): Trip {
  const city = getCity(cityId) ?? getCity('shanghai')!;
  const route = (opts.route && opts.route.length > 0 ? opts.route : [city.id]).slice();
  const journeyInput: JourneyInput = {
    origin: opts.origin ?? '',
    route,
    days: opts.days ?? DEFAULT_TRIP_DAYS,
    startDate: opts.startDate ?? '',
    returnMode: opts.returnMode ?? 'round-trip',
    oneWay: opts.oneWay ?? false,
    departPref: opts.departPref ?? 'auto',
    returnPref: opts.returnPref ?? 'auto',
  };

  // 第一步：闭环时间账（不依赖景点，先知道每天能玩多久）
  const plan = planJourneyLegs(journeyInput);

  // 装配地点视图（所有到访城市都要登记，多城市行程里地图与照片才找得到点）
  for (const id of route) {
    for (const pl of placesOfCity(id)) {
      PLACE_VIEW[pl.id] = toTripPlace(pl);
    }
  }

  // 第二步：逐城排天 —— 每天放几块由当日可玩时间窗决定（抵达日 / 返程日天然放得少）
  const constraints = dayConstraints(plan);
  const pickedDays: TripDay[] = [];
  const pickedItems: ItineraryItem[] = [];
  let offset = 0;
  for (const id of route) {
    const program = PROGRAMS[id];
    const block = plan.days.filter((d) => d.cityId === id);
    if (!program || block.length === 0) continue;
    const mine = constraints.slice(offset, offset + block.length);
    const built = planCityDays(program, id, {
      ...opts,
      days: block.length,
      startDate: block[0].dateISO || opts.startDate,
      dayOffset: offset,
      caps: mine.map((d) => d.capacity),
      roles: block.map((d) => d.role),
      windows: mine.map((d) => (d.windows.length > 0 ? d.windows[0] : null)),
      travel: mine.map((d) => d.travelMinutes + d.accessMinutes),
    });
    pickedDays.push(...built.days);
    pickedItems.push(...built.items);
    offset += block.length;
  }

  const start = pickedDays[0]?.dateISO ?? journeyInput.startDate ?? fallbackStart();
  const end = pickedDays[pickedDays.length - 1]?.dateISO ?? start;
  const lastCity = getCity(route[route.length - 1] as CityId) ?? city;
  const routeNames = route.map((id) => getCity(id)?.name ?? id);

  return {
    id: `${route.join('-')}-${pickedDays.length}d`,
    title:
      route.length > 1
        ? `${routeNames.join(' · ')} · 一路向西`
        : `${city.name} · 街巷与书页`,
    titleEn:
      route.length > 1
        ? `${routeNames.join(' · ')} · The Long Way`
        : `${city.nameEn} · Lanes & Pages`,
    destination: lastCity.name,
    origin: opts.origin ?? '',
    startDate: start,
    endDate: end,
    days: pickedDays,
    items: pickedItems,
    preference: '书店、街巷与当地的一口热食；不赶路。',
    companions: '独行',
    travelers: 1,
    currency: TRIP_CURRENCY,
    journey: journeyInput,
  };
}
