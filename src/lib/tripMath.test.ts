// Link-R World — 纯函数单元测试
//
// 覆盖两类断言：
//   1) 通用纯函数（时间解析、排序、预算、投影、进度）的确定性与边界行为；
//   2) 十座上线城市的行程不变量（天数、地点可解析、门票单一来源、预算勾稽）。
// 期望值全部由数据推导，不写死具体数字，避免"改了数据测试就红"。

import { describe, expect, it } from 'vitest';
import { CITIES, CITY_BY_ID, currentMonth, getCity, seasonOfMonth, type CityId } from '../data/cities';
import { getPlace } from '../data/places';
import { MAX_TRIP_DAYS, ROAM_COMFORT_KM_PER_DAY, createTrip, placeView, tripPlacesOfCity } from '../data/tripData';
import {
  FIVE_R_META,
  bboxOf,
  budgetSummary,
  cityOfTrip,
  dayItems,
  dayRoamKm,
  durationMinutes,
  estimateTransitCost,
  fiveRProgress,
  formatCNY,
  paceOf,
  parseDateFromInput,
  parseDaysFromInput,
  parseStartMinutes,
  placesInTrip,
  placesNotInTrip,
  progressOf,
  project,
  sumCost,
  summarizePrompt,
} from './tripMath';
import { buildMood } from './mood';
import type { MemoryEntry, Trip } from './types';

const CITY_IDS: CityId[] = [
  'shanghai',
  'beijing',
  'suzhou',
  'hangzhou',
  'wuxi',
  'puer',
  'xishuangbanna',
  'dali',
  'tengchong',
  'lijiang',
  'xian',
  'quanzhou',
  'chengdu',
];

const noMemory: MemoryEntry[] = [];
const trips: Record<string, Trip> = Object.fromEntries(CITY_IDS.map((id) => [id, createTrip(id)]));
const shanghai = trips.shanghai;

// ── 通用纯函数 ────────────────────────────────────────────────

describe('时间解析', () => {
  it('解析标准时段', () => {
    expect(parseStartMinutes('09:30–11:15')).toBe(570);
    expect(parseStartMinutes('18:30–21:00')).toBe(1110);
  });

  it('对非法输入返回 null 而不是猜测', () => {
    expect(parseStartMinutes('')).toBeNull();
    expect(parseStartMinutes('上午')).toBeNull();
    expect(parseStartMinutes('25:99')).toBeNull();
  });

  it('计算时段时长', () => {
    expect(durationMinutes('09:30–11:15')).toBe(105);
    expect(durationMinutes('18:30–21:00')).toBe(150);
    expect(durationMinutes('没有横线')).toBeNull();
    expect(durationMinutes('11:00–11:00')).toBeNull();
  });
});

describe('节奏判断', () => {
  it('按舒适上限划分留白 / 舒适 / 偏满', () => {
    const limit = ROAM_COMFORT_KM_PER_DAY;
    expect(paceOf(0, limit)).toBe('light');
    expect(paceOf(limit * 0.5, limit)).toBe('light');
    expect(paceOf(limit * 0.9, limit)).toBe('comfortable');
    expect(paceOf(limit, limit)).toBe('comfortable');
    expect(paceOf(limit * 1.5, limit)).toBe('full');
    expect(paceOf(Number.NaN, limit)).toBe('light');
  });
});

describe('进度比例', () => {
  it('被夹在 0..1，非法输入归零', () => {
    expect(progressOf(50, 100)).toBeCloseTo(0.5, 6);
    expect(progressOf(200, 100)).toBe(1);
    expect(progressOf(-5, 100)).toBe(0);
    expect(progressOf(5, 0)).toBe(0);
    expect(progressOf(Number.NaN, 10)).toBe(0);
  });
});

describe('金额格式化', () => {
  it('使用人民币符号并四舍五入', () => {
    expect(formatCNY(1293)).toBe('¥1,293');
    expect(formatCNY(0)).toBe('¥0');
    expect(formatCNY(Number.NaN)).toBe('¥0');
  });
});

