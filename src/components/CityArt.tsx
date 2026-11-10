// Link-R World — 城市地标插画 + 地点类别插画
//
// 全部为手绘风格的内联 SVG（离线可用、不依赖外链图床）：
//  · CitySkyline：页面顶部的城市地标建筑群横幅（每城一幅代表性天际线）；
//  · PlaceArt：行程块左侧的类别插画（景点 / 餐饮 / 咖啡 / 茶 / 甜品 / 微醺…），
//    色相随城市状态色微调，让整页看起来丰富、活泼但不花哨。
import type { ReactNode } from 'react';
import type { CityId } from '../data/cities';
import { getCity } from '../data/cities';

// ── 城市地标天际线 ────────────────────────────────────────────

/** 天际线画布：360 × 150 */
function Skyline({ id, color, children }: { id: string; color: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 360 150" className="city-skyline" role="img" aria-label={`城市地标插画 ${id}`}>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="70%" stopColor={color} stopOpacity="0.06" />
          <stop offset="100%" stopColor="#F7F8FA" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="360" height="150" fill={`url(#sky-${id})`} />
      {/* 落日 / 淡月 */}
      <circle cx="296" cy="42" r="17" fill="#C8862F" opacity="0.5" />
      {children}
      {/* 地面 / 水面 */}
      <rect x="0" y="128" width="360" height="22" fill={color} opacity="0.22" />
      <rect x="0" y="128" width="360" height="3" fill={color} opacity="0.5" />
    </svg>
  );
}

