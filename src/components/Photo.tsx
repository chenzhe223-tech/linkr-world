// Link-R World — 真实照片展示组件（Wave 18）
//
// 照片来自 scripts/fetch_photos.py 抓取的 Wikimedia Commons 自由许可图，
// 与站点同源部署（/photos/...），离线单文件打开时加载失败自动回退到手绘 SVG 插画。

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { CityId } from '../data/cities';
import { CITY_HERO, FOOD_PHOTO, PLACE_PHOTO } from '../data/photos';
import { CitySkyline, PlaceArt } from './CityArt';

/** 餐饮类地点 → 品类真实图标签（对应 photos/food/<tag>.jpg） */
const FOOD_TAGS: Array<[RegExp, string]> = [
  [/sh-dahuchun|sz-yaba/, 'shengjian'],
  [/wx-wangxing|wx-yiqinyuan|sh-laoshengchang/, 'xiaolong'],
  [/bj-sijimin/, 'kaoya'],
  [/xa-laosunjia|xa-laomijia/, 'paomo'],
  [/xa-zhangji|xa-fanji/, 'roujiamo'],
  [/qz-houapo/, 'zongzi'],
  [/sh-guangmingcun/, 'mooncake'],
  [/sz-tongdexing|hz-kuiyuan|wx-gongbeilou|sz-zhuhongxing|sz-yuxingji|sz-lvyang|qz-guozai|pe-migan|pe-mohei|qz-niurougeng|wx-taihu-sanbai|bj-haiwanju|bj-nailaowei/, 'noodle'],
  [/cd-zhongshuijiao/, 'wonton'],
  [/cd-yulin-chuanchuan/, 'hotpot'],
  [/bn-xiangmaocao|pe-jinggu-sunsuanyu/, 'grilledfish'],
  [/bn-zhuafan|pe-manxieba|bn-zhanshuiji/, 'rice'],
  [/bn-boluofan|pe-bolanzi/, 'pineapple-rice'],
  [/pe-aini|pe-xiaoaozi|bn-kafei/, 'coffee-estate'],
  [/xa-chahualong/, 'milktea'],
  [/sz-honglou/, 'juice'],
  [/bn-mange-market/, 'fruit'],
  [/hz-wushan|hz-wulin-night|pe-yeshi|xs-xingguang|pe-chamagucheng|pu-night-bites|bn-shuaibaba/, 'nightmarket'],
  [/hz-hupaju|hz-qingteng|sz-sanwanchang|pe-teahouse|bj-wuyutai|bj-dawancha|qz-minnan-tea|sh-hupaju/, 'tea'],
  [/sh-peace-jazz|qz-xijie-bars|su-shiquan-bars|hz-nanshan-bars|wx-nanchang-bars|xa-shuncheng-bars/, 'cocktail'],
  [/bj-jinga|bn-gaozhuang-bars/, 'craftbeer'],
  [/cd-yulin-jiuguan/, 'cocktail'],
  [/sh-ruby|sh-wangjiasha|sz-caizhizhai|sz-maokong|wx-muguiying|wx-lulugaojian|wx-huishan-susu|xa-shisan|xa-demougon|hz-dingshenggao|qz-shihuagao|qz-yuanhetang|cd-heji|cd-bingfen/, 'dish'],
  // 只保留真正的菜馆/小吃店（2026-10-10 修复：咖啡店、茶馆、书店此前混在这条规则里，
  // 导致 % Arabica 上出了王家沙的点心图——咖啡/茶/酒吧的品类图由 KIND_TAG 兜底）
  [/bj-huguo|bj-yaoji|bj-wenyu|bj-baodufeng|cd-longchaoshou|cd-chenmapo|cd-mawangzi|cd-zhangliangfen|xa-xianfanzhuang|pe-nakeli-fan|pe-manxieba|qz-sidan|qz-dongxing-niu|qz-yafo|qz-haochengcai|bn-manfeilong|bn-zhua|hz-louwailou|hz-ganqishi|hz-zhiweiguan|hz-kuiyuan|sz-songhelou|sz-huangtianyuan/, 'dish'],
  // 云南三城（Wave 19）：招牌菜的品类图
  [/dl-xizhoubaba|dl-zaijianshou|lj-shaozi|tc-dajiujia|lj-dashibridge/, 'noodle'],
  [/tc-tengpin|tc-pintengchong|tc-qiaoxiangzhai|lj-apopo/, 'hotpot'],
  [/lj-naxikaoyu/, 'grilledfish'],
  [/lj-zhongyi|tc-sanqiao|tc-dongfanglu|dl-renminlu/, 'nightmarket'],
  [/dl-sandao-cha|tc-qiwang|tc-jingsi/, 'tea'],
  [/dl-yangshi|tc-guyuexuan/, 'mooncake'],
  // 招牌菜对专属品类图：豆粉 / 炭火烧烤（铜瓢牛肉），不再挤在泛 dish 图里
  [/tc-cundama|tc-xidoufen|pe-doufen/, 'doufen'],
  [/dl-haidongqiezi|tc-tengpin/, 'skewer'],
  [/dl-yangji|tc-linmama|lj-nainai/, 'dish'],
];