describe('地图投影', () => {
  it('空输入返回安全包围盒', () => {
    const b = bboxOf([]);
    expect(b.maxLat).toBeGreaterThan(b.minLat);
    expect(b.maxLng).toBeGreaterThan(b.minLng);
  });

  it('单点也能得到非退化包围盒', () => {
    const b = bboxOf([{ lat: 31.23, lng: 121.47 }]);
    expect(b.maxLat - b.minLat).toBeGreaterThan(0);
    expect(b.maxLng - b.minLng).toBeGreaterThan(0);
  });

  it('各城行程点投影后都落在画布内部', () => {
    for (const id of CITY_IDS) {
      const places = placesInTrip(trips[id]);
      const ctx = { bbox: bboxOf(places), width: 400, height: 520, padding: 24 };
      for (const p of places) {
        const { x, y } = project(p, ctx);
        expect(x, `${id}:${p.name}`).toBeGreaterThanOrEqual(ctx.padding - 0.001);
        expect(x, `${id}:${p.name}`).toBeLessThanOrEqual(ctx.width - ctx.padding + 0.001);
        expect(y, `${id}:${p.name}`).toBeGreaterThanOrEqual(ctx.padding - 0.001);
        expect(y, `${id}:${p.name}`).toBeLessThanOrEqual(ctx.height - ctx.padding + 0.001);
      }
    }
  });

  it('退化包围盒时安全居中而不是抛错', () => {
    const ctx = {
      bbox: { minLat: 31.2, maxLat: 31.2, minLng: 121.4, maxLng: 121.4 },
      width: 400,
      height: 400,
      padding: 20,
    };
    const { x, y } = project({ lat: 31.2, lng: 121.4 }, ctx);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(x).toBeCloseTo(200, 6);
    expect(y).toBeCloseTo(200, 6);
  });

  it('纬度更大的点更靠上（y 更小）', () => {
    const ctx = { bbox: bboxOf(tripPlacesOfCity('shanghai')), width: 400, height: 400, padding: 20 };
    const north = project({ lat: 31.26, lng: 121.47 }, ctx);
    const south = project({ lat: 31.19, lng: 121.47 }, ctx);
    expect(north.y).toBeLessThan(south.y);
  });
});

// ── 天数 / 日期驱动的行程规划 ─────────────────────────────────

describe('输入识别：天数与出发日期', () => {
  it('识别阿拉伯数字与中文数字天数', () => {
    expect(parseDaysFromInput('10月13号去上海 2天')).toBe(2);
    expect(parseDaysFromInput('玩5天')).toBe(5);
    expect(parseDaysFromInput('三日游')).toBe(3);
    expect(parseDaysFromInput('两个人去苏州')).toBeNull();
    expect(parseDaysFromInput('周末去杭州')).toBe(2);
    expect(parseDaysFromInput('')).toBeNull();
  });

  it('识别出发日期并归一为 ISO', () => {
    expect(parseDateFromInput('10月13号去上海')).toBe('2026-10-13');
    expect(parseDateFromInput('4 月 13 日去西安')).toBe(`${new Date().getFullYear()}-04-13`);
    expect(parseDateFromInput('2026-10-13 出发')).toBe('2026-10-13');
    expect(parseDateFromInput('明天出发')).toBeNull();
  });
});

