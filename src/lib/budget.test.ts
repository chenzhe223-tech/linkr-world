// Link-R World — 大交通推荐 + 吃住行全包预算 + 餐饮点位注入
//
// 这几组断言对应三件必须成立的事：
//   1) 交通方式按"距离 + 出行时间"推荐，价格随当季浮动，不再出现"杭州到普洱 516 元"这种明显不够的数；
//   2) 预算必须覆盖吃住行全包（大交通往返 / 住宿 / 三餐 / 门票体验 / 市内交通），且分项与总额勾稽；
//   3) 每个城市的行程都要有"吃饭的地儿 + 茶咖甜品"，并随输入变化（因人而异）。

import { describe, expect, it } from 'vitest';
import { getCity, type CityId } from '../data/cities';
import { CITY_RATES } from '../data/cityRates';
import { createTrip, placeView, tripPlacesOfCity } from '../data/tripData';
import { placesOfCity } from '../data/places';
import { dayItems, fullBudget, parseTierFromInput } from './tripMath';
import type { Trip } from './types';
import { haversineKm, planIntercity, seasonOf } from './transport';

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

/** 按目的地城市的真实数据组装大交通方案 */
function intercityOf(origin: string, cityId: CityId, startDate = '2026-10-13') {
  const city = getCity(cityId)!;
  const rates = CITY_RATES[cityId];
  return planIntercity(
    origin,
    {
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      hasAirport: rates.hasAirport,
      hasDirectRail: rates.hasDirectRail,
      transferNote: rates.transferNote,
    },
    startDate
  );
}

function tripOf(cityId: CityId, days: number, origin = '', travelers = 1, keywords = ''): Trip {
  return { ...createTrip(cityId, { days, keywords }), origin, travelers };
}

describe('大交通：按距离与出行时间推荐', () => {
  it('距离用大圆距离算，量级正确', () => {
    const sh = getCity('shanghai')!;
    const bj = getCity('beijing')!;
    const km = haversineKm(sh.lat, sh.lng, bj.lat, bj.lng);
    expect(km).toBeGreaterThan(1000);
    expect(km).toBeLessThan(1150);
  });

  it('短途打车、中程高铁、长途飞机', () => {
    // 上海 → 苏州（约 85km）：网约车/自驾
    const suzhou = intercityOf('上海', 'suzhou');
    expect(suzhou.km).toBeLessThan(160);
    expect(suzhou.recommendedKey).toBe('rideshare');

    // 上海 → 北京（约 1,070km）：高铁
    const beijing = intercityOf('上海', 'beijing');
    expect(beijing.recommendedKey).toBe('hsr');
    expect(beijing.options.some((o) => o.key === 'flight')).toBe(true);

    // 杭州 → 普洱（约 2,000km+）：飞机（且需中转提示）
    const puer = intercityOf('杭州', 'puer');
    expect(puer.km).toBeGreaterThan(1800);
    expect(puer.recommendedKey).toBe('flight');
    expect(puer.options.some((o) => o.key === 'train')).toBe(true);
  });

  it('杭州到普洱的往返大交通远高于 516 元（修复明显不够的估算）', () => {
    const puer = intercityOf('杭州', 'puer');
    expect(puer.roundTripLow).toBeGreaterThan(1200);
    // 单人往返区间自洽，且上下沿有序
    expect(puer.roundTripHigh).toBeGreaterThan(puer.roundTripLow);
    for (const o of puer.options) {
      expect(o.oneWayHigh).toBeGreaterThanOrEqual(o.oneWayLow);
    }
  });

  it('机票随出行日期分档：黄金周 > 暑运 > 平季', () => {
    expect(seasonOf('2026-10-01').key).toBe('peak');
    expect(seasonOf('2026-07-20').key).toBe('summer');
    expect(seasonOf('2026-06-15').key).toBe('normal');
    const peak = intercityOf('杭州', 'puer', '2026-10-01');
    const normal = intercityOf('杭州', 'puer', '2026-06-15');
    const flightOf = (p: typeof peak) => p.options.find((o) => o.key === 'flight')!;
    expect(flightOf(peak).oneWayLow).toBeGreaterThan(flightOf(normal).oneWayLow);
    expect(flightOf(peak).oneWayHigh).toBeGreaterThan(flightOf(normal).oneWayHigh);
  });

  it('高铁费率落在 0.42–0.52 元/km 口径内（12306 二等座量级）', () => {
    const beijing = intercityOf('上海', 'beijing');
    const hsr = beijing.options.find((o) => o.key === 'hsr')!;
    const railKm = beijing.km * 1.25;
    expect(hsr.oneWayLow / railKm).toBeGreaterThan(0.4);
    expect(hsr.oneWayHigh / railKm).toBeLessThan(0.55);
  });

  it('同城不给大交通；未识别出发地明确标记', () => {
    const local = intercityOf('上海', 'shanghai');
    expect(local.km).toBeLessThan(40);
    expect(local.options).toHaveLength(0);
    expect(local.roundTripLow).toBe(0);

    const unknown = intercityOf('某个没听过的小城', 'shanghai');
    expect(unknown.recognized).toBe(false);
    expect(unknown.basis).toContain('未识别出发地');
  });

  it('苏州无民用机场时不推直飞，并在提示里说明接驳', () => {
    const suzhou = intercityOf('成都', 'suzhou');
    expect(suzhou.options.some((o) => o.key === 'flight')).toBe(false);
    expect(CITY_RATES.suzhou.transferNote).toContain('机场');
  });

  it('推荐方式一定在候选列表里且唯一', () => {
    for (const id of CITY_IDS) {
      for (const origin of ['上海', '昆明', '乌鲁木齐']) {
        const p = intercityOf(origin, id);
        if (p.options.length === 0) continue;
        const recs = p.options.filter((o) => o.recommended);
        expect(recs, `${origin}→${id}`).toHaveLength(1);
        expect(recs[0].key, `${origin}→${id}`).toBe(p.recommendedKey);
      }
    }
  });
});

