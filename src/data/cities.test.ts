// Link-R World — 城市档案与逐月气候测试
//
// 页面月份标签随用户所在月份变化后，最容易出的错是：
//  · 逐月表和四月锚点不一致（同一座城两个口径）；
//  · 某月高低温写反或越界；
//  · 月份取值越界时崩溃。
// 这里把这三类问题全部钉死。
import { describe, expect, it } from 'vitest';
import {
  CITIES,
  MONTHLY_CLIMATE,
  climateOfMonth,
  currentMonth,
  getCity,
  monthOfISO,
  seasonOfMonth,
  type CityInfo,
} from './cities';
import { buildMood } from '../lib/mood';
import { summarizePrompt } from '../lib/tripMath';
import { createTrip, tripPlacesOfCity } from './tripData';

describe('逐月气候 · 数据不变量', () => {
  it('十座城市都有完整的 12 个月数据', () => {
    for (const c of CITIES) {
      expect(MONTHLY_CLIMATE[c.id], `${c.name} 缺逐月数据`).toHaveLength(12);
    }
  });

  it('四月列与各城 climate 锚点严格一致（不允许两套口径）', () => {
    for (const c of CITIES) {
      const apr = MONTHLY_CLIMATE[c.id]![3]!;
      expect(apr.hi, `${c.name} 四月高温不一致`).toBe(c.climate.highC);
      expect(apr.lo, `${c.name} 四月低温不一致`).toBe(c.climate.lowC);
    }
  });

  it('每月高温 > 低温，且温度在合理区间内', () => {
    for (const c of CITIES) {
      MONTHLY_CLIMATE[c.id]!.forEach((m, i) => {
        expect(m.hi, `${c.name} ${i + 1} 月高温异常`).toBeGreaterThan(m.lo);
        expect(m.lo, `${c.name} ${i + 1} 月低温异常`).toBeGreaterThan(-30);
        expect(m.hi, `${c.name} ${i + 1} 月高温异常`).toBeLessThan(50);
      });
    }
  });

  it('季节走向合理：最冷月落在 12/1/2 月，最热月落在 4–9 月（版纳等热带城市最热在雨季前的 5 月前后）', () => {
    for (const c of CITIES) {
      const rows = MONTHLY_CLIMATE[c.id]!;
      const mid = rows.map((m) => (m.hi + m.lo) / 2);
      const coldest = mid.indexOf(Math.min(...mid)) + 1;
      const hottest = mid.indexOf(Math.max(...mid)) + 1;
      expect([12, 1, 2], `${c.name} 最冷月是 ${coldest} 月`).toContain(coldest);
      expect([4, 5, 6, 7, 8, 9], `${c.name} 最热月是 ${hottest} 月`).toContain(hottest);
    }
  });
});

describe('climateOfMonth · 取值与容错', () => {
  const shanghai = CITIES[0]!;

  it('1–12 月逐一返回对应月份', () => {
    for (let m = 1; m <= 12; m++) {
      expect(climateOfMonth(shanghai, m).month).toBe(m);
    }
  });

  it('四月返回的数值就是城市档案里的四月锚点', () => {
    const r = climateOfMonth(shanghai, 4);
    expect(r.highC).toBe(shanghai.climate.highC);
    expect(r.lowC).toBe(shanghai.climate.lowC);
  });

  it('越界月份收敛到 1 / 12，不抛错不返回 NaN', () => {
    expect(climateOfMonth(shanghai, 0).month).toBe(1);
    expect(climateOfMonth(shanghai, 13).month).toBe(12);
    expect(climateOfMonth(shanghai, NaN).month).toBe(1);
    for (const bad of [0, 13, NaN, -3, 99]) {
      const r = climateOfMonth(shanghai, bad);
      expect(Number.isFinite(r.highC) && Number.isFinite(r.lowC)).toBe(true);
    }
  });

  it('每座城都有页顶标语：短名 + 「慢慢走」，副句非空（版纳用简称）', () => {
    for (const c of CITIES) {
      expect(c.slogan.title, `${c.name} 标语标题`).toMatch(/^[^，]{1,4}，慢慢走$/);
      expect(c.slogan.sub.trim().length, `${c.name} 标语副句`).toBeGreaterThan(8);
    }
  });

  it('每座城查 12 个月都不抛错', () => {
    for (const c of CITIES as CityInfo[]) {
      for (let m = 1; m <= 12; m++) {
        expect(climateOfMonth(c, m).highC).toBeGreaterThan(climateOfMonth(c, m).lowC);
      }
    }
  });
});