describe('天数与日期驱动行程', () => {
  it('不传天数时默认 5 天，逐日有行程块', () => {
    for (const id of CITY_IDS) {
      const t = createTrip(id);
      expect(t.days, id).toHaveLength(5);
      expect(t.days.every((d) => dayItems(t.items, d.index).length >= 2), id).toBe(true);
    }
  });

  it('写几天就排几天：2 天 → 2 天，1 天 → 1 天', () => {
    expect(createTrip('shanghai', { days: 2 }).days).toHaveLength(2);
    expect(createTrip('shanghai', { days: 2 }).items.every((i) => i.dayIndex < 2)).toBe(true);
    expect(createTrip('chengdu', { days: 1 }).days).toHaveLength(1);
    const one = createTrip('chengdu', { days: 1 });
    expect(one.items.length).toBeGreaterThanOrEqual(2);
    expect(one.items.every((i) => i.dayIndex === 0)).toBe(true);
  });

  it('天数超过精选上限时收敛到上限，绝不虚构额外日子', () => {
    const t = createTrip('beijing', { days: 9 });
    expect(t.days).toHaveLength(MAX_TRIP_DAYS);
    expect(new Set(t.items.map((i) => i.dayIndex)).size).toBeLessThanOrEqual(5);
  });

  it('出发日期驱动逐日日期（写哪天就从哪天开始）', () => {
    const t = createTrip('xian', { days: 3, startDate: '2026-10-13' });
    expect(t.days.map((d) => d.dateISO)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    expect(t.startDate).toBe('2026-10-13');
    expect(t.endDate).toBe('2026-10-15');
    expect(t.days[0].date).toContain('周二');
  });

  it('周一出发时自动避开周一闭馆的地点，并在当日基调里留痕', () => {
    // 2026-10-12 是周一：上海 D1 的豫园（周一闭园）应被剔除
    const t = createTrip('shanghai', { startDate: '2026-10-12' });
    const d1 = dayItems(t.items, 0).map((i) => i.placeId);
    expect(d1).not.toContain('sh-yu');
    expect(d1.length).toBeGreaterThanOrEqual(2);
    expect(t.days[0].pace).toContain('周一闭馆');
  });

  it('关键词驱动精排：写书店就排进书店，景点不超精排上限，餐饮只做补充', () => {
    const t = createTrip('shanghai', { days: 3, keywords: '想逛书店，慢慢走' });
    const kinds = t.items.map((i) => placeView(i.placeId)!.kind);
    expect(kinds).toContain('bookstore');
    for (let d = 0; d < t.days.length; d++) {
      const list = dayItems(t.items, d);
      // 景点块遵守精排上限（3），餐饮补充块（id 含 fnb）另计但最多 3 块
      expect(list.filter((i) => !i.id.includes('-fnb-')).length, `D${d + 1} 景点`).toBeLessThanOrEqual(3);
      expect(list.filter((i) => i.id.includes('-fnb-')).length, `D${d + 1} 餐饮`).toBeLessThanOrEqual(3);
      expect(list.length, `D${d + 1} 合计`).toBeGreaterThanOrEqual(2);
    }
    // 个性化：输入写了咖啡，应出现咖啡/茶类点位
    const withCoffee = createTrip('shanghai', { days: 2, keywords: '想喝咖啡，逛书店' });
    const coffeeKinds = withCoffee.items.map((i) => placeView(i.placeId)?.kind ?? '');
    expect(coffeeKinds.some((k) => k === 'cafe' || k === 'tea')).toBe(true);
  });

  it('不同关键词得到不同的路线（个性化，非固定样例）', () => {
    const a = createTrip('chengdu', { days: 2, keywords: '想看大熊猫和博物馆' });
    const b = createTrip('chengdu', { days: 2, keywords: '想喝茶，逛老街' });
    const ids = (t: typeof a) => t.items.map((i) => i.placeId).join(',');
    expect(ids(a)).not.toBe(ids(b));
  });

  it('每块仍有唯一 id 且地点全部可解析', () => {
    for (const id of CITY_IDS) {
      for (const opt of [{ days: 2 }, { days: 4, startDate: '2026-10-13' }]) {
        const t = createTrip(id, opt);
        expect(new Set(t.items.map((i) => i.id)).size, id).toBe(t.items.length);
        expect(t.items.every((i) => placeView(i.placeId)), id).toBe(true);
      }
    }
  });
});

// ── 十城行程不变量 ────────────────────────────────────────────

describe('十城行程不变量', () => {
  it('上线城市清单与 city 注册表一致', () => {
    expect(CITIES.map((c) => c.id)).toEqual(CITY_IDS);
    for (const id of CITY_IDS) {
      const t = trips[id];
      expect(t.destination).toBe(CITY_BY_ID[id].name);
      expect(cityOfTrip(t).id).toBe(id);
    }
  });

  it('每座城市都是 5 天、逐日有行程块、日期连续', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      expect(t.days, id).toHaveLength(5);
      expect(t.items.length, id).toBeGreaterThan(0);
      for (let d = 0; d < 5; d++) {
        expect(dayItems(t.items, d).length, `${id} D${d + 1}`).toBeGreaterThan(0);
      }
      // dayIndex 必须落在 0..4
      expect(t.items.every((i) => i.dayIndex >= 0 && i.dayIndex < 5), id).toBe(true);
      // 日期首尾相接
      expect(t.startDate < t.endDate, id).toBe(true);
    }
  });

  it('骨架书写顺序与 dayIndex 分组单调一致（防天分界错位）', () => {
    for (const id of CITY_IDS) {
      const idx = trips[id].items.map((i) => i.dayIndex);
      for (let k = 1; k < idx.length; k++) {
        expect(idx[k], `${id} 第 ${k + 1} 块`).toBeGreaterThanOrEqual(idx[k - 1]);
      }
      expect(idx[0], id).toBe(0);
      expect(idx[idx.length - 1], id).toBe(4);
    }
  });

  it('每座城市逐日的行程块按开始时间升序', () => {
    for (const id of CITY_IDS) {
      for (let d = 0; d < 5; d++) {
        const mins = dayItems(trips[id].items, d).map((i) => parseStartMinutes(i.time) ?? -1);
        expect(mins, `${id} D${d + 1}`).toEqual([...mins].sort((a, b) => a - b));
      }
    }
  });

  it('每个 placeId 都能在地点库与展示视图中解析', () => {
    for (const id of CITY_IDS) {
      for (const item of trips[id].items) {
        const raw = getPlace(item.placeId);
        const view = placeView(item.placeId);
        expect(raw, `${id}/${item.placeId}`).toBeDefined();
        expect(view, `${id}/${item.placeId}`).toBeDefined();
        // 地点必须属于该城市
        expect(raw!.cityId, `${id}/${item.placeId}`).toBe(id);
        expect(view!.name).toBe(raw!.name);
      }
    }
  });

  it('门票类行程块费用严格等于地点库 ticket（单一来源）', () => {
    for (const id of CITY_IDS) {
      for (const item of trips[id].items) {
        if (item.costCategory !== 'ticket') continue;
        const place = getPlace(item.placeId)!;
        expect(item.cost, `${id}/${item.placeId}`).toBe(place.ticket);
      }
    }
  });

  it('预算分项合计与总额勾稽，逐日合计等于行程块总额', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const b = budgetSummary(t);
      const rawSum = sumCost(t.items);
      expect(b.itemsTotal, id).toBeCloseTo(rawSum, 6);
      expect(b.total, id).toBeCloseTo(b.itemsTotal + b.transitTotal, 6);
      const catSum = b.byCategory.reduce((s, c) => s + c.amount, 0);
      expect(catSum, id).toBeCloseTo(b.total, 6);
      const perDaySum = b.perDay.reduce((a, c) => a + c, 0);
      expect(perDaySum, id).toBeCloseTo(b.itemsTotal, 6);
      expect(b.avgPerDay, id).toBe(Math.round(b.total / 5));
    }
  });

  it('市内交通按费率逐段累加，与行程块条数上限一致', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const est = estimateTransitCost(t.items);
      expect(est, id).toBeGreaterThan(0);
      // 每段费率最低 0（步行），最高 150（包车）
      expect(est, id).toBeLessThanOrEqual(150 * t.items.length);
    }
  });

  it('同行人数线性放大总预算', () => {
    const b1 = budgetSummary(shanghai);
    const b3 = budgetSummary({ ...shanghai, travelers: 3 });
    expect(b1.travelers).toBe(1);
    expect(b1.totalForParty).toBeCloseTo(b1.total, 6);
    expect(b3.totalForParty).toBeCloseTo(b3.total * 3, 6);
  });

  it('行程内地点去重，且与"未排入"地点互斥互补', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const used = placesInTrip(t);
      expect(new Set(used.map((p) => p.id)).size, id).toBe(used.length);
      const usedIds = new Set(used.map((p) => p.id));
      const spare = placesNotInTrip(t);
      expect(spare.every((p) => !usedIds.has(p.id)), id).toBe(true);
      expect(usedIds.size + spare.length, id).toBe(tripPlacesOfCity(id).length);
    }
  });
});

