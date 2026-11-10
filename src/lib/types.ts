// Link-R World — 领域类型定义

/** 五 R 语义角色 */
export type FiveR = 'roam' | 'route' | 'relate' | 'real' | 'remember';

/** 行程块的费用分类（用于预算拆解） */
export type CostCategory = 'ticket' | 'food' | 'transit' | 'shop' | 'other';

/** 时段 */
export type TimeSlot = 'morning' | 'afternoon' | 'evening';

/** 地点信息状态：stable = 常规稳定；check = 时段/票价可能变动，出发前再确认一次 */
export type PlaceStatus = 'stable' | 'check';

export interface Place {
  id: string;
  name: string;
  nameEn: string;
  /** 行政区／片区 */
  district: string;
  /** 纬度（WGS84，示意地图排布用） */
  lat: number;
  lng: number;
  status: PlaceStatus;
  /** 类别标签 */
  kind: string;
  /** 门票（元/人），0 = 免费 */
  ticket: number;
  /** 开放时间（官方公示口径） */
  hours: string;
  /** 真实、可执行的提示 */
  tip: string;
  /** 信息来源（地址 / 官方渠道描述） */
  source: string;
}

export interface ItineraryItem {
  id: string;
  dayIndex: number;
  slot: TimeSlot;
  /** 展示用时段，如 "09:30–11:30" */
  time: string;
  placeId: string;
  /** 体验提示 */
  note: string;
  /** 通勤方式与时长 */
  transit: { mode: string; minutes: number; needCheck?: boolean };
  cost: number;
  costCategory: CostCategory;
  /** 该块的漫游里程（用于 Roam 进度） */
  roamKm?: number;
  /** 该块记录的一次"相遇"（用于 Relate 进度） */
  relate?: { with: string; line: string };
}

/* ── 旅行闭环：去程 / 返程 / 城市间交通 ─────────────────────── */

/** 交通段类型：outbound 去程 · return 返程 · intercity 城市间 · access 站内接驳 */
export type LegKind = 'access' | 'outbound' | 'return' | 'intercity';

/** 交通段：从"离开出发地点"到"抵达落脚点"的完整区间（含接驳与候车） */
/** 一段大交通的票价口径（估算 / 待确认；用户录入实价后由票价账本升级为「已查实时」） */
export interface LegFare {
  /** 交通方式键（与 transport.TransportModeKey 对齐；同城接驳为 'none'） */
  modeKey: string;
  /** 是否直达（不含中转） */
  direct: boolean;
  /** 中转说明（直达为空串） */
  transfer: string;
  /** 单人单程区间（元） */
  low: number;
  high: number;
  /** estimate = 明确标注的估算；unconfirmed = 班次未定，需要用户确认 */
  status: 'estimate' | 'unconfirmed';
  /** 口径来源（写在界面上） */
  source: string;
  /** 口径生成时间（ISO 日期） */
  asOf: string;
  /** 官方查询入口 */
  queryUrl: string;
  queryLabel: string;
}

export interface TripLeg {
  id: string;
  kind: LegKind;
  /** 该段所在的行程日（0-based）；跨日段记在出发日 */
  dayIndex: number;
  dateISO: string;
  from: string;
  to: string;
  mode: string;
  /** 离开出发地点的时刻（分钟，自当日 00:00 起）——含接驳与候车的开始 */
  startMin: number;
  /** 抵达落脚点的时刻（跨日抵达 > 1440） */
  endMin: number;
  /** 枢纽之间的实际出发 / 抵达时刻（航班 / 列车本身） */
  hubStartMin: number;
  hubEndMin: number;
  /** 在途分钟数（不含接驳与候车） */
  minutes: number;
  /** 出发地 → 枢纽 + 候车（分钟） */
  accessBefore: number;
  /** 枢纽 → 落脚点（分钟） */
  accessAfter: number;
  /** 票价与口径（无大交通的段为 null） */
  fare: LegFare | null;
  /** 展示用全程区间，如 '06:15–16:17' */
  time: string;
  /** 展示用在途区间，如 '08:30–15:32' */
  hubTime: string;
  /** 是否已确认：false = 按区间估算 / 待确认，绝不代表已预订 */
  confirmed: boolean;
  /** 排布依据（透明口径，写在界面上） */
  basis: string;
  /** 跨日段（夜车 / 红眼航班） */
  overnight: boolean;
}

/** 当日角色：departure 出发抵达日 · full 完整游玩日 · transit 城市间转移日 · return 返程日 */
export type JourneyRole = 'departure' | 'full' | 'transit' | 'return';

export interface Span {
  lo: number;
  hi: number;
}