describe('吃住行全包预算', () => {
  it('分项与总额勾稽，且覆盖全部五类支出', () => {
    for (const id of CITY_IDS) {
      const trip = tripOf(id, 5, '上海', 2);
      const intercity = intercityOf('上海', id);
      const b = fullBudget(trip, CITY_RATES[id], intercity, 'comfort');
      const sumLow = b.rows.reduce((s, r) => s + r.low, 0);
      const sumHigh = b.rows.reduce((s, r) => s + r.high, 0);
      expect(b.low, id).toBe(sumLow);
      expect(b.high, id).toBe(sumHigh);
      expect(b.high, id).toBeGreaterThanOrEqual(b.low);
      const keys = b.rows.map((r) => r.key);
      expect(keys, id).toContain('stay');
      expect(keys, id).toContain('meal');
      expect(keys, id).toContain('ticket');
      expect(keys, id).toContain('local');
      if (intercity.km >= 40) expect(keys, id).toContain('intercity');
    }
  });

  it('住宿按晚数、餐饮按天数×人数线性放大', () => {
    const two = fullBudget(tripOf('shanghai', 3, '上海', 1), CITY_RATES.shanghai, null, 'comfort');
    const four = fullBudget(tripOf('shanghai', 5, '上海', 1), CITY_RATES.shanghai, null, 'comfort');
    const stayTwo = two.rows.find((r) => r.key === 'stay')!;
    const stayFour = four.rows.find((r) => r.key === 'stay')!;
    // 3 天 2 晚 → 5 天 4 晚：住宿正好翻倍
    expect(stayFour.low).toBe(stayTwo.low * 2);
    const mealTwo = two.rows.find((r) => r.key === 'meal')!;
    const mealFour = four.rows.find((r) => r.key === 'meal')!;
    expect(mealFour.low).toBeGreaterThan(mealTwo.low);
  });

  it('大交通按人数放大，3 人住 2 间', () => {
    const one = fullBudget(tripOf('beijing', 4, '上海', 1), CITY_RATES.beijing, intercityOf('上海', 'beijing'), 'comfort');
    const three = fullBudget(tripOf('beijing', 4, '上海', 3), CITY_RATES.beijing, intercityOf('上海', 'beijing'), 'comfort');
    expect(three.rooms).toBe(2);
    const ic1 = one.rows.find((r) => r.key === 'intercity')!;
    const ic3 = three.rows.find((r) => r.key === 'intercity')!;
    expect(ic3.low).toBe(ic1.low * 3);
    expect(ic3.high).toBe(ic1.high * 3);
  });

  it('档位来自用户输入：穷游 < 舒适 < 轻奢', () => {
    expect(parseTierFromInput('想省钱，穷游一点')).toBe('economy');
    expect(parseTierFromInput('随便走走')).toBe('comfort');
    expect(parseTierFromInput('想住好一点的轻奢酒店')).toBe('premium');
    const mk = (tier: 'economy' | 'comfort' | 'premium') =>
      fullBudget(tripOf('hangzhou', 4, '上海', 2), CITY_RATES.hangzhou, intercityOf('上海', 'hangzhou'), tier);
    const e = mk('economy');
    const c = mk('comfort');
    const p = mk('premium');
    expect(e.low).toBeLessThan(c.low);
    expect(c.low).toBeLessThan(p.low);
    expect(e.high).toBeLessThan(c.high);
    expect(c.high).toBeLessThan(p.high);
  });

  it('杭州→普洱 2 天 2 人的总预算远高于旧口径的 516 元', () => {
    const trip = tripOf('puer', 2, '杭州', 2);
    const b = fullBudget(trip, CITY_RATES.puer, intercityOf('杭州', 'puer'), 'comfort');
    expect(b.low).toBeGreaterThan(2500);
    const ic = b.rows.find((r) => r.key === 'intercity')!;
    expect(ic.low).toBeGreaterThan(2000);
    expect(ic.label).toContain('2 人');
  });

  it('未识别出发地时不算大交通（不臆造机票）', () => {
    const b = fullBudget(tripOf('puer', 2, '', 1), CITY_RATES.puer, null, 'comfort');
    expect(b.rows.some((r) => r.key === 'intercity')).toBe(false);
  });
});