// ── 五 R 进度 ─────────────────────────────────────────────────

describe('五 R 进度', () => {
  it('维度顺序与语义色取自旅行手账色板', () => {
    const rows = fiveRProgress(shanghai, noMemory);
    expect(rows.map((r) => r.key)).toEqual(['roam', 'route', 'relate', 'real', 'remember']);
    expect(rows.map((r) => r.color)).toEqual(FIVE_R_META.map((m) => m.color));
    expect(rows.map((r) => r.color)).toEqual([
      '#0B3A5B',
      '#46628A',
      '#C8862F',
      '#4F7F78',
      '#7C5A82',
    ]);
  });

  it('Roam 里程等于逐日漫游之和，上限为天数 × 舒适里程', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const roam = fiveRProgress(t, noMemory).find((r) => r.key === 'roam')!;
      const manual = t.days.reduce((s, d) => s + dayRoamKm(t.items, d.index), 0);
      expect(roam.value, id).toBeCloseTo(manual, 6);
      expect(roam.target, id).toBe(5 * ROAM_COMFORT_KM_PER_DAY);
      expect(roam.display).toBe(`${manual.toFixed(1)} km`);
      expect(roam.ratio).toBeGreaterThanOrEqual(0);
      expect(roam.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('Route 统计不需要再确认的通勤段', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const route = fiveRProgress(t, noMemory).find((r) => r.key === 'route')!;
      const done = t.items.filter((i) => !i.transit?.needCheck).length;
      expect(route.value, id).toBe(done);
      expect(route.target, id).toBe(t.items.length);
      expect(route.display, id).toBe(`${done}/${t.items.length} 段已排定`);
    }
  });

  it('Relate 统计带相遇记录的行程块', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const relate = fiveRProgress(t, noMemory).find((r) => r.key === 'relate')!;
      const n = t.items.filter((i) => i.relate).length;
      expect(relate.value, id).toBe(n);
      expect(relate.display, id).toBe(`${n} 次相遇`);
    }
  });

  it('Real 统计开放时段稳定的地点', () => {
    for (const id of CITY_IDS) {
      const t = trips[id];
      const real = fiveRProgress(t, noMemory).find((r) => r.key === 'real')!;
      const views = t.items.map((i) => placeView(i.placeId)!);
      const stable = views.filter((p) => p.status === 'stable').length;
      expect(real.value, id).toBe(stable);
      expect(real.target, id).toBe(views.length);
      expect(real.display, id).toBe(`${stable}/${views.length} 时段已对齐`);
      expect(real.value, id).toBeLessThanOrEqual(real.target);
    }
  });

  it('Remember 由记忆数据驱动', () => {
    const before = fiveRProgress(shanghai, noMemory).find((r) => r.key === 'remember')!;
    expect(before.value).toBe(0);
    expect(before.ratio).toBe(0);
    const withMemory = fiveRProgress(shanghai, [
      { id: 'm1', dateLabel: '', placeId: 'sh-museum', title: '', body: '', tag: '', createdAt: 1 },
    ]).find((r) => r.key === 'remember')!;
    expect(withMemory.value).toBe(1);
    expect(withMemory.ratio).toBe(1);
  });

  it('每条进度行的 ratio 都被夹在 0..1', () => {
    for (const id of CITY_IDS) {
      for (const row of fiveRProgress(trips[id], noMemory)) {
        expect(row.ratio, `${id}/${row.key}`).toBeGreaterThanOrEqual(0);
        expect(row.ratio, `${id}/${row.key}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ── 旅行情绪引擎 ──────────────────────────────────────────────

describe('旅行情绪引擎（城市性格 × 输入）', () => {
  it('命中主题关键词时回该城市对应的文艺主题', () => {
    const sh = getCity('shanghai')!;
    const mood = buildMood(sh, '想逛书店，也想喝咖啡');
    expect(mood.themeEn).toBe('Lanes & Pages');
    expect(mood.themeLine).toBe('弄堂尽头的灯，和一页没读完的书');
    expect(mood.titleShort).toBe('弄堂尽头的灯');
  });

  it('未命中关键词时回落到城市intro，不编造', () => {
    const cd = getCity('chengdu')!;
    const mood = buildMood(cd, '');
    expect(mood.themeLine).toBe(cd.intro);
    expect(mood.themeEn).toBe('The City Itself');
  });

  it('配色与穿搭来自城市档案，条数与结构确定', () => {
    for (const id of CITY_IDS) {
      const city = getCity(id)!;
      const mood = buildMood(city, '慢一点，不赶路');
      expect(mood.palette, id).toBe(city.palette);
      expect(mood.palette.length, id).toBe(5);
      // 不传月份时按当前月取穿搭口径
      expect(mood.outfit.summary, id).toBe(city.outfit.summary[seasonOfMonth(currentMonth())]);
      expect(mood.outfit.items.length, id).toBeGreaterThan(0);
      expect(mood.keywords, id).toEqual(city.character.slice(0, 3));
      // "不赶路" 命中慢节奏提醒
      expect(mood.outfit.notes.length, id).toBeGreaterThan(0);
    }
  });

  it('同一输入 + 同一城市输出恒定（无随机）', () => {
    const a = buildMood(getCity('quanzhou')!, '想去看簪花和古厝');
    const b = buildMood(getCity('quanzhou')!, '想去看簪花和古厝');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ── 自然语言 → 行程标题映射 ───────────────────────────────────

describe('旅行愿望映射（确定性，城市联动）', () => {
  it('从输入中识别城市，覆盖十城全部名称', () => {
    for (const id of CITY_IDS) {
      const name = CITY_BY_ID[id].name;
      const r = summarizePrompt(`四月想去${name}走走`, 'shanghai');
      expect(r.cityId, name).toBe(id);
      expect(r.destination, name).toBe(name);
      expect(r.title.startsWith(`${name} · `), name).toBe(true);
    }
  });

  it('识别英文城市名', () => {
    expect(summarizePrompt('a slow week in Chengdu', 'shanghai').cityId).toBe('chengdu');
    expect(summarizePrompt('Xian for 5 days', 'shanghai').cityId).toBe('xian');
  });

  it('识别不到城市时使用传入的默认城市', () => {
    expect(summarizePrompt('一个人慢慢走，想逛书店', 'hangzhou').cityId).toBe('hangzhou');
    expect(summarizePrompt('', 'puer').cityId).toBe('puer');
  });

  it('识别主题、节奏与同行者', () => {
    const r = summarizePrompt('四月一个人去成都，想逛书店、喝茶，不赶路', 'shanghai');
    expect(r.cityId).toBe('chengdu');
    expect(r.companions).toBe('独行');
    expect(r.travelers).toBe(1);
    expect(r.tags).toContain('不赶路');
    expect(r.tags).toContain('书店');
    expect(r.tags).toContain('茶');
    expect(r.titleEn.startsWith('Chengdu · ')).toBe(true);
  });

  it('识别同行人数', () => {
    expect(summarizePrompt('带父母去上海，慢慢逛', 'shanghai').travelers).toBe(3);
    expect(summarizePrompt('和情侣两个人去苏州', 'shanghai').travelers).toBe(2);
  });

  it('无匹配关键词时标签回落到城市漫游，偏好回落到默认句', () => {
    const r = summarizePrompt('去上海', 'shanghai');
    expect(r.tags).toEqual(['城市漫游']);
    expect(r.companions).toBe('独行');
    expect(r.preference).toBe('书店、街巷与当地的一口热食；不赶路。');
  });

  it('空输入沿用默认城市与其城市 intro 主题', () => {
    const r = summarizePrompt('   ', 'xian');
    expect(r.cityId).toBe('xian');
    expect(r.destination).toBe('西安');
    const city = getCity('xian')!;
    // 空输入 → 主题回落城市 intro（下一句断言保证不被改写）
    expect(r.mood.themeEn).toBe('The City Itself');
    expect(r.mood.palette).toBe(city.palette);
  });
});