/**
 * 店铺类型 → 品类图（id 规则未命中时兜底）。
 * 注意：food / dessert 故意不给泛「dish」图——同一条街的小店各用一张通用菜图，
 * 等于满屏重复（2026-10-10 用户反馈）。没有专属品类图的店回退手绘插画，不硬凑。
 */
const KIND_TAG: Record<string, string> = {
  cafe: 'coffee',
  tea: 'tea',
  bar: 'cocktail',
};

export function foodTagOf(place: { id: string; kind: string }): string | null {
  for (const [re, tag] of FOOD_TAGS) {
    if (re.test(place.id)) {
      // 类型守卫：泛泛的「dish」图不得盖过更具体的店铺类型
      // （2026-10-10 用户反馈：咖啡店不能上点心图）
      if (tag === 'dish') return KIND_TAG[place.kind] ?? tag;
      return tag;
    }
  }
  return KIND_TAG[place.kind] ?? null;
}

/** 餐饮类地点：没有专属品类图就回退插画，不再硬凑城市大图（满屏同一张 = 硬凑） */
const FOOD_KINDS = new Set(['food', 'dessert', 'cafe', 'tea', 'bar']);

/** 行程块照片：专属地标图 → 品类美食图 → 城市大图（都没有则回退插画） */
export function photoOf(place: { id: string; kind: string }, cityId?: string): string | undefined {
  const specific = PLACE_PHOTO[place.id] ?? FOOD_PHOTO[foodTagOf(place) ?? ''];
  if (specific) return specific;
  if (FOOD_KINDS.has(place.kind)) return undefined;
  return cityId ? CITY_HERO[cityId] : undefined;
}

/** 城市大图 URL（无则 undefined，调用方回退插画） */
export function heroPhotoOf(cityId: CityId): string | undefined {
  return CITY_HERO[cityId];
}

/** 行程块缩略图（64px 圆角），加载失败回退类别插画 */
export function PlacePhoto({ place, cityId }: { place: { id: string; kind: string }; cityId?: string }) {
  const [failed, setFailed] = useState(false);
  const tag = foodTagOf(place);
  const src =
    PLACE_PHOTO[place.id] ??
    FOOD_PHOTO[tag ?? ''] ??
    (FOOD_KINDS.has(place.kind) ? undefined : cityId ? CITY_HERO[cityId] : undefined);
  if (!src || failed) {
    return <PlaceArt kind={place.kind} cityId={cityId as CityId} />;
  }
  return (
    <img
      className="place-photo"
      src={src}
      alt="地点实景"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** 城市英雄区：真实照片 + 压暗渐变；无照片/加载失败回退手绘天际线 */
export function CityHero({ cityId, children }: { cityId: CityId; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  const src = heroPhotoOf(cityId);
  const isPhoto = Boolean(src) && !failed;
  return (
    <div className={`city-hero${isPhoto ? ' is-photo' : ''}`}>
      {isPhoto ? (
        <img
          className="city-photo"
          src={src}
          alt="城市地标实景"
          onError={() => setFailed(true)}
        />
      ) : (
        <CitySkyline cityId={cityId as CityId} />
      )}
      {isPhoto ? <div className="hero-scrim" aria-hidden="true" /> : null}
      {children}
    </div>
  );
}