const SKYLINES: Record<CityId, ReactNode> = {
  // 上海：陆家嘴三件套 + 外滩钟楼
  shanghai: (
    <g fill="#0B3A5B">
      <path d="M40 128 V96 h14 v32z M60 128 V88 h10 v32z" opacity="0.55" />
      <path d="M84 128 V60 q10 -8 20 0 V128z" opacity="0.75" />
      <rect x="122" y="46" width="4" height="82" />
      <circle cx="124" cy="52" r="7" />
      <circle cx="124" cy="70" r="10" />
      <circle cx="124" cy="92" r="13" opacity="0.85" />
      <path d="M148 128 V72 q16 -12 32 0 V128z" opacity="0.9" />
      <path d="M190 128 V80 h18 l4 -14 4 14 h16 v48z" opacity="0.6" />
      <rect x="238" y="92" width="26" height="36" opacity="0.55" />
      <path d="M247 92 V78 h8 v14z" opacity="0.55" />
      <rect x="272" y="102" width="20" height="26" opacity="0.4" />
    </g>
  ),
  // 北京：天坛 + 天安门 + 古树
  beijing: (
    <g fill="#5A4F42">
      <path d="M46 128 v-20 h56 v20z" opacity="0.8" />
      <path d="M40 108 q34 -14 68 0 l-6 -8 h-56z" opacity="0.9" />
      <rect x="66" y="86" width="12" height="16" opacity="0.9" />
      <ellipse cx="72" cy="80" rx="26" ry="9" opacity="0.95" />
      <ellipse cx="72" cy="70" rx="20" ry="8" />
      <ellipse cx="72" cy="61" rx="13" ry="7" />
      <path d="M150 128 v-34 h44 v34z" opacity="0.85" />
      <path d="M144 94 h56 l-8 -12 h-40z" opacity="0.95" />
      <rect x="168" y="72" width="8" height="10" />
      <circle cx="252" cy="112" r="16" opacity="0.35" />
      <rect x="248" y="112" width="8" height="16" opacity="0.5" />
    </g>
  ),
  // 苏州：虎丘斜塔 + 白墙黛瓦 + 拱桥
  suzhou: (
    <g>
      <g fill="#3E4A5A">
        <path d="M64 128 V70 h4 l3 -12 3 12 h4 v58z" transform="rotate(-4 76 128)" opacity="0.85" />
        <path d="M62 70 h18 l-2 -8 h-14z" transform="rotate(-4 76 128)" />
      </g>
      <g fill="#0B3A5B">
        <path d="M120 128 V104 h30 v24z" opacity="0.18" />
        <path d="M114 104 l21 -12 21 12z" opacity="0.65" />
        <path d="M170 128 V100 h34 v28z" opacity="0.18" />
        <path d="M164 100 l23 -13 23 13z" opacity="0.65" />
      </g>
      <path d="M238 128 q26 -34 52 0 h-10 q-16 -20 -32 0z" fill="#3E4A5A" opacity="0.8" />
    </g>
  ),
  // 杭州：雷峰塔 + 断桥 + 垂柳
  hangzhou: (
    <g fill="#436B63">
      <path d="M84 128 V78 h22 v50z" opacity="0.85" />
      <path d="M78 78 h34 l-4 -8 h-26z" />
      <ellipse cx="95" cy="64" rx="20" ry="7" />
      <ellipse cx="95" cy="55" rx="13" ry="6" />
      <path d="M150 128 v-16 q18 -14 36 0 v16z" opacity="0.5" />
      <path d="M236 128 V92 q-16 -6 -14 -30 q6 16 14 18 q8 -2 14 -18 q2 24 -14 30 z" opacity="0.75" />
      <rect x="234" y="92" width="4" height="36" opacity="0.75" />
    </g>
  ),
  // 无锡：太湖 + 塔影 + 樱花
  wuxi: (
    <g fill="#4F7F78">
      <path d="M56 128 V86 h18 v42z" opacity="0.85" />
      <path d="M50 86 h30 l-5 -9 h-20z" />
      <ellipse cx="65" cy="70" rx="17" ry="7" />
      <ellipse cx="65" cy="61" rx="11" ry="6" />
      <circle cx="150" cy="98" r="7" fill="#D89A9A" />
      <circle cx="164" cy="90" r="6" fill="#D89A9A" opacity="0.8" />
      <circle cx="156" cy="80" r="5" fill="#D89A9A" opacity="0.6" />
      <rect x="152" y="104" width="4" height="24" opacity="0.6" />
      <circle cx="262" cy="100" r="6" fill="#D89A9A" opacity="0.7" />
      <circle cx="274" cy="92" r="5" fill="#D89A9A" opacity="0.55" />
      <rect x="261" y="106" width="3" height="22" opacity="0.5" />
    </g>
  ),
  // 普洱：茶山梯田 + 茅亭
  puer: (
    <g fill="#4C6B4F">
      <path d="M0 128 q60 -30 120 -10 q60 20 120 -6 q60 -24 120 4 v12z" opacity="0.5" />
      <path d="M30 118 q50 -22 100 -6" stroke="#3A523C" strokeWidth="2" fill="none" opacity="0.6" />
      <path d="M210 116 q50 -20 100 0" stroke="#3A523C" strokeWidth="2" fill="none" opacity="0.6" />
      <path d="M120 116 v-22 h18 v22z" opacity="0.8" />
      <path d="M114 94 l15 -14 15 14z" opacity="0.9" />
    </g>
  ),
  // 西双版纳：大金塔 + 棕榈 + 傣楼
  xishuangbanna: (
    <g>
      <g fill="#C8862F">
        <path d="M78 128 V84 h12 v44z" opacity="0.9" />
        <path d="M84 52 l8 32 h-16z" opacity="0.9" />
        <circle cx="84" cy="48" r="4" />
      </g>
      <g fill="#3E5C46">
        <rect x="140" y="96" width="4" height="32" opacity="0.8" />
        <path d="M142 96 q-20 -6 -24 -26 q16 12 24 14 q8 -2 24 -14 q-4 20 -24 26z" opacity="0.75" />
        <path d="M196 128 v-24 h36 v24z" opacity="0.6" />
        <path d="M190 104 l24 -14 24 14z" opacity="0.8" />
        <path d="M256 128 v-20 h30 v20z" opacity="0.5" />
        <path d="M251 108 l21 -12 21 12z" opacity="0.7" />
      </g>
    </g>
  ),
  // 西安：城墙城楼 + 大雁塔
  xian: (
    <g fill="#6B4A35">
      <rect x="36" y="102" width="180" height="26" opacity="0.55" />
      <path d="M46 102 v-8 h160 v8z" opacity="0.7" />
      <path d="M96 102 v-30 h60 v30z" opacity="0.85" />
      <path d="M90 72 h72 l-10 -16 h-52z" opacity="0.95" />
      <rect x="124" y="56" width="4" height="8" />
      <path d="M252 128 V58 h18 v70z" opacity="0.9" />
      <path d="M246 58 h30 l-5 -10 h-20z" />
      <ellipse cx="261" cy="42" rx="15" ry="6" />
    </g>
  ),
  // 泉州：东西双塔 + 红砖厝
  quanzhou: (
    <g>
      <g fill="#5A5148">
        <path d="M66 128 V72 h16 v56z" opacity="0.9" />
        <path d="M60 72 h28 l-4 -9 h-20z" />
        <ellipse cx="74" cy="57" rx="12" ry="6" />
        <path d="M126 128 V80 h14 v48z" opacity="0.9" />
        <path d="M120 80 h26 l-4 -8 h-18z" />
        <ellipse cx="133" cy="66" rx="11" ry="6" />
      </g>
      <g fill="#B65C3F">
        <path d="M190 128 v-26 h44 v26z" opacity="0.55" />
        <path d="M184 102 l28 -16 28 16z" opacity="0.75" />
        <path d="M262 128 v-20 h40 v20z" opacity="0.45" />
        <path d="M256 108 l26 -14 26 14z" opacity="0.65" />
      </g>
    </g>
  ),
  // 成都：竹影 + 亭台 + 廊桥
  chengdu: (
    <g>
      <g fill="#4C6B4F" opacity="0.75">
        <rect x="46" y="70" width="3" height="58" />
        <path d="M47 74 q-16 -8 -20 -24 q16 8 20 12 z" />
        <path d="M47 84 q16 -8 20 -24 q-16 8 -20 12 z" />
        <rect x="66" y="82" width="2.5" height="46" opacity="0.8" />
      </g>
      <g fill="#5A4F42">
        <path d="M110 128 v-26 h44 v26z" opacity="0.55" />
        <path d="M104 102 l28 -16 28 16z" opacity="0.85" />
        <rect x="126" y="88" width="6" height="10" opacity="0.7" />
        <path d="M196 128 v-20 h84 v20z" opacity="0.4" />
        <path d="M190 108 h96 l-8 -12 h-80z" opacity="0.6" />
      </g>
    </g>
  ),
  // 大理：苍山 + 崇圣寺三塔 + 洱海
  dali: (
    <g>
      <g fill="#7E93A8" opacity="0.75">
        <path d="M0 82 L34 46 L62 74 L86 52 L112 78 L136 60 L166 82 v24 H0z" opacity="0.55" />
        <path d="M0 92 L40 64 L74 88 L104 70 L140 94 L172 74 L204 94 v12 H0z" opacity="0.4" />
      </g>
      <g fill="#5C6B72">
        <path d="M74 128 V86 h11 v42z" opacity="0.9" />
        <path d="M68 86 h23 l-3 -8 h-17z" />
        <ellipse cx="79.5" cy="74" rx="10" ry="5" />
        <path d="M100 128 V94 h9 v34z" opacity="0.85" />
        <path d="M95 94 h19 l-3 -7 h-13z" />
        <ellipse cx="104.5" cy="84" rx="8" ry="4" />
        <path d="M122 128 V94 h9 v34z" opacity="0.85" />
        <path d="M117 94 h19 l-3 -7 h-13z" />
        <ellipse cx="126.5" cy="84" rx="8" ry="4" />
      </g>
      <g fill="#8FA6B8" opacity="0.5">
        <path d="M228 128 q30 -12 60 -2 q26 8 62 0 v2 H228z" opacity="0.6" />
      </g>
      <g fill="#4E6B72" opacity="0.6">
        <rect x="272" y="92" width="3" height="26" />
        <path d="M273.5 92 q-14 -6 -17 -20 q12 9 17 11 q6 -2 18 -11 q-4 14 -18 20z" opacity="0.8" />
      </g>
    </g>
  ),
  // 腾冲：火山锥 + 热海硫磺雾 + 和顺古楼
  tengchong: (
    <g>
      <g fill="#8A6E4B" opacity="0.7">
        <path d="M0 128 L44 74 L88 128z" opacity="0.55" />
        <path d="M40 78 q6 -6 12 0 q-6 4 -12 0z" opacity="0.9" />
        <path d="M92 128 L136 82 L180 128z" opacity="0.45" />
      </g>
      <g fill="#B9AE9A" opacity="0.55">
        <ellipse cx="212" cy="96" rx="26" ry="10" />
        <ellipse cx="238" cy="86" rx="18" ry="8" opacity="0.7" />
        <ellipse cx="196" cy="84" rx="14" ry="6" opacity="0.6" />
      </g>
      <g fill="#6B5A44">
        <path d="M258 128 v-38 h40 v38z" opacity="0.5" />
        <path d="M252 90 l26 -16 26 16z" opacity="0.8" />
        <rect x="274" y="100" width="8" height="12" opacity="0.75" />
        <rect x="292" y="70" width="3.5" height="20" opacity="0.85" />
        <path d="M293.5 70 q-14 -6 -18 -20 q13 9 18 11 q6 -2 18 -11 q-4 14 -18 20z" opacity="0.75" />
      </g>
      <rect x="0" y="128" width="360" height="22" fill="#8A6E4B" opacity="0.2" />
    </g>
  ),
  // 丽江：玉龙雪山 + 大水车 + 纳西木楼
  lijiang: (
    <g>
      <g fill="#6E7F9B">
        <path d="M0 104 L48 44 L86 88 L120 56 L162 104z" opacity="0.5" />
        <path d="M44 50 L48 44 L56 54 L50 56z" fill="#F7F8FA" opacity="0.85" />
        <path d="M116 62 L120 56 L128 66 L122 68z" fill="#F7F8FA" opacity="0.8" />
        <path d="M162 104 L206 66 L250 104z" opacity="0.35" />
      </g>
      <g fill="#5A4F42" opacity="0.9">
        <circle cx="286" cy="98" r="20" opacity="0.35" />
        <circle cx="286" cy="98" r="20" fill="none" stroke="#5A4F42" strokeWidth="2.5" opacity="0.8" />
        <rect x="283" y="98" width="6" height="30" />
        <path d="M279 98 h14 M279 118 h14" stroke="#5A4F42" strokeWidth="3" />
      </g>
      <g fill="#6B5A44">
        <path d="M196 128 v-22 h36 v22z" opacity="0.5" />
        <path d="M190 106 l24 -14 24 14z" opacity="0.8" />
        <path d="M248 128 v-18 h30 v18z" opacity="0.45" />
        <path d="M243 110 l20 -12 20 12z" opacity="0.7" />
      </g>
    </g>
  ),
};