describe('currentMonth · 当前月份', () => {
  it('落在 1–12 之间，随系统时间走', () => {
    expect(currentMonth()).toBe(new Date().getMonth() + 1);
    expect(currentMonth()).toBeGreaterThanOrEqual(1);
    expect(currentMonth()).toBeLessThanOrEqual(12);
  });
});

describe('季节口径 · 出发月份全链路统一', () => {
  it('seasonOfMonth：3–5 春 / 6–8 夏 / 9–11 秋 / 12–2 冬', () => {
    expect(seasonOfMonth(3)).toBe('spring');
    expect(seasonOfMonth(5)).toBe('spring');
    expect(seasonOfMonth(6)).toBe('summer');
    expect(seasonOfMonth(8)).toBe('summer');
    expect(seasonOfMonth(9)).toBe('autumn');
    expect(seasonOfMonth(11)).toBe('autumn');
    expect(seasonOfMonth(12)).toBe('winter');
    expect(seasonOfMonth(1)).toBe('winter');
    expect(seasonOfMonth(2)).toBe('winter');
  });

  it('seasonOfMonth 越界收敛到冬季口径，不抛错', () => {
    expect(seasonOfMonth(0)).toBe('winter');
    expect(seasonOfMonth(13)).toBe('winter');
    expect(seasonOfMonth(NaN)).toBe('winter');
  });

  it('monthOfISO：合法日期取其月份，非法回落当前月', () => {
    expect(monthOfISO('2026-10-20')).toBe(10);
    expect(monthOfISO('2026-01-01')).toBe(1);
    expect(monthOfISO('')).toBe(currentMonth());
    expect(monthOfISO(undefined)).toBe(currentMonth());
    expect(monthOfISO('垃圾')).toBe(currentMonth());
  });

  it('每座城四季穿搭口径都非空，且不再出现写死的「四月」', () => {
    for (const c of CITIES) {
      for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
        expect(c.outfit.summary[s].trim().length, `${c.name} ${s}`).toBeGreaterThan(6);
        expect(c.outfit.summary[s], `${c.name} ${s}`).not.toMatch(/四月/);
      }
      for (const item of c.outfit.items) {
        expect(item.detail, `${c.name} ${item.piece}`).not.toMatch(/四月/);
      }
    }
  });

  it('地点提示语不再出现写死的「四月」', () => {
    for (const c of CITIES) {
      for (const p of tripPlacesOfCity(c.id)) {
        expect(p.tip, `${c.name} · ${p.name}`).not.toMatch(/四月/);
      }
    }
  });

  it('行程骨架的提示与相遇话语不再出现写死的「四月」', () => {
    for (const c of CITIES) {
      const trip = createTrip(c.id);
      for (const item of trip.items) {
        expect(item.note, `${c.name} · ${item.placeId}`).not.toMatch(/四月/);
        expect(item.relate?.line ?? '', `${c.name} · ${item.placeId}`).not.toMatch(/四月/);
      }
    }
  });

  it('buildMood 按出发月份取对应季节口径（10 月 ≠ 春天文案）', () => {
    const shanghai = CITIES[0]!;
    expect(buildMood(shanghai, '逛书店', 10).outfit.summary).toBe(shanghai.outfit.summary.autumn);
    expect(buildMood(shanghai, '逛书店', 4).outfit.summary).toBe(shanghai.outfit.summary.spring);
    expect(buildMood(shanghai, '逛书店', 7).outfit.summary).toBe(shanghai.outfit.summary.summer);
    expect(buildMood(shanghai, '逛书店', 1).outfit.summary).toBe(shanghai.outfit.summary.winter);
  });

  it('行程链路：summarizePrompt 传入出发月份后，穿搭口径跟着出发月走', () => {
    const s = summarizePrompt('一个人去苏州走走', 'suzhou', 10);
    expect(s.mood.outfit.summary).toBe(getCity('suzhou')!.outfit.summary.autumn);
    expect(s.mood.outfit.summary).not.toMatch(/四月/);
  });
});
