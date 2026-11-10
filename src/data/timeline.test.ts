// Link-R World — 行程时间轴一致性测试（规格 §3.2）
//
// 不变量：
//  · 每块时段 HH:MM–HH:MM 必须开始早于结束（不允许零时长 / 负时长）；
//  · 同一天内按时间递增排列（时间轴从早到晚，不来回跳）；
//  · 时间格式统一为 HH:MM 或 HH:MM–HH:MM（不留 "9:5" 这类脏格式）；
//  · 交通时长单独存放在 transit 字段，不混进游览时段。
import { describe, expect, it } from 'vitest';
import { CITIES } from './cities';
import { createTrip, placeView } from './tripData';
import type { ItineraryItem } from '../lib/types';

const RANGE = /^(\d{2}):(\d{2})–(\d{2}):(\d{2})$/;
const POINT = /^(\d{2}):(\d{2})$/;
const toMin = (h: string, m: string) => Number(h) * 60 + Number(m);

/** 只取行程骨架块的时间（餐饮/酒馆注入块同样遵守同一规则，一并检查） */
function timesOf(items: ItineraryItem[], dayIndex: number): string[] {
  return items.filter((i) => i.dayIndex === dayIndex).map((i) => i.time);
}

describe('时间轴 · 时间数据一致性', () => {
  const cities = CITIES.slice();

  it('每块时段开始早于结束（无零时长 / 负时长）', () => {
    for (const c of cities) {
      const trip = createTrip(c.id, { days: 3, keywords: '咖啡书店，不赶路' });
      for (const item of trip.items) {
        const m = item.time.match(RANGE);
        if (!m) continue;
        const start = toMin(m[1], m[2]);
        const end = toMin(m[3], m[4]);
        expect(end, `${c.name} ${item.time} 结束不晚于开始`).toBeGreaterThan(start);
      }
    }
  });

  it('时间格式统一（HH:MM 或 HH:MM–HH:MM，两位补零）', () => {
    for (const c of cities) {
      const trip = createTrip(c.id, { days: 2 });
      for (const item of trip.items) {
        const ok =
          RANGE.test(item.time) || POINT.test(item.time) || /^[\u4e00-\u9fa5]/.test(item.time);
        expect(ok, `${c.name} 时间格式异常：${item.time}`).toBe(true);
      }
    }
  });

  it('同一天内按时间递增排列（时间轴从早到晚，不来回跳）', () => {
    for (const c of cities) {
      const trip = createTrip(c.id, { days: 3, keywords: '咖啡书店' });
      for (const d of trip.days) {
        const list = timesOf(trip.items, d.index);
        let last = -1;
        for (const t of list) {
          const m = t.match(RANGE) ?? t.match(POINT);
          if (!m) continue;
          const start = toMin(m[1], m[2]);
          expect(start, `${c.name} D${d.index + 1} 时间倒退：${list.join(' → ')}`).toBeGreaterThanOrEqual(last);
          last = start;
        }
      }
    }
  });

  it('交通时长单列在 transit 字段，不混入游览时段', () => {
    for (const c of cities) {
      const trip = createTrip(c.id, { days: 2 });
      for (const item of trip.items) {
        // transit = { mode, minutes }，与游览时段分开存放，不占用 time 区间
        expect(typeof item.transit.mode, `${c.name} 交通方式缺失`).toBe('string');
        expect(item.transit.minutes, `${c.name} 交通时长必须是非负数字`).toBeGreaterThanOrEqual(0);
        const m = item.time.match(RANGE);
        if (!m) continue;
        const span = toMin(m[3], m[4]) - toMin(m[1], m[2]);
        expect(span, `${c.name} ${item.time} 时段过长（>8 小时，疑似把交通算进来了）`).toBeLessThanOrEqual(8 * 60);
      }
    }
  });

  it('时间轴引用的地点都在地点库中（不渲染幽灵块）', () => {
    for (const c of cities) {
      const trip = createTrip(c.id, { days: 2 });
      for (const item of trip.items) {
        expect(placeView(item.placeId), `${c.name} 行程块引用未知地点 ${item.placeId}`).toBeTruthy();
      }
    }
  });
});