/** 城市地标天际线横幅（离线插画，不依赖外链图片） */
export function CitySkyline({ cityId }: { cityId: CityId }) {
  const city = getCity(cityId);
  if (!city) return null;
  return (
    <Skyline id={cityId} color={city.stateColor}>
      {SKYLINES[cityId]}
    </Skyline>
  );
}

// ── 地点类别插画（行程块缩略图） ─────────────────────────────

const ART_BG: Record<string, string> = {
  landmark: '#0B3A5B',
  garden: '#4F7F78',
  museum: '#7C5A82',
  temple: '#7C5A82',
  street: '#C8862F',
  park: '#567D5F',
  market: '#C8862F',
  bookstore: '#0B3A5B',
  food: '#B65C3F',
  tea: '#4F7F78',
  cafe: '#6B4A35',
  dessert: '#D89A9A',
  bar: '#7C5A82',
};

/** 64×64 类别插画：底色卡 + 白色简笔图形，一眼可辨 */
function Glyph({ kind }: { kind: string }) {
  const w = '#FFFFFF';
  switch (kind) {
    case 'bookstore':
      return (
        <g>
          <path d="M20 18 h10 v28 h-10z M34 18 h10 v28 h-10z" fill={w} opacity="0.9" />
          <path d="M32 16 q-8 4 -12 2 v30 q8 0 12 -4z" fill={w} />
          <path d="M32 16 q8 4 12 2 v30 q-8 0 -12 -4z" fill={w} opacity="0.75" />
        </g>
      );
    case 'museum':
      return (
        <g fill={w}>
          <path d="M18 28 L32 16 L46 28 z" />
          <rect x="20" y="30" width="4" height="16" />
          <rect x="30" y="30" width="4" height="16" />
          <rect x="40" y="30" width="4" height="16" />
          <rect x="17" y="47" width="30" height="4" />
        </g>
      );
    case 'temple':
      return (
        <g fill={w}>
          <path d="M12 26 Q32 14 52 26 L48 30 H16z" />
          <rect x="24" y="30" width="16" height="6" opacity="0.85" />
          <path d="M16 42 Q32 34 48 42 L44 46 H20z" opacity="0.85" />
          <rect x="28" y="46" width="8" height="6" opacity="0.85" />
        </g>
      );
    case 'garden':
    case 'park':
      return (
        <g fill={w}>
          <circle cx="32" cy="26" r="11" opacity="0.9" />
          <circle cx="21" cy="34" r="7" opacity="0.7" />
          <circle cx="43" cy="34" r="7" opacity="0.7" />
          <rect x="29" y="36" width="6" height="16" rx="2" opacity="0.9" />
        </g>
      );
    case 'landmark':
      return (
        <g fill={w}>
          <path d="M29 44 V26 h6 v18z" />
          <path d="M32 12 l5 14 h-10z" />
          <rect x="24" y="44" width="16" height="4" />
          <rect x="21" y="48" width="22" height="4" opacity="0.8" />
        </g>
      );
    case 'street':
      return (
        <g fill={w}>
          <path d="M16 24 h32 v6 H16z" opacity="0.9" />
          <rect x="18" y="30" width="12" height="18" />
          <rect x="34" y="30" width="12" height="18" opacity="0.7" />
          <rect x="20" y="34" width="8" height="8" opacity="0.35" />
        </g>
      );
    case 'market':
      return (
        <g fill={w}>
          <path d="M14 24 L18 16 h28 l4 8z" />
          <path d="M18 30 q14 8 28 0 v16 H18z" opacity="0.8" />
          <circle cx="26" cy="38" r="3" opacity="0.5" />
          <circle cx="38" cy="40" r="3" opacity="0.5" />
        </g>
      );
    case 'food':
      return (
        <g fill={w}>
          <path d="M14 32 h36 a18 12 0 0 1 -36 0z" />
          <path d="M22 26 L44 12" stroke={w} strokeWidth="3" strokeLinecap="round" />
          <path d="M26 28 L48 16" stroke={w} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
          <rect x="12" y="50" width="40" height="3" opacity="0.7" />
        </g>
      );
    case 'tea':
      return (
        <g fill={w}>
          <path d="M16 28 h26 v10 a13 11 0 0 1 -26 0z" />
          <path d="M42 30 q10 2 8 10 q-2 6 -10 6 v-6 q6 0 6 -4 q0 -4 -6 -4z" opacity="0.85" />
          <path d="M22 20 q3 -4 0 -8 M30 20 q3 -4 0 -8" stroke={w} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
          <rect x="14" y="50" width="32" height="3" opacity="0.7" />
        </g>
      );
    case 'cafe':
      return (
        <g fill={w}>
          <path d="M18 30 h22 v9 a11 10 0 0 1 -22 0z" />
          <path d="M40 31 h6 a6 6 0 0 1 0 12 h-6 v-5 h5 a2 2 0 0 0 0 -4 h-5z" opacity="0.85" />
          <path d="M24 24 q3 -4 0 -8 M32 24 q3 -4 0 -8" stroke={w} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
          <rect x="16" y="50" width="32" height="3" opacity="0.7" />
        </g>
      );
    case 'dessert':
      return (
        <g fill={w}>
          <path d="M18 48 V34 l14 -12 14 12 v14z" opacity="0.9" />
          <rect x="16" y="44" width="32" height="5" opacity="0.8" />
          <circle cx="32" cy="28" r="4" opacity="0.85" />
        </g>
      );
    case 'bar':
      return (
        <g fill={w}>
          <path d="M18 18 h28 L32 34z" />
          <rect x="30" y="34" width="4" height="14" />
          <rect x="22" y="48" width="20" height="4" />
          <circle cx="40" cy="24" r="3" opacity="0.6" />
        </g>
      );
    default:
      return (
        <g fill={w}>
          <path d="M20 44 Q32 12 44 44 z" />
          <rect x="18" y="44" width="28" height="4" opacity="0.8" />
        </g>
      );
  }
}

/** 行程块左侧的类别插画（景点 / 餐饮 / 咖啡 / 茶 / 甜品 / 微醺…） */
export function PlaceArt({ kind, cityId, size = 60 }: { kind: string; cityId?: CityId; size?: number }) {
  const color = ART_BG[kind] ?? '#0B3A5B';
  // 色相微调：同一类别在不同城市有轻微深浅差，整页不呆板
  const city = cityId ? getCity(cityId) : undefined;
  const hue = city ? city.stateColor : color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="place-art"
      role="img"
      aria-label="地点插画"
      style={{ borderRadius: 14, flexShrink: 0 }}
    >
      <rect x="0" y="0" width="64" height="64" rx="14" fill={hue} opacity="0.9" />
      <rect x="0" y="40" width="64" height="24" rx="0" fill="#F7F8FA" opacity="0.18" />
      <Glyph kind={kind} />
    </svg>
  );
}
