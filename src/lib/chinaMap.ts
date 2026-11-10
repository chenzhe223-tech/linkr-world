// Link-R World — 自研中国地图的投影与几何底（工作台地图 / 行程海报 / 首页探索共用）
//
// 为什么要有这个文件：
//   地图、卡片、路线三处如果各算各的坐标，一定会漂移（旧实现里示意图与海报各写了
//   一套 proj，最终真的画出两个不一样的中国）。这里只保留一套投影，所有消费方
//   （ChinaMap 组件 / 海报 / 首页探索）都从这里取。
//
// 投影口径：等距圆柱投影 + 35°N 标准纬线（经度按 cos35° 压缩）。
//   中国领土东西跨约 62°E、南北跨约 36°N；cos35° 压缩后长宽比 ≈1.36，与
//   「东西约 5200km / 南北约 5500km（含南海）」的实际比例一致，轮廓不会被拉扁或拉长。
//   示意底图，不作测绘用途。
//
// 关键设计：几何一律画在「地理空间」（x = lng × cos35°，y = 90 − lat，单位＝度），
//   缩放靠 viewBox，不重算坐标。于是：
//     · 全国视图、城市局部放大图共用同一份 path，只是 viewBox 不同；
//     · 一个单城行程的 10 个景点在全国图上会挤成一团 —— 那就全国图只放一个「区域」标记，
//       真正的地点分布交给右下角的局部放大图（国家地图的附图惯例）。
//   所有描边用 vector-effect="non-scaling-stroke"，缩放时线宽始终是 1px。

import { CN_NINE_DASH, CN_OUTLINE, CN_PROVINCE_LINES, CN_GEO_META } from '../data/chinaGeo';

export interface GeoBox {
  lngMin: number;
  lngMax: number;
  latMin: number;
  latMax: number;
}

/** SVG viewBox（地理空间，y 轴向下） */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 标准纬线（经度压缩基准） */
export const STD_PARALLEL_DEG = 35;
export const KX = Math.cos((STD_PARALLEL_DEG * Math.PI) / 180);

/** 底图数据本身的经纬范围（与 DataV 数据一致，仅供核对） */
export const CHINA_DATA_BOX: GeoBox = {
  lngMin: CN_GEO_META.bbox.lng[0],
  lngMax: CN_GEO_META.bbox.lng[1],
  latMin: CN_GEO_META.bbox.lat[0],
  latMax: CN_GEO_META.bbox.lat[1],
};

/**
 * 全国取景范围：含台湾、海南，四周留一点海／陆边距 ——
 * 不留边距时海南岛会贴着画框下缘、喀什贴着左缘，看着像被裁掉。
 * 南沙等低纬岛礁由右下角附图按国家地图惯例单独呈现。
 */
export const CHINA_BOX: GeoBox = {
  lngMin: 71.5,
  lngMax: 136.5,
  latMin: 15.0,
  latMax: 54.2,
};

/** 南海诸岛附图经纬范围 */
export const SOUTH_SEA_BOX: GeoBox = {
  lngMin: CN_GEO_META.insetBbox.lng[0],
  lngMax: CN_GEO_META.insetBbox.lng[1],
  latMin: CN_GEO_META.insetBbox.lat[0],
  latMax: CN_GEO_META.insetBbox.lat[1],
};

/* ── 地理空间换算 ──────────────────────────────────────── */

export function boxToView(box: GeoBox): ViewBox {
  return {
    x: box.lngMin * KX,
    y: 90 - box.latMax,
    w: (box.lngMax - box.lngMin) * KX,
    h: box.latMax - box.latMin,
  };
}

export function viewAspect(vb: ViewBox): number {
  return vb.w / vb.h;
}

/** 经纬度 → 某个 viewBox 内的百分比（HTML 节点层用百分比定位，字号不随缩放） */
export function latLngToPercent(lat: number, lng: number, vb: ViewBox): { left: number; top: number } {
  return {
    left: ((lng * KX - vb.x) / vb.w) * 100,
    top: ((90 - lat - vb.y) / vb.h) * 100,
  };
}

export function boxCenter(box: GeoBox): { lat: number; lng: number } {
  return { lat: (box.latMin + box.latMax) / 2, lng: (box.lngMin + box.lngMax) / 2 };
}

/** 点集包围盒（可给最小跨度，避免极近的点被放到无法辨认的缩放级别） */
export function bboxOfPoints(
  pts: Array<{ lat: number; lng: number }>,
  minSpanDeg = 0
): GeoBox | null {
  const valid = pts.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  if (valid.length === 0) return null;
  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);
  let latMin = Math.min(...lats);
  let latMax = Math.max(...lats);
  let lngMin = Math.min(...lngs);
  let lngMax = Math.max(...lngs);
  const pad = (lo: number, hi: number): [number, number] => {
    const span = Math.max(hi - lo, minSpanDeg);
    const extra = span * 0.1;
    const mid = (lo + hi) / 2;
    return [mid - span / 2 - extra, mid + span / 2 + extra];
  };
  const dLat = pad(latMin, latMax);
  const dLng = pad(lngMin, lngMax);
  latMin = dLat[0];
  latMax = dLat[1];
  lngMin = dLng[0];
  lngMax = dLng[1];
  // 不能越出全国取景范围，否则局部图里会露出地图数据之外的空域
  return {
    lngMin: Math.max(CHINA_BOX.lngMin, lngMin),
    lngMax: Math.min(CHINA_BOX.lngMax, lngMax),
    latMin: Math.max(CHINA_BOX.latMin + 0.05, latMin),
    latMax: Math.min(CHINA_BOX.latMax, latMax),
  };
}

