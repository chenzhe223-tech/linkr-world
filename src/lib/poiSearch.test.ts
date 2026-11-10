// Link-R World — 地点搜索（精选库 + 地图大数据）单元测试
//
// 只验证“无网络也能成立”的部分：
//  · 精选库随身过滤，输入即出结果；
//  · 没配 Key 时地图分支必须安静地返回 null（由界面引导填 Key），不能抛异常；
//  · 配了 Key 但没有关键词时不应发请求，直接返回空数组。
// 真实 POI 结果依赖腾讯位置服务在线接口，不在这里断言（离线环境不可复现）。
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_KEY, loadMapKey, saveMapKey, searchBuiltIn, searchMap } from './poiSearch';
import { tripPlacesOfCity } from '../data/tripData';
import type { CityId } from '../data/cities';

// node 环境没有 localStorage（只有浏览器有），补一个内存实现，
// 这样“Key 存取”这段逻辑本身也能被测到。
if (typeof (globalThis as { localStorage?: unknown }).localStorage === 'undefined') {
  const mem = new Map<string, string>();
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
}

const CITY: CityId = 'shanghai';

describe('地点搜索 · 精选库', () => {
  it('空关键词时给出该城的前若干地点（打开即有所选，不必先打字）', () => {
    const hits = searchBuiltIn(CITY, '', 6);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(6);
    expect(hits.every((h) => h.source === 'builtin')).toBe(true);
  });

  it('结果全部来自该城地点库，名称与坐标非空', () => {
    const pool = new Set(tripPlacesOfCity(CITY).map((p) => p.id));
    const hits = searchBuiltIn(CITY, '', 20);
    for (const h of hits) {
      expect(pool.has(h.id)).toBe(true);
      expect(h.name.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(h.lat) && Number.isFinite(h.lng)).toBe(true);
    }
  });

  it('按名称关键词随身过滤（同地图搜索的用法）', () => {
    const pool = tripPlacesOfCity(CITY);
    const seed = pool[0]!;
    const kw = seed.name.slice(0, 2);
    const hits = searchBuiltIn(CITY, kw, 8);
    expect(hits.length).toBeGreaterThan(0);
    // 命中的每一条都必须在“名称 / 英文名 / 区域 / 提示语”里真的包含关键词
    for (const h of hits) {
      const src = pool.find((p) => p.id === h.id)!;
      expect(`${src.name}${src.nameEn}${src.district}${src.tip}`.toLowerCase()).toContain(kw.toLowerCase());
    }
    expect(hits.some((h) => h.name === seed.name)).toBe(true);
  });

  it('关键词不匹配时返回空数组（界面据此提示去用地图大数据）', () => {
    expect(searchBuiltIn(CITY, 'zzz-不存在的关键词-zzz', 8)).toEqual([]);
  });

  it('换城市即换库：同关键词在不同城市的结果不相交', () => {
    const sh = searchBuiltIn(CITY, '', 8).map((h) => h.id);
    const bj = searchBuiltIn('beijing' as CityId, '', 8).map((h) => h.id);
    expect(sh.length).toBeGreaterThan(0);
    expect(bj.length).toBeGreaterThan(0);
    expect(sh.filter((id) => bj.includes(id))).toEqual([]);
  });
});

describe('地点搜索 · 地图大数据分支', () => {
  it('不预置任何 Key（前端包里不得带可用的密钥）', () => {
    expect(localStorage.getItem('lrw-tmap-key')).toBeNull();
    expect(DEFAULT_MAP_KEY).toBe('');
    expect(loadMapKey()).toBe('');
  });

  it('关键词为空时不发请求，直接返回空数组', async () => {
    await expect(searchMap('   ', '上海')).resolves.toEqual([]);
  });

  it('没填 Key 时不发请求（只用内置精选库，返回 null 表示「未配置」）', async () => {
    saveMapKey('   ');
    expect(loadMapKey()).toBe('');
    await expect(searchMap('咖啡', '上海')).resolves.toBeNull();
  });

  it('Key 存取会去掉首尾空白（用户粘贴常带空格），清空后回到「无 Key」', () => {
    saveMapKey('  abc-123  ');
    expect(loadMapKey()).toBe('abc-123');
    saveMapKey('   ');
    expect(loadMapKey()).toBe('');
  });
});
