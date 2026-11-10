// Link-R World — 地点搜索：内置精选库 + 腾讯位置服务（地图大数据）
//
// 两层数据源：
//  1) 内置精选库：10 城人工整理的真实地点，离线可用，输入即过滤；
//  2) 地图大数据：腾讯位置服务 POI 搜索（同百度地图的搜法），需要用户填一次
//     免费申请的 Web Service Key（lbs.qq.com → 控制台 → 创建应用 → 勾选 WebServiceAPI）。
//     Key 只存本机 localStorage，请求走 JSONP，不经过任何中间服务器。

import type { CityId } from '../data/cities';
import { tripPlacesOfCity } from '../data/tripData';

const TMAP_KEY_STORAGE = 'lrw-tmap-key';

/**
 * 不预置任何 Key。
 *
 * 这里曾经内置过一个应用作者申请的腾讯地图 Key，但那样等于把一个可用的 Key
 * 随前端包发出去（任何人 View Source 都能拿走），跟界面上「Key 只存在你本机」
 * 的说法相反，也不符合地图合规要求（不得预置可用的密钥）。
 * 现在改成：没有 Key 就只用内置精选库，界面提示用户去申请一个自己的免费 Key。
 */
export const DEFAULT_MAP_KEY = '';

export function loadMapKey(): string {
  try {
    return (localStorage.getItem(TMAP_KEY_STORAGE) ?? '').trim();
  } catch {
    return '';
  }
}

export function saveMapKey(key: string): void {
  try {
    localStorage.setItem(TMAP_KEY_STORAGE, key.trim());
  } catch {
    /* 无痕模式下存不进就仅本次会话可用 */
  }
}

export interface PlaceHit {
  /** 稳定标识：内置用地点 id，地图结果用 POI id */
  id: string;
  name: string;
  district: string;
  /** 附加说明（内置=提示语；地图=详细地址） */
  detail: string;
  ticket: number;
  lat: number;
  lng: number;
  /** source = 'builtin' 走内置地点；'map' 需登记为自定义地点 */
  source: 'builtin' | 'map';
  category?: string;
}

/** 内置精选库的关键词过滤（名称 / 英文名 / 区域 / 提示语） */
export function searchBuiltIn(cityId: CityId, keyword: string, limit = 8): PlaceHit[] {
  const kw = keyword.trim().toLowerCase();
  const pool = tripPlacesOfCity(cityId);
  if (!kw) return pool.slice(0, limit).map(toHit);
  return pool
    .filter((p) =>
      `${p.name}${p.nameEn}${p.district}${p.tip}`.toLowerCase().includes(kw)
    )
    .slice(0, limit)
    .map(toHit);
}

function toHit(p: { id: string; name: string; district: string; tip: string; ticket: number; lat: number; lng: number }): PlaceHit {
  return {
    id: p.id,
    name: p.name,
    district: p.district,
    detail: p.tip,
    ticket: p.ticket,
    lat: p.lat,
    lng: p.lng,
    source: 'builtin',
  };
}

interface TmapPoi {
  id: string;
  title: string;
  address: string;
  category?: string;
  location: { lat: number; lng: number };
}

/** JSONP：浏览器直连腾讯位置服务，无需后端 */
function jsonp(url: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const cb = `lrwpoi_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('地图搜索超时，请检查网络后重试。'));
    }, timeoutMs);
    function cleanup() {
      window.clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[cb];
      script.remove();
    }
    (window as unknown as Record<string, unknown>)[cb] = (data: unknown) => {
      cleanup();
      resolve(data);
    };
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
    script.onerror = () => {
      cleanup();
      reject(new Error('地图服务连接失败（可能是 Key 未开通 WebServiceAPI 或域名白名单未放行）。'));
    };
    document.head.appendChild(script);
  });
}

/**
 * 腾讯位置服务 POI 搜索（城市范围）。
 * 返回 null 表示本机还没配 Key（界面会引导填写）。
 */
export async function searchMap(
  keyword: string,
  cityName: string,
  limit = 8
): Promise<PlaceHit[] | null> {
  // 空关键词是「无操作」，先短路成空结果（与有没有 Key 无关）；
  // 没配 Key 才是「本机没这个能力」，返回 null 让界面去提示申请。
  const kw = keyword.trim();
  if (!kw) return [];
  const key = loadMapKey();
  if (!key) return null;
  const url =
    `https://apis.map.qq.com/ws/place/v1/search?key=${encodeURIComponent(key)}` +
    `&keyword=${encodeURIComponent(kw)}` +
    `&boundary=${encodeURIComponent(`region(${cityName},0)`)}` +
    `&page_size=${limit}&page_index=1`;
  const data = (await jsonp(url)) as { status: number; message?: string; data?: TmapPoi[] };
  if (data.status !== 0) {
    throw new Error(data.message || '地图搜索失败，请检查 Key 是否有效。');
  }
  return (data.data ?? []).map((poi) => {
    const addr = poi.address ?? '';
    const district = addr.split(/市|区|县/).slice(0, 2).join('') || cityName;
    return {
      id: `tmap-${poi.id}`,
      name: poi.title,
      district,
      detail: addr,
      ticket: 0,
      lat: poi.location?.lat ?? 0,
      lng: poi.location?.lng ?? 0,
      source: 'map' as const,
      category: poi.category,
    };
  });
}
