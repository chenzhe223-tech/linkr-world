// Link-R World — 个性化行程（夜生活 / 家庭节奏）测试
//
// 用户的要求必须真的落进行程：
//  · 写了"酒吧 / 精酿 / 微醺"→ 至少一家当地特色小酒馆，且排在 20 点以后；
//  · 没写就不硬塞（准确 > 数量）；
//  · 小酒馆跨天绝不重复；
//  · 亲子游 / 带父母 / 60+：每天少排一个重点，多留空。
import { describe, expect, it } from 'vitest';
import { CITIES } from './cities';
import { createTrip, placeView, tripPlacesOfCity } from './tripData';
import type { ItineraryItem } from '../lib/types';

const kindOf = (item: ItineraryItem) => placeView(item.placeId)?.kind ?? '';

describe('小酒馆 · 夜生活意图', () => {
  it('十座城市都有特色小酒馆点位（kind = bar，20 点后营业）', () => {
    for (const c of CITIES) {
      const bars = tripPlacesOfCity(c.id).filter((p) => p.kind === 'bar');
      expect(bars.length, `${c.name} 缺小酒馆点位`).toBeGreaterThan(0);
      for (const b of bars) {
        expect(b.name.trim().length).toBeGreaterThan(0);
        expect(b.tip.trim().length).toBeGreaterThan(6);
        expect(b.ticket).toBeGreaterThan(0); // 人均消费写明，预算才有依据
      }
    }
  });

  it('写"想去酒吧"→ 行程里真的出现小酒馆块，排在 20:00 之后', () => {
    for (const c of CITIES) {
      const trip = createTrip(c.id, { days: 2, keywords: '想去酒吧，喝一杯' });
      const bars = trip.items.filter((i) => kindOf(i) === 'bar');
      expect(bars.length, `${c.name} 没把酒吧排进行程`).toBeGreaterThan(0);
      for (const b of bars) {
        const start = Number(b.time.match(/(\d{1,2}):\d{2}/)?.[1] ?? '0');
        expect(start, `${c.name} 小酒馆排在 ${b.time}，太早了`).toBeGreaterThanOrEqual(20);
        expect(b.note).toContain('小酒馆');
        expect(b.cost).toBeGreaterThan(0);
      }
    }
  });

  it('小酒馆跨天绝不重复同一家（宁缺毋滥）', () => {
    const trip = createTrip('shanghai', { days: 5, keywords: '想去精酿酒吧' });
    const barIds = trip.items.filter((i) => kindOf(i) === 'bar').map((i) => i.placeId);
    expect(new Set(barIds).size).toBe(barIds.length);
  });

  it('没写夜生活就不硬塞小酒馆', () => {
    const trip = createTrip('shanghai', { days: 2, keywords: '想逛书店，不赶路' });
    expect(trip.items.filter((i) => kindOf(i) === 'bar')).toHaveLength(0);
    // 默认偏好句也不该误触
    const plain = createTrip('chengdu', { days: 3 });
    expect(plain.items.filter((i) => kindOf(i) === 'bar')).toHaveLength(0);
  });

  it('写具体酒系词（精酿 / 微醺 / livehouse）同样触发', () => {
    for (const kw of ['想去精酿', '找个微醺的地方', '有 livehouse 吗']) {
      const trip = createTrip('shanghai', { days: 2, keywords: kw });
      expect(trip.items.filter((i) => kindOf(i) === 'bar').length, kw).toBeGreaterThan(0);
    }
  });
});

describe('家庭节奏 · 亲子 / 长辈', () => {
  // 节奏指的是"重点"（骨架块）；餐饮 / 小酒馆注入不计入
  const maxPerDay = (items: ItineraryItem[]) => {
    const byDay = new Map<number, number>();
    for (const i of items.filter((x) => !x.id.includes('-fnb-'))) {
      byDay.set(i.dayIndex, (byDay.get(i.dayIndex) ?? 0) + 1);
    }
    return Math.max(...byDay.values());
  };

  it('亲子游 / 带父母：每天比默认少排一个重点', () => {
    const normal = createTrip('shanghai', { days: 5, keywords: '想逛逛街' });
    const family = createTrip('shanghai', { days: 5, keywords: '亲子游，慢慢逛' });
    expect(maxPerDay(family.items)).toBe(maxPerDay(normal.items) - 1);
  });

  it('带父母旅行关键词同样触发慢节奏（每天 2 个重点）', () => {
    const family = createTrip('hangzhou', { days: 5, keywords: '带父母旅行，走走停停' });
    expect(maxPerDay(family.items)).toBeLessThanOrEqual(2);
  });

  it('60 岁以上：即使用中性输入，节奏也自动放慢（每天 2 个重点）', () => {
    const senior = createTrip('chengdu', { days: 5, keywords: '想吃点好的', age: 68 });
    expect(maxPerDay(senior.items)).toBeLessThanOrEqual(2);
  });

  it('年轻人中性输入不受影响（默认每天 3 个重点）', () => {
    const young = createTrip('chengdu', { days: 5, keywords: '想吃点好的', age: 26 });
    expect(maxPerDay(young.items)).toBeLessThanOrEqual(3);
  });
});
