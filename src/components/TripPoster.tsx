// Link-R World — 一键生成行程规划图
//
// 参照旅行博主海报的版式：
//   左列 = 逐日行程（日期 / 交通 / 当日重点），
//   右侧 = 自研中国经纬线地图（编号点钉 + 顺序连线 + 全国位置附图），
//   底部 = 一条城市与景点的真实照片带。
// 生成的是 DOM 海报（缩放适配屏幕）；
// 「保存 PNG」用 html2canvas 导出。
//
// 地图为什么不再用在线静态图：静态图不返回 CORS 头，导出时必然污染画布，
// 只能先换成示意图再导 —— 结果就是「下载的行程图里地图区域是另一张图甚至空白」。
// 换成同源自绘 SVG 后，屏幕上与导出的 PNG 是同一张地图，渲染一致、不空白。

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CityInfo } from '../data/cities';
import type { Trip } from '../lib/types';
import { ChinaMap } from './ChinaMap';
import { heroPhotoOf, photoOf } from './Photo';
import { dayItems, formatCNY, placesInTrip, sumCost } from '../lib/tripMath';
/** 行程内地点的最小视图（lib/types.Place），避免与 data/places.Place 耦合 */
type TPlace = { id: string; name: string; kind: string; lat: number; lng: number; }

interface TripPosterProps {
  trip: Trip;
  city: CityInfo;
  onClose: () => void;
}

interface DayRow {
  label: string;
  dateLabel: string;
  weekday: string;
  moves: string[];
  stops: { name: string; place: TPlace }[];
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dateLabel(iso: string): { date: string; weekday: string } {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { date: iso, weekday: '' };
  return {
    date: `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`,
    weekday: WEEK[d.getDay()] ?? '',
  };
}

export function TripPoster({ trip, city, onClose }: TripPosterProps) {
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rows: DayRow[] = useMemo(() => {
    return trip.days.map((d, i) => {
      // dayIndex 从 0 起：这里必须查 i（此前写成 i+1，海报 Day1 显示了第二天的块、Day2 恒为空）
      const items = dayItems(trip.items, i);
      const moves = items.map((it) => it.transit.mode).filter((m, idx, arr) => idx === 0 || m !== arr[idx - 1]);
      const stops = items
        .map((it) => {
          const place = placesInTrip(trip).find((p) => p.id === it.placeId);
          return place ? { name: place.name, place } : null;
        })
        .filter(Boolean) as { name: string; place: TPlace }[];
      const dl = dateLabel(d.date);
      return {
        label: `Day ${i + 1}`,
        dateLabel: dl.date,
        weekday: dl.weekday,
        moves: moves.slice(0, 2),
        stops,
      };
    });
  }, [trip]);

  const allPlaces = useMemo(() => {
    const seen = new Set<string>();
    const out: TPlace[] = [];
    rows.forEach((r) =>
      r.stops.forEach((s) => {
        if (!seen.has(s.place.id)) {
          seen.add(s.place.id);
          out.push(s.place);
        }
      })
    );
    return out;
  }, [rows]);

  const total = sumCost(trip.items);
  const startDate = dateLabel(trip.startDate);
  const endDate = dateLabel(trip.endDate ?? trip.startDate);
  const hero = heroPhotoOf(city.id);

  // 打开时锁滚动 + ESC 关闭
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const savePng = async () => {
    if (!posterRef.current || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const node = posterRef.current;
      if (!node) throw new Error('no node');
      const mod = await import('html2canvas');
      const html2canvas = mod.default ?? mod;
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#F7F8FA',
        logging: false,
      });
      // file:// 下本机照片也会污染画布，异常在取数据时才抛出
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `LinkR-${city.name}-行程图.png`;
      a.click();
      setNote('已导出 PNG（地图为自研矢量底图，导出版与屏幕显示一致）');
    } catch {
      setNote('导出未成功：直接截屏这张行程图即可分享');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
    <div className="poster-mask" onClick={onClose} role="dialog" aria-label="行程规划图">
      <div className="poster-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="poster-btn" onClick={savePng} disabled={saving}>
          {saving ? '生成中…' : '保存 PNG'}
        </button>
        <button type="button" className="poster-btn ghost" onClick={onClose}>
          关闭
        </button>
        {note ? <span className="poster-note">{note}</span> : null}
      </div>
      <div className="poster-scroll" onClick={(e) => e.stopPropagation()}>
        <div className="poster" ref={posterRef}>
          {/* 顶部：标题 + 日期 */}
          <div className="po-head">
            <div>
              <p className="po-eyebrow">LINK-R WORLD · 自由行行程图</p>
              <h2 className="po-title">
                {city.name}
                <span> · {trip.title}</span>
              </h2>
              <p className="po-sub">
                {startDate.date} – {endDate.date} · {trip.days.length} 天 ·{' '}
                {trip.items.length} 个行程块 · 预算约 {formatCNY(total)}
              </p>
            </div>
            {hero ? (
              <img className="po-hero" src={hero} alt={city.name} />
            ) : null}
          </div>

          <div className="po-body">
            {/* 左列：逐日 */}
            <div className="po-days">
              {rows.map((r, i) => (
                <div className="po-day" key={r.label}>
                  <div className="po-day-chip">{r.label}</div>
                  <div className="po-day-main">
                    <p className="po-day-date">
                      {r.dateLabel} {r.weekday}
                      {r.moves.length ? <span className="po-day-moves"> · {r.moves.join('→')}</span> : null}
                    </p>
                    <ul>
                      {r.stops.map((s, j) => (
                        <li key={`${r.label}-${j}`}>
                          <i
                            className="po-dot"
                            style={{ background: i % 2 === 0 ? '#0B3A5B' : '#C8862F' }}
                          />
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            {/* 右侧：地图 + 照片带 */}
            <div className="po-mapcol">
              <div className="po-map">
                <ChinaMap
                  places={allPlaces.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng }))}
                  variant="poster"
                  links
                  legend
                  caption={`${city.name} · ${allPlaces.length} 个地点`}
                />
              </div>
              <div className="po-strip">
                {rows
                  .flatMap((r) => r.stops.slice(0, 1).map((s) => ({ ...s, day: r.label })))
                  .concat(allPlaces.slice(0, 2).map((p) => ({ name: p.name, place: p, day: '' })))
                  .filter((x, i, arr) => arr.findIndex((y) => y.place.id === x.place.id) === i)
                  .slice(0, 6)
                  .map((s) => {
                    const photo = photoOf(s.place, city.id);
                    return (
                      <figure key={s.place.id}>
                        {photo ? (
                          <img src={photo} alt={s.name} />
                        ) : (
                          <span className="po-strip-fallback">{s.name.slice(0, 1)}</span>
                        )}
                        <figcaption>{s.name}</figcaption>
                        <em>{s.day}</em>
                      </figure>
                    );
                  })}
              </div>
            </div>
          </div>

          <p className="po-foot">
            {city.name} · {city.province} · {city.slogan.title} —— 行程以当日官方公示为准
          </p>
        </div>
      </div>
    </div>
    </>,
    document.body
  );
}