describe('餐饮 · 茶咖 · 甜品：真实门店 + 因人而异', () => {
  it('每座城市都备足可轮换的真实餐饮点位', () => {
    for (const id of CITY_IDS) {
      const pool = placesOfCity(id).filter((x) =>
        ['food', 'cafe', 'tea', 'dessert'].includes(x.kind)
      );
      expect(pool.length, id).toBeGreaterThanOrEqual(8);
      expect(pool.some((x) => x.kind === 'food'), id).toBe(true);
      expect(pool.some((x) => ['cafe', 'tea', 'dessert'].includes(x.kind)), id).toBe(true);
    }
  });

  it('逐日行程都补进了吃饭的地儿 + 一处茶咖甜品，餐饮点位跨天尽量不重复', () => {
    for (const id of CITY_IDS) {
      const t = createTrip(id, { days: 5, keywords: '想慢慢吃，也想去咖啡馆坐坐' });
      const fnb: string[] = [];
      const drinks: string[] = [];
      for (let d = 0; d < 5; d++) {
        const list = dayItems(t.items, d);
        const mine = list.filter((i) => i.id.includes('-fnb-'));
        // 一天最多 3 处餐饮（一餐 + 一杯 + 一餐）；松弛有度：默认一天合计不超过 5 块
        // （2026-10-10 用户反馈：不要特种兵式打卡；紧凑/家庭档位另有 4–6 的独立上限）
        expect(mine.length, `${id} D${d + 1}`).toBeGreaterThanOrEqual(2);
        expect(mine.length, `${id} D${d + 1}`).toBeLessThanOrEqual(3);
        expect(list.length, `${id} D${d + 1} 合计`).toBeLessThanOrEqual(5);
        for (const i of mine) {
          const kind = placeView(i.placeId)!.kind;
          expect(['food', 'cafe', 'tea', 'dessert'], `${id}/${i.placeId}`).toContain(kind);
          fnb.push(i.placeId);
          if (kind !== 'food') drinks.push(i.placeId);
        }
        // 每天都得有一口吃的，且有一处茶咖甜品（用户明确要的"咖啡、茶、奶茶、甜品店"）
        const dayKinds = list.map((i) => placeView(i.placeId)!.kind);
        expect(dayKinds, `${id} D${d + 1} 无吃饭点位`).toContain('food');
        expect(
          dayKinds.some((k) => k === 'cafe' || k === 'tea' || k === 'dessert'),
          `${id} D${d + 1} 无茶咖甜品`
        ).toBe(true);
      }
      // 茶咖甜品是"特色点位"：跨天绝不重复；正餐优先新店，池子见底时才允许回访
      expect(new Set(drinks).size, `${id} 茶咖甜品跨天不重复`).toBe(drinks.length);
      expect(new Set(fnb).size, `${id} 餐饮点位大多不重复`).toBeGreaterThanOrEqual(
        Math.min(fnb.length, 10)
      );
    }
  });

  it('输入里点名咖啡/茶/甜品时，行程里就会出现这类点位', () => {
    const coffee = createTrip('shanghai', { days: 2, keywords: '想喝咖啡，逛书店' });
    const kinds = coffee.items.map((i) => placeView(i.placeId)!.kind);
    expect(kinds.some((k) => k === 'cafe' || k === 'tea')).toBe(true);

    const dessert = createTrip('chengdu', { days: 2, keywords: '想吃甜品和冰粉' });
    const dKinds = dessert.items.map((i) => placeView(i.placeId)!.kind);
    expect(dKinds.some((k) => k === 'dessert')).toBe(true);

    const tea = createTrip('hangzhou', { days: 2, keywords: '想喝茶，安静一点' });
    const tKinds = tea.items.map((i) => placeView(i.placeId)!.kind);
    expect(tKinds.some((k) => k === 'tea' || k === 'cafe')).toBe(true);
  });

  it('不同出发日期 / 不同输入，排出来的餐饮店不同（不是千篇一律）', () => {
    const a = createTrip('xian', { days: 2, startDate: '2026-10-13', keywords: '想喝咖啡' });
    const b = createTrip('xian', { days: 2, startDate: '2026-10-13', keywords: '想吃本地小吃' });
    const fnbOf = (t: typeof a) => t.items.filter((i) => i.id.includes('-fnb-')).map((i) => i.placeId);
    expect(fnbOf(a).join(',')).not.toBe(fnbOf(b).join(','));
  });

  it('同一天里的行程块按时间升序且互不重叠（补进来的餐饮不覆盖原行程）', () => {
    const spanOf = (time: string) => {
      const toks = Array.from(time.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g)).map(
        (m) => Number(m[1]) * 60 + Number(m[2])
      );
      return { lo: toks[0] ?? 0, hi: toks[1] ?? (toks[0] ?? 0) + 30 };
    };
    for (const id of CITY_IDS) {
      for (const opt of [
        { days: 5 },
        { days: 3, keywords: '想喝咖啡，喝茶，找甜品，慢慢吃' },
        { days: 2, startDate: '2026-10-12' },
      ]) {
        const t = createTrip(id, opt);
        for (let d = 0; d < t.days.length; d++) {
          const spans = dayItems(t.items, d).map((i) => spanOf(i.time));
          for (let k = 1; k < spans.length; k++) {
            expect(spans[k].lo, `${id} D${d + 1} 第 ${k + 1} 块与上一块重叠`).toBeGreaterThanOrEqual(
              spans[k - 1].hi
            );
          }
        }
      }
    }
  });

  it('新增的餐饮点位不破坏地点库不变量（唯一 id、可解析、属于本城）', () => {
    for (const id of CITY_IDS) {
      const all = tripPlacesOfCity(id);
      expect(new Set(all.map((p) => p.id)).size, `${id} 唯一 id`).toBe(all.length);
      const t = createTrip(id, { days: 5 });
      for (const item of t.items) {
        const view = placeView(item.placeId)!;
        expect(view, `${id}/${item.placeId}`).toBeDefined();
        expect(getCity(id)!.name).toBe(t.destination);
      }
    }
  });
});
