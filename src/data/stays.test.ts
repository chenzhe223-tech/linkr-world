// Link-R World — 特色住宿模块测试
//
// 这个模块最容易出的错不是"排得不好看"，而是**事实性错误**：
//  · 携程 ID 缺失 / 重复 → 用户点开的核验链接指向别家酒店；
//  · 钻级越界或凭空写 5 钻 → 页面上的"几钻"成了编出来的数字；
//  · 品牌集团与品牌名对不上（例如把凯悦写成万豪）→ 筛选器直接骗人；
//  · 覆盖不到用户点名要的那几个国际集团 → 需求没被满足。
// 下面把这些全部钉死，另外把个性化排序的行为固定下来（只改顺序，不改事实）。
import { describe, expect, it } from 'vitest';
import {
  STAYS,
  STAY_SOURCE,
  allBrandGroups,
  ctripUrl,
  matchStays,
  sortStays,
  staysOfCity,
  type StayTag,
  type StayTier,
} from './stays';
import type { CityId } from './cities';

const STAY_CITIES: CityId[] = ['dali', 'tengchong', 'lijiang'];
const TIERS: StayTier[] = ['国际连锁', '国内连锁', '度假奢华', '精品民宿'];
const TAGS: StayTag[] = [
  '独行', '情侣', '亲子', '带父母', '摄影', '温泉', '海景', '古城步行', '性价比', '度假', '秘境',
];

