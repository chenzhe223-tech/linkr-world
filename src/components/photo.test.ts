// 餐饮图与店铺类型必须对应（2026-10-10 用户反馈回归：咖啡店不能上点心图）
import { describe, expect, it } from 'vitest';
import { PLACES, type Place } from '../data/places';
import { FOOD_PHOTO, PLACE_PHOTO } from '../data/photos';
import { foodTagOf, photoOf } from './Photo';

/** 正餐/市井小吃类图 —— 咖啡店、茶馆、书店绝不该出现 */
const MAIN_DISH_TAGS = [
  'shengjian', 'xiaolong', 'noodle', 'paomo', 'roujiamo', 'kaoya', 'wonton',
  'zongzi', 'hotpot', 'grilledfish', 'rice', 'pineapple-rice', 'skewer', 'nightmarket',
];

const tagOf = (id: string) => {
  const place = PLACES.find((p) => p.id === id);
  expect(place, `地点 ${id} 不存在`).toBeTruthy();
  return foodTagOf(place as Place);
};

describe('餐饮图与店铺类型对应（用户反馈修复回归）', () => {
  it('% Arabica 不再共用王家沙的点心图', () => {
    expect(tagOf('sh-arabica')).toBe('coffee');
    expect(tagOf('sh-wangjiasha')).toBe('dish');
    expect(photoOf({ id: 'sh-arabica', kind: 'cafe' }, 'shanghai')).not.toBe(
      photoOf({ id: 'sh-wangjiasha', kind: 'food' }, 'shanghai')
    );
  });

  it('所有咖啡店都出饮品图（coffee / coffee-estate），不再是 dish', () => {
    const cafes = PLACES.filter((p) => p.kind === 'cafe');
    expect(cafes.length).toBeGreaterThan(10);
    for (const place of cafes) {
      const tag = foodTagOf(place);
      expect(tag === 'coffee' || tag === 'coffee-estate', `${place.id} → ${tag}`).toBe(true);
    }
  });

  it('茶馆出茶图（含奶茶铺）、酒吧出酒图、书店不出食物图', () => {
    for (const place of PLACES) {
      const tag = foodTagOf(place);
      if (place.kind === 'tea') {
        expect(tag === 'tea' || tag === 'milktea', `${place.id} → ${tag}`).toBe(true);
      }
      if (place.kind === 'bar') {
        // 夜市里的小酌摊（如 pu-night-bites）用夜市图最贴切，也算对应
        expect(tag === 'cocktail' || tag === 'craftbeer' || tag === 'nightmarket', `${place.id} → ${tag}`).toBe(true);
      }
      if (place.kind === 'bookstore') {
        expect(tag, `${place.id} → ${tag}`).toBeNull();
      }
    }
  });

  it('咖啡店 / 茶馆 / 书店都不落正餐小吃图（防未来再硬凑）', () => {
    for (const place of PLACES) {
      if (!['cafe', 'tea', 'bookstore'].includes(place.kind)) continue;
      const tag = foodTagOf(place);
      expect(MAIN_DISH_TAGS).not.toContain(tag);
    }
  });

  it('FOOD_PHOTO 键与品类图文件一一对应且路径合法', () => {
    const tags = Object.keys(FOOD_PHOTO);
    expect(tags.length).toBeGreaterThanOrEqual(20);
    for (const [tag, src] of Object.entries(FOOD_PHOTO)) {
      expect(src).toBe(`photos/food/${tag}.jpg`);
    }
  });
  // 图片身份（规格 §2.2）：一张图只能属于一个景点，不能两个景点共用同一张
  it('PLACE_PHOTO 每个景点一张专属图，没有一图多挂', () => {
    const bySrc = new Map<string, string[]>();
    for (const [id, src] of Object.entries(PLACE_PHOTO)) {
      bySrc.set(src, [...(bySrc.get(src) ?? []), id]);
    }
    const shared = [...bySrc.entries()].filter(([, ids]) => ids.length > 1);
    // 允许同一点位的多语言/别名键指向同一张图的前提是：id 指向同一个地点（下面统一断言）
    expect(shared.length, `一图多挂: ${shared.map(([s, ids]) => `${s}←${ids.join(',')}`).join(' | ')}`).toBe(0);
  });

  it('没有专属图时按品类兜底或回退插画，绝不借用其他景点的图片', () => {
    // 餐饮：kind 对应的"品类图"是设计内的兜底（不是别家门店的图）
    expect(photoOf({ id: 'unknown-food-shop-xyz', kind: 'food' })).toBeUndefined();
    expect(photoOf({ id: 'unknown-cafe-shop-xyz', kind: 'cafe' })).toBe('photos/food/coffee.jpg');
    // 景点类：无专属图时回退所属城市大图（封面口径），无城市信息则回退插画
    expect(photoOf({ id: 'unknown-sight-xyz', kind: 'sight' }, 'hangzhou')).toBe(
      'photos/hangzhou.jpg'
    );
    expect(photoOf({ id: 'unknown-sight-xyz', kind: 'sight' })).toBeUndefined();
  });
});