/* ── 环数据 → 地理空间的 SVG path（模块加载时算一次） ─────── */

function parseRing(ring: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const seg of ring.split(';')) {
    const c = seg.split(',');
    if (c.length !== 2) continue;
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) out.push([lng, lat]);
  }
  return out;
}

function ringToPath(pts: Array<[number, number]>): string {
  let d = '';
  for (let i = 0; i < pts.length; i += 1) {
    d += `${i === 0 ? 'M' : 'L'}${(pts[i][0] * KX).toFixed(3)} ${(90 - pts[i][1]).toFixed(3)}`;
  }
  return `${d}Z`;
}

/** 国界轮廓（含台湾省、海南岛、南海诸岛各岛礁） */
export const LAND_PATHS: string[] = CN_OUTLINE.map((r) => ringToPath(parseRing(r)));

/** 省级界线 */
export const PROVINCE_PATHS: string[] = CN_PROVINCE_LINES.map((r) => ringToPath(parseRing(r)));

/** 南海诸岛段线（十段线） */
export const NINE_DASH_PATHS: string[] = CN_NINE_DASH.map((r) => ringToPath(parseRing(r)));

export const CN_GEO_SOURCE = {
  source: CN_GEO_META.source,
  sourceUrls: CN_GEO_META.sourceUrls,
  fetchedAt: CN_GEO_META.fetchedAt,
  note: CN_GEO_META.note,
};

/** 底图是否可用（数据缺失时组件显示降级提示，不留空白） */
export const CHINA_GEO_READY = LAND_PATHS.length > 0 && PROVINCE_PATHS.length > 0;

/* ── 经纬网（按视野自动选间隔，任何缩放级别都有经纬线） ───── */

const GC_STEPS = [10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];

export function graticuleStep(spanDeg: number): number {
  for (const s of GC_STEPS) {
    if (spanDeg / s >= 3 && spanDeg / s <= 9) return s;
  }
  return spanDeg > 60 ? 10 : GC_STEPS[GC_STEPS.length - 1];
}

export interface GraticuleLine {
  key: string;
  /** 地理空间坐标 */
  a: [number, number];
  b: [number, number];
  label: string;
  /** 标注位置 */
  lx: number;
  ly: number;
  anchor: 'start' | 'middle';
}

/** 某个视野下的经纬网 + 标注（标注贴左／下边） */
export function graticuleFor(box: GeoBox): GraticuleLine[] {
  const step = graticuleStep(Math.max(box.lngMax - box.lngMin, box.latMax - box.latMin));
  const out: GraticuleLine[] = [];
  const xLo = box.lngMin * KX;
  const xHi = box.lngMax * KX;
  const yLo = 90 - box.latMax;
  const yHi = 90 - box.latMin;
  const startLng = Math.ceil(box.lngMin / step) * step;
  for (let lng = startLng; lng <= box.lngMax; lng += step) {
    const x = lng * KX;
    out.push({
      key: `lng${lng.toFixed(3)}`,
      a: [x, yLo],
      b: [x, yHi],
      label: fmtLng(lng),
      lx: x,
      ly: yHi - (yHi - yLo) * 0.012,
      anchor: 'middle',
    });
  }
  const startLat = Math.ceil(box.latMin / step) * step;
  for (let lat = startLat; lat <= box.latMax; lat += step) {
    const y = 90 - lat;
    out.push({
      key: `lat${lat.toFixed(3)}`,
      a: [xLo, y],
      b: [xHi, y],
      label: fmtLat(lat),
      lx: xLo + (xHi - xLo) * 0.008,
      ly: y - (yHi - yLo) * 0.012,
      anchor: 'start',
    });
  }
  return out;
}

function fmtLng(lng: number): string {
  const v = step3(lng);
  return v >= 0 ? `${v}°E` : `${step3(-v)}°W`;
}

function fmtLat(lat: number): string {
  const v = step3(lat);
  return v >= 0 ? `${v}°N` : `${step3(-v)}°S`;
}

function step3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 地图脚注用的投影口径说明 */
export const PROJECTION_NOTE = `等距圆柱投影 · ${STD_PARALLEL_DEG}°N 标准纬线（经度按 cos${STD_PARALLEL_DEG}° 压缩）`;

/** 默认全国视野 */
export const CHINA_VIEW: ViewBox = boxToView(CHINA_BOX);