describe('住宿名录 · 数据不变量', () => {
  it('只覆盖首批三城，且每城都有门店', () => {
    for (const c of STAY_CITIES) {
      expect(staysOfCity(c).length, `${c} 门店数为 0`).toBeGreaterThan(0);
    }
    const others = Array.from(new Set(STAYS.map((s) => s.cityId))).filter(
      (c) => !STAY_CITIES.includes(c)
    );
    expect(others, `出现了预期外的城市 ${others.join(',')}`).toEqual([]);
  });

  it('每家都有携程 ID，可用于逐家核验，且全局不重复', () => {
    const ids = STAYS.map((s) => s.ctripId);
    for (const s of STAYS) {
      expect(s.ctripId, `${s.name} 缺携程 ID`).toMatch(/^\d{4,}$/);
    }
    expect(new Set(ids).size, '携程 ID 出现重复').toBe(ids.length);
  });

  it('门店内部 id 唯一（筛选与 key 都依赖它）', () => {
    const ids = STAYS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('钻级只能是 0–5 之间的整数（0 = 未取得，页面显示"钻级待核"）', () => {
    for (const s of STAYS) {
      expect(Number.isInteger(s.diamond), `${s.name} 钻级不是整数`).toBe(true);
      expect(s.diamond, `${s.name} 钻级越界`).toBeGreaterThanOrEqual(0);
      expect(s.diamond, `${s.name} 钻级越界`).toBeLessThanOrEqual(5);
    }
  });

  it('层级取值合法，且每家至少有一个适用人群标签 + 一条入住提示', () => {
    for (const s of STAYS) {
      expect(TIERS, `${s.name} 层级非法`).toContain(s.tier);
      expect(s.bestFor.length, `${s.name} 没有适用标签`).toBeGreaterThan(0);
      for (const t of s.bestFor) expect(TAGS, `${s.name} 标签非法`).toContain(t);
      expect(s.note.trim().length, `${s.name} 提示过短`).toBeGreaterThan(10);
      expect(s.brandGroup.trim().length, `${s.name} 缺集团`).toBeGreaterThan(0);
      expect(s.brand.trim().length, `${s.name} 缺品牌`).toBeGreaterThan(0);
      expect(s.area.trim().length, `${s.name} 缺片区`).toBeGreaterThan(0);
    }
  });

  it('点名要的国际集团全部覆盖（IHG / 万豪 / 雅高 / 凯悦 / 华住 / 锦江 / 希尔顿 / 温德姆）', () => {
    const groups = allBrandGroups().join(' | ');
    const want = [
      ['IHG', /IHG/],
      ['万豪', /万豪/],
      ['雅高', /雅高/],
      ['凯悦', /凯悦/],
      ['华住', /华住/],
      ['锦江', /锦江/],
      ['希尔顿', /希尔顿/],
      ['温德姆', /温德姆/],
    ] as const;
    for (const [label, re] of want) {
      expect(re.test(groups), `集团清单里没有 ${label}`).toBe(true);
    }
  });

  it('国际连锁一档里，每家都是 4–5 钻（同名独立店不得混进来）', () => {
    const intl = STAYS.filter((s) => s.tier === '国际连锁');
    expect(intl.length).toBeGreaterThanOrEqual(15);
    for (const s of intl) {
      expect(s.diamond, `${s.name}（${s.brandGroup}）钻级异常：${s.diamond}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('数据来源口径写在常量里（页面可见）', () => {
    expect(STAY_SOURCE).toMatch(/携程/);
    expect(STAY_SOURCE).toMatch(/抓取/);
  });
});

describe('核验链接', () => {
  it('携程链接带上本店 ID，且是 https', () => {
    for (const s of STAYS) {
      const url = ctripUrl(s);
      expect(url.startsWith('https://')).toBe(true);
      expect(url).toContain(s.ctripId);
    }
  });
});

describe('排序 · 层级优先、钻级次之', () => {
  it('稳定排序：层级按固定顺序，层级内钻级从高到低', () => {
    const sorted = sortStays(staysOfCity('dali'));
    let lastTier = -1;
    let lastDiamond = 6;
    for (const s of sorted) {
      const ti = TIERS.indexOf(s.tier);
      expect(ti, `${s.name} 层级非法`).toBeGreaterThanOrEqual(0);
      if (ti === lastTier) {
        expect(s.diamond, `${s.name} 钻级顺序乱了`).toBeLessThanOrEqual(lastDiamond);
      } else {
        expect(ti, `${s.name} 层级顺序乱了`).toBeGreaterThan(lastTier);
      }
      lastTier = ti;
      lastDiamond = s.diamond;
    }
  });

  it('不改动入参数组（返回副本）', () => {
    const input = staysOfCity('lijiang');
    const before = input.map((s) => s.id);
    sortStays(input);
    expect(input.map((s) => s.id)).toEqual(before);
  });
});

describe('个性化匹配 · 只改顺序与理由，不改事实', () => {
  it('返回本城全部门店，一个不多一个不少', () => {
    for (const c of STAY_CITIES) {
      const m = matchStays(c, { companions: '带孩子' });
      expect(m.length).toBe(staysOfCity(c).length);
      expect(new Set(m.map((x) => x.stay.id)).size).toBe(m.length);
    }
  });

  it('写"泡温泉"时，温泉标签的店排到最前', () => {
    const m = matchStays('tengchong', { keywords: ['温泉', '泡汤'] });
    expect(m[0]!.hits).toContain('温泉');
    const firstNonHit = m.findIndex((x) => !x.hits.includes('温泉'));
    const lastHit = m.map((x) => x.hits.includes('温泉')).lastIndexOf(true);
    if (firstNonHit >= 0) expect(lastHit).toBeLessThan(firstNonHit);
  });

  it('写"看海"时，海景标签的店排到最前', () => {
    const m = matchStays('dali', { keywords: ['洱海', '看海'] });
    expect(m[0]!.hits).toContain('海景');
  });

  it('带父母 / 亲子会命中对应标签，理由是完整句子', () => {
    for (const c of STAY_CITIES) {
      const m = matchStays(c, { companions: '带父母和孩子' });
      expect(m[0]!.hits.length, `${c} 无任何命中`).toBeGreaterThan(0);
      for (const x of m) {
        expect(x.reason.trim().length).toBeGreaterThan(8);
        expect(x.reason.endsWith('。')).toBe(true);
      }
    }
  });

  it('没给任何偏好时也不崩溃，仍返回全部并给出兜底理由', () => {
    for (const c of STAY_CITIES) {
      const m = matchStays(c, {});
      expect(m.length).toBe(staysOfCity(c).length);
      for (const x of m) expect(x.reason.trim().length).toBeGreaterThan(8);
    }
  });

  it('预算友好会命中"性价比"标签', () => {
    const m = matchStays('dali', { budgetFriendly: true });
    expect(m.some((x) => x.hits.includes('性价比'))).toBe(true);
  });
});

describe('筛选器可选值', () => {
  it('集团清单来自数据本身，去重且排序稳定', () => {
    const g1 = allBrandGroups();
    const g2 = allBrandGroups();
    expect(g1).toEqual(g2);
    expect(new Set(g1).size).toBe(g1.length);
    for (const g of g1) expect(STAYS.some((s) => s.brandGroup === g)).toBe(true);
  });
});
