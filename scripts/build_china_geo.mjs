// 生成 Link-R World 自研中国地图所需的边界数据（一次性脚本，产物已提交为 src/data/chinaGeo.ts）
//
// 数据来源：DataV.GeoAtlas 全国行政区划边界（依据国家标准地图公开边界数据制作）
//   https://geo.datav.aliyun.com/areas_v3/bound/100000.json      国界轮廓（含台湾、海南、南海诸岛各岛）
//   https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json 34 个省级行政区 + 100000_JD 南海诸岛段线
//
// 处理：Douglas–Peucker 抽稀 → 坐标保留 3 位小数 → 输出为紧凑字符串数组。
// 用途仅限界面示意，不作测绘用途。

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOL_OUTLINE = 0.045; // 国界抽稀容差（度）
const TOL_PROVINCE = 0.07; // 省级界线抽稀容差（度）

function ringsOf(geom) {
  const out = [];
  const walk = (g) => {
    if (typeof g[0][0] === 'number') out.push(g);
    else g.forEach(walk);
  };
  walk(geom.coordinates);
  return out;
}

/** Douglas–Peucker：保留形状特征，去掉共线冗余点 */
function simplify(pts, tol) {
  if (pts.length <= 3) return pts;
  const sq = tol * tol;
  const sqSegDist = (p, a, b) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b[0];
        y = b[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(pts[i], pts[first], pts[last]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > sq) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  const res = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) res.push(pts[i]);
  return res;
}

const fmt = (ring) => ring.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(';');

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

const outlineSrc = await get('https://geo.datav.aliyun.com/areas_v3/bound/100000.json');
const fullSrc = await get('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json');

// 国界轮廓：保留全部环（台湾、海南、南海诸岛各岛一个都不能少）
const outlineRings = ringsOf(outlineSrc.features[0].geometry)
  .map((r) => simplify(r, TOL_OUTLINE))
  .filter((r) => r.length >= 3)
  .sort((a, b) => b.length - a.length);

// 省级界线
const provinceRings = [];
for (const f of fullSrc.features) {
  const code = String(f.properties?.adcode ?? '');
  if (code === '100000_JD') continue;
  for (const r of ringsOf(f.geometry)) {
    const s = simplify(r, TOL_PROVINCE);
    if (s.length >= 4) provinceRings.push(s);
  }
}

// 南海诸岛段线（100000_JD）
const dashRings = [];
const jd = fullSrc.features.find((f) => String(f.properties?.adcode ?? '') === '100000_JD');
if (jd) for (const r of ringsOf(jd.geometry)) dashRings.push(r);

const dump = (name, rings) => [name, rings.map(fmt), rings.reduce((s, r) => s + r.length, 0)];

const stats = [];
const body = [];
for (const [name, rings] of [
  ['CN_OUTLINE', outlineRings],
  ['CN_PROVINCE_LINES', provinceRings],
  ['CN_NINE_DASH', dashRings],
]) {
  const [n, arr, pts] = dump(name, rings);
  stats.push(`${n}: ${arr.length} 环 / ${pts} 点`);
  body.push(`/** ${n} —— 每项为一条环线："lng,lat;lng,lat;…" */\nexport const ${n}: string[] = [\n${arr
    .map((s) => `  '${s}',`)
    .join('\n')}\n];`);
}

const file = `// Link-R World — 自研中国地图边界数据（自动生成，请勿手改）
//
// 数据来源：DataV.GeoAtlas 全国行政区划边界（依据国家标准地图公开边界数据制作）
//   · 国界轮廓 100000.json（含台湾省、海南岛、南海诸岛各岛礁）
//   · 省级界线 + 南海诸岛段线 100000_full.json（34 个省级行政区 + 100000_JD）
// 抓取日期：2026-10-11
//
// 处理方式：Douglas–Peucker 抽稀（国界 ${TOL_OUTLINE}° / 省级 ${TOL_PROVINCE}°），坐标保留 3 位小数（约 110m）。
// 规模：${stats.join('；')}
//
// 仅用于界面示意底图，不作测绘用途；领土要素（国界、台湾、南海诸岛及段线）按标准地图数据如实呈现。
// 重新生成：node scripts/build_china_geo.mjs

${body.join('\n\n')}

export const CN_GEO_META = {
  source: 'DataV.GeoAtlas 全国行政区划边界（国家标准地图公开边界数据）',
  sourceUrls: [
    'https://geo.datav.aliyun.com/areas_v3/bound/100000.json',
    'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
  ],
  fetchedAt: '2026-10-11',
  toleranceDeg: { outline: ${TOL_OUTLINE}, province: ${TOL_PROVINCE} },
  /** 主图经纬范围（含台湾、海南，南沙放到右下角附图） */
  bbox: { lng: [73, 136] as [number, number], lat: [17.4, 54.2] as [number, number] },
  /** 南海诸岛附图经纬范围 */
  insetBbox: { lng: [105, 125] as [number, number], lat: [3, 22.5] as [number, number] },
  note: '示意底图，不作测绘用途；领土要素按标准地图数据如实呈现。',
} as const;
`;

const target = resolve('src/data/chinaGeo.ts');
writeFileSync(target, file, 'utf8');
console.log(stats.join('\n'));
console.log('→', target, (file.length / 1024).toFixed(1) + ' KB');
