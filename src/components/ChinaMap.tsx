// Link-R World — 自研中国经纬线旅行地图（替代「在线底图没 Key / 加载失败 → 地图区空白」）
//
// 为什么自研：在线底图要 Key、要外网、要 WebGL，任何一环失败地图区就只剩空白占位；
// 而行程图（尤其导出 PNG）恰恰最怕局部空白。这里用随包发布的标准边界数据
// （src/data/chinaGeo.ts）+ SVG 画一张离线可渲染、导出不丢的中国地图。
//
// 一张图 = 主图 + 一个附图，两张面板共用同一份地理空间的 path，只是 viewBox 不同：
//   · 行程散布在全国（跨城）→ 主图 = 全国，附图 = 南海诸岛（国家地图惯例）；
//   · 行程集中在一座城（本产品常态）→ 主图 = 该城的局部放大（含省界与经纬线），
//     附图 = 全国缩略位置图并在上面框出主图范围 —— 中国轮廓始终在画面里，不会变成
//     一张看不出在哪儿的城市图。
//
// 硬规矩：
//   · 地点一律按经纬度定位；没有可靠坐标或超出取景范围的不硬放，改在脚注点名提示；
//   · 连线只画成虚线，明确标注为「相对位置与顺序示意」，绝不伪装成真实道路路线；
//   · 底图数据缺失时显示明确的降级说明，不留空白占位。
//
// 版式约束：容器按主图 viewBox 的比例自适应（inline aspect-ratio）；
// 节点用百分比定位的 HTML 覆盖层渲染，字号与点击区不随 SVG 缩放，手机上依然可读可点。

import { useMemo } from 'react';
import {
  CHINA_BOX,
  CHINA_GEO_READY,
  CN_GEO_SOURCE,
  KX,
  LAND_PATHS,
  NINE_DASH_PATHS,
  PROJECTION_NOTE,
  PROVINCE_PATHS,
  SOUTH_SEA_BOX,
  bboxOfPoints,
  boxToView,
  graticuleFor,
  latLngToPercent,
  type GeoBox,
  type ViewBox,
} from '../lib/chinaMap';

/** 地图上的一个地点（与行程共用同一份地点数据） */
export interface MapPlace {
  id: string;
  name: string;
  /** 缺坐标的地点不硬放，只在脚注提示 */
  lat?: number | null;
  lng?: number | null;
  /** 一句话信息（点击后展示） */
  note?: string;
}

export type MapPinState = 'start' | 'current' | 'planned' | 'visited' | 'end' | 'explore';

export const MAP_STATE_LABEL: Record<MapPinState, string> = {
  start: '起点',
  current: '当前',
  planned: '计划中',
  visited: '已到过',
  end: '终点',
  explore: '待探索',
};

/** 判断「行程是否集中在一处」的阈值（经纬度跨度） */
const LOCAL_SPAN_MAX = 12;
/** 局部图的取景最小跨度（约 15km）：再小点位就挤成一团，再大就浪费画幅 */
const LOCAL_MIN_SPAN = 0.14;

interface ChinaMapProps {
  places: MapPlace[];
  /** 每个地点的状态；未给出的按 起点 / 终点 / 计划中 推断 */
  states?: Record<string, MapPinState>;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  /** 顺序连线（虚线，相对位置示意） */
  links?: boolean;
  /** 只给前 N 个节点连线（首页探索用：走过的路才画出来） */
  linkCount?: number;
  /** 显示状态图例 */
  legend?: boolean;
  /** 左上角小标题 */
  caption?: string;
  /** 主图若是局部放大，左上角补一句「某某」 */
  focusLabel?: string;
  /** 强制全国视图（首页探索用） */
  forceWholeCountry?: boolean;
  /** 跳跃的小旅行家停在哪个地点（首页探索用） */
  hopperId?: string | null;
  /** 小旅行家每次移动时重播弹跳动画用（换值即重播） */
  hopToken?: number;
  variant?: 'workbench' | 'poster' | 'stage';
  className?: string;
}

interface Pin {
  place: MapPlace;
  lat: number;
  lng: number;
  state: MapPinState;
  index: number;
  left: number;
  top: number;
}