/** 单日时间预算：窗口 → 扣掉必要项 → 实际可游玩 */
export interface DayBudget {
  dayIndex: number;
  dateISO: string;
  /** 当日所在城市 */
  city: string;
  role: JourneyRole;
  /** 可安排活动的时间窗（分钟区间；可能为空） */
  windows: Span[];
  windowMinutes: number;
  /** 当日交通在途（去 / 返 / 城际） */
  travelMinutes: number;
  /** 当日接驳与候车 */
  accessMinutes: number;
  /** 未被行程块覆盖的用餐预留 */
  mealMinutes: number;
  /** 抵达休整 */
  restMinutes: number;
  /** 块间缓冲 */
  bufferMinutes: number;
  /** 实际可用于游玩（= 窗口 − 用餐 − 缓冲） */
  playMinutes: number;
  /** 已排行程块时长合计 */
  plannedMinutes: number;
  /** 生成器当日还能放几块（按每块 ≈ 2 小时） */
  capacity: number;
  note: string;
}

export interface FeasibilityIssue {
  code:
    | 'origin-missing'
    | 'arrival-too-late'
    | 'return-too-early'
    | 'day-no-play-time'
    | 'travel-too-long'
    | 'not-enough-play-time'
    | 'activity-before-arrival'
    | 'activity-after-return'
    | 'activity-outside-window'
    | 'leg-overlap';
  severity: 'warn' | 'block';
  dayIndex: number | null;
  message: string;
}

export interface TripFeasibility {
  status: 'ok' | 'tight' | 'infeasible';
  issues: FeasibilityIssue[];
  suggestions: string[];
  /** 时间不够时建议的最少天数（受目的地骨架上限约束） */
  suggestedDays: number | null;
}

/** 旅行闭环的完整时间账本 */
export interface TripLifecycle {
  mode: 'round-trip' | 'open-jaw';
  /** 用户明确要单程 */
  oneWay: boolean;
  origin: string;
  returnTo: string;
  route: string[];
  departDate: string;
  returnDate: string;
  /** 去程枢纽出发 / 抵达目的地时刻（分钟） */
  outboundDepartMin: number;
  outboundArriveMin: number;
  /** 返程出发 / 抵达结束地时刻（分钟） */
  returnDepartMin: number;
  returnArriveMin: number;
  /** 日历天数（首尾都算） */
  calendarDays: number;
  /** 旅行总时长：去程实际出发 → 返程抵达结束地 */
  totalMinutes: number;
  /** 往返交通（在途 + 接驳候车） */
  travelMinutes: number;
  /** 城市间交通与接驳 */
  intercityMinutes: number;
  /** 实际可用于游玩（全部日期之和） */
  playMinutes: number;
  playMinutesByDay: number[];
  legs: TripLeg[];
  days: DayBudget[];
  feasibility: TripFeasibility;
  /** ≤5 天直飞优先规则的结论（无去程方案时为 null） */
  directFlight?: import('./transport').DirectFlightRule | null;
  /** 大交通推荐理由（一句话） */
  recommendReason?: string;
  /** 数据缺失 / 待确认项（不得当作已确认信息展示） */
  pending: string[];
  /** 全程口径说明 */
  note: string;
}

/** 闭环引擎的输入（随 Trip 一起留存，便于编辑后重算） */
export interface JourneyInput {
  origin: string;
  /** 到访城市（有序，CityId） */
  route: string[];
  days: number;
  startDate: string;
  returnMode: 'round-trip' | 'open-jaw';
  oneWay: boolean;
  /** 去程出发时段偏好 */
  departPref: 'auto' | 'morning' | 'afternoon' | 'evening';
  /** 返程出发时段偏好 */
  returnPref: 'auto' | 'morning' | 'afternoon' | 'evening';
  /** 口径生成时间（ISO），用于「估算 / 查询时间」展示与测试固定；缺省取当前日期 */
  now?: string;
}

export interface TripDay {
  index: number;
  /** 展示用日期，如 "10 月 13 日 周二" */
  date: string;
  /** ISO 日期（yyyy-mm-dd），用于计算星期与闭馆日冲突 */
  dateISO: string;
  theme: string;
  themeEn: string;
  /** 当日基调说明 */
  pace: string;
}

export interface Trip {
  id: string;
  title: string;
  titleEn: string;
  /** 目标城市 */
  destination: string;
  /** 出发地（用户填写，可空） */
  origin: string;
  startDate: string;
  endDate: string;
  days: TripDay[];
  items: ItineraryItem[];
  /** 自然语言输入写进这里，作为偏好描述 */
  preference: string;
  /** 口径脚注（如周末口径：周五晚出发 · 周日返回出发地），由一致性检查给出 */
  note?: string;
  companions: string;
  travelers: number;
  currency: string;
  /** 旅行闭环输入（去程 / 返程 / 城际交通与每日时间预算由它推导） */
  journey?: JourneyInput;
}

export interface MemoryEntry {
  id: string;
  dateLabel: string;
  placeId: string;
  title: string;
  body: string;
  /** Remember 语义色标用的标签 */
  tag: string;
  createdAt: number;
}

export interface GeneratedTrip extends Trip {
  memory: MemoryEntry[];
}