export function ChinaMap({
  places,
  states,
  activeId,
  onSelect,
  links = true,
  linkCount,
  legend = true,
  caption,
  focusLabel,
  forceWholeCountry = false,
  hopperId,
  hopToken = 0,
  variant = 'workbench',
  className,
}: ChinaMapProps) {
  const geo = useMemo(() => {
    const located = places.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    ) as Array<MapPlace & { lat: number; lng: number }>;
    const raw = bboxOfPoints(located);
    const spans = raw
      ? { lng: raw.lngMax - raw.lngMin, lat: raw.latMax - raw.latMin }
      : null;
    const focused =
      !forceWholeCountry &&
      !!raw &&
      !!spans &&
      spans.lng <= LOCAL_SPAN_MAX &&
      spans.lat <= LOCAL_SPAN_MAX;
    const localBox = focused ? bboxOfPoints(located, LOCAL_MIN_SPAN) : null;
    const mainBox: GeoBox = localBox ?? CHINA_BOX;
    return {
      located,
      localBox,
      mainBox,
      mainVB: boxToView(mainBox),
      insetBox: localBox ? CHINA_BOX : SOUTH_SEA_BOX,
      insetKind: (localBox ? 'china' : 'south-sea') as 'china' | 'south-sea',
    };
  }, [places, forceWholeCountry]);

  const { mainVB } = geo;

  const pins = useMemo<Pin[]>(() => {
    const locById = new Map(geo.located.map((p) => [p.id, p]));
    return places
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => locById.has(p.id))
      .map(({ p, i }) => {
        const q = locById.get(p.id) as MapPlace & { lat: number; lng: number };
        const { left, top } = latLngToPercent(q.lat, q.lng, mainVB);
        const state: MapPinState =
          states?.[p.id] ??
          (i === 0 ? 'start' : i === places.length - 1 ? 'end' : 'planned');
        return { place: p, lat: q.lat, lng: q.lng, state, index: i + 1, left, top };
      });
  }, [places, states, geo.located, mainVB]);

  const missing = useMemo(
    () =>
      places.filter((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng)).map((p) => p.name),
    [places]
  );

  const active = activeId ? pins.find((p) => p.place.id === activeId) : undefined;
  const hopper = hopperId ? pins.find((p) => p.place.id === hopperId) : undefined;
  const gc = useMemo(() => graticuleFor(geo.mainBox), [geo.mainBox]);
  const colored = useMemo(() => Array.from(new Set(pins.map((p) => p.state))), [pins]);
  const insetVB = useMemo<ViewBox>(() => boxToView(geo.insetBox), [geo.insetBox]);
  const dash = mainVB.w * 0.012;

  if (!CHINA_GEO_READY) {
    return (
      <div className={`cmap is-degraded ${className ?? ''}`} data-testid="china-map">
        <p className="cmap-degraded" data-testid="cmap-degraded">
          底图数据未就绪：已切换为降级视图（不显示地图，行程卡片与逐日时间不受影响）。
        </p>
      </div>
    );
  }

  /** 主图范围框（在附图里高亮出来，让人看懂「这一块在中国哪里」） */
  const focusRect = {
    x: geo.mainBox.lngMin * KX,
    y: 90 - geo.mainBox.latMax,
    w: (geo.mainBox.lngMax - geo.mainBox.lngMin) * KX,
    h: geo.mainBox.latMax - geo.mainBox.latMin,
  };

  return (
    <div
      className={`cmap is-${variant}${geo.localBox ? ' is-local' : ' is-national'} ${className ?? ''}`}
      data-testid="china-map"
      data-map-view={geo.localBox ? 'local' : 'national'}
    >
      {caption ? (
        <p className="cmap-caption">
          {caption}
          {focusLabel ? <span className="cmap-caption-focus"> · {focusLabel}</span> : null}
        </p>
      ) : null}

      <div className="cmap-frame" style={{ aspectRatio: `${mainVB.w} / ${mainVB.h}` }}>
        <svg
          className="cmap-svg"
          viewBox={`${mainVB.x} ${mainVB.y} ${mainVB.w} ${mainVB.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`中国地图${geo.localBox ? '局部放大' : ''}：行程地点相对位置示意`}
        >
          <defs>
            <linearGradient id="cmap-sea" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f2f5f8" />
              <stop offset="100%" stopColor="#e8eef3" />
            </linearGradient>
            <linearGradient id="cmap-land" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e4eaef" />
              <stop offset="100%" stopColor="#dae2e9" />
            </linearGradient>
            <linearGradient id="cmap-link" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c8862f" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0b3a5b" stopOpacity="0.5" />
            </linearGradient>
            <pattern id="cmap-grain" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="4" r="0.28" fill="rgba(13,27,38,0.06)" />
              <circle cx="17" cy="14" r="0.24" fill="rgba(13,27,38,0.05)" />
              <circle cx="9" cy="22" r="0.2" fill="rgba(13,27,38,0.04)" />
            </pattern>
          </defs>

          <rect x={mainVB.x} y={mainVB.y} width={mainVB.w} height={mainVB.h} fill="url(#cmap-sea)" />
          <rect x={mainVB.x} y={mainVB.y} width={mainVB.w} height={mainVB.h} fill="url(#cmap-grain)" />

          {/* 经纬网 */}
          <g className="cmap-graticule" stroke="rgba(13,27,38,0.085)" strokeWidth="1">
            {gc.map((l) => (
              <line
                key={l.key}
                x1={l.a[0]}
                y1={l.a[1]}
                x2={l.b[0]}
                y2={l.b[1]}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {/* 陆地轮廓 + 省级界线 */}
          <g className="cmap-land">
            {LAND_PATHS.map((d, i) => (
              <path
                key={`land${i}`}
                d={d}
                fill="url(#cmap-land)"
                stroke="#93a6b4"
                strokeWidth="1.1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          <g className="cmap-province" fill="none" stroke="rgba(13,27,38,0.14)">
            {PROVINCE_PATHS.map((d, i) => (
              <path key={`prov${i}`} d={d} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
            ))}
          </g>

          {/* 连线：只表示相对位置与先后顺序 */}
          {links && pins.length > 1 ? (
            <g className="cmap-links" data-testid="cmap-links">
              {pins.slice(0, Math.max(0, Math.min(linkCount ?? pins.length, pins.length) - 1)).map((p, i) => {
                const q = pins[i + 1];
                const x1 = mainVB.x + (p.left / 100) * mainVB.w;
                const y1 = mainVB.y + (p.top / 100) * mainVB.h;
                const x2 = mainVB.x + (q.left / 100) * mainVB.w;
                const y2 = mainVB.y + (q.top / 100) * mainVB.h;
                const cx = (x1 + x2) / 2;
                const cy = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.1;
                return (
                  <path
                    key={`link${i}`}
                    d={`M${x1.toFixed(3)} ${y1.toFixed(3)}Q${cx.toFixed(3)} ${cy.toFixed(3)} ${x2.toFixed(3)} ${y2.toFixed(3)}`}
                    fill="none"
                    stroke="url(#cmap-link)"
                    strokeWidth="1.6"
                    strokeDasharray={`${dash.toFixed(3)} ${(dash * 1.05).toFixed(3)}`}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          ) : null}

          {/* 经纬网标注：只在主图里画（附图太小，标注会糊成一团） */}
          <g className="cmap-gc-label">
            {gc.map((l) => (
              <text
                key={`t${l.key}`}
                x={l.lx}
                y={l.ly}
                textAnchor={l.anchor}
                fontSize={mainVB.w * 0.017}
              >
                {l.label}
              </text>
            ))}
          </g>
        </svg>

        {/* 附图：全国缩略位置图（并框出主图范围）或南海诸岛 */}
        <div
          className="cmap-inset"
          data-testid="cmap-inset"
          data-inset-kind={geo.insetKind}
          style={{
            aspectRatio: `${insetVB.w} / ${insetVB.h}`,
            width: geo.insetKind === 'china' ? '30%' : '20%',
          }}
        >
          <svg
            viewBox={`${insetVB.x} ${insetVB.y} ${insetVB.w} ${insetVB.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="cmap-inset-svg"
            aria-hidden="true"
          >
            <rect x={insetVB.x} y={insetVB.y} width={insetVB.w} height={insetVB.h} fill="#fbfcfd" />
            {LAND_PATHS.map((d, i) => (
              <path
                key={`il${i}`}
                d={d}
                fill="#dde5eb"
                stroke="#9bafbd"
                strokeWidth="0.8"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {geo.insetKind === 'south-sea' ? (
              <g fill="none" stroke="#0b3a5b" strokeWidth="1.5">
                {NINE_DASH_PATHS.map((d, i) => (
                  <path key={`nd${i}`} d={d} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            ) : (
              <rect
                className="cmap-focus-rect"
                x={focusRect.x}
                y={focusRect.y}
                width={focusRect.w}
                height={focusRect.h}
                fill="rgba(200,134,47,0.16)"
                stroke="#c8862f"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <span className="cmap-inset-label">
            {geo.insetKind === 'china' ? '全国位置' : '南海诸岛'}
          </span>
        </div>

        {/* 节点：百分比定位的 HTML 层，字号与点击区不随地图缩放 */}
        <div className="cmap-pins">
          {pins.map((p) => {
            const cls = `cmap-pin is-${p.state}${p.place.id === activeId ? ' is-active' : ''}`;
            const labelBelow = p.top < 10;
            return (
              <button
                key={p.place.id}
                type="button"
                className={cls}
                style={{ left: `${p.left}%`, top: `${p.top}%` }}
                data-testid="cmap-pin"
                data-place-id={p.place.id}
                data-state={p.state}
                title={p.place.name}
                aria-label={`${MAP_STATE_LABEL[p.state]} · ${p.place.name}`}
                onClick={onSelect ? () => onSelect(p.place.id) : undefined}
              >
                <span className="cmap-dot">
                  <i>{p.index}</i>
                </span>
                <span className={`cmap-label${labelBelow || p.index % 2 === 0 ? ' is-below' : ''}`}>
                  {p.place.name}
                </span>
              </button>
            );
          })}
          {hopper ? (
            <span
              className="cmap-hopper"
              data-testid="cmap-hopper"
              style={{ left: `${hopper.left}%`, top: `${hopper.top}%` }}
            >
              <i key={hopToken} className="is-hopping" />
            </span>
          ) : null}
        </div>

        {active ? (
          <div className="cmap-info" data-testid="cmap-info">
            <b>{active.place.name}</b>
            <span className="cmap-info-state">{MAP_STATE_LABEL[active.state]}</span>
            {active.place.note ? <p>{active.place.note}</p> : null}
            <p className="cmap-info-coord">
              {active.lat.toFixed(2)}°N · {active.lng.toFixed(2)}°E
            </p>
          </div>
        ) : null}
      </div>

      {legend ? (
        <div className="cmap-legend" data-testid="cmap-legend">
          {colored.map((s) => (
            <span key={s} className={`cmap-lg is-${s}`}>
              <i />
              {MAP_STATE_LABEL[s]}
            </span>
          ))}
        </div>
      ) : null}

      <p className="cmap-note" data-testid="cmap-note">
        {variant === 'poster' ? (
          <>
            示意底图 · {PROJECTION_NOTE} · 虚线仅为地点相对位置与先后顺序示意，<b>不是导航路线</b> ·{' '}
            {CN_GEO_SOURCE.note}
          </>
        ) : (
          <>
            底图：{CN_GEO_SOURCE.source}（{CN_GEO_SOURCE.fetchedAt} 取数）· {PROJECTION_NOTE} ·
            {geo.localBox ? '主图为行程所在地的局部放大，附图为全国位置' : '主图为全国，附图为南海诸岛'} ·
            虚线仅为地点相对位置与先后顺序示意，<b>不是导航路线</b> · {CN_GEO_SOURCE.note}
          </>
        )}
      </p>
      {missing.length > 0 ? (
        <p className="cmap-missing" data-testid="cmap-missing">
          以下地点暂无可靠坐标，未在地图上标注：{missing.join('、')}
        </p>
      ) : null}
    </div>
  );
}
