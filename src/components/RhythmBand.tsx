// 全宽带 · 节奏 / 五 R / 记忆入口
// 这三块原先堆在左侧 300px 概况栏里，把左栏撑到 2471px（中栏只有 1300px），
// 三栏高度差造成大片空白（2026-10-10 实测）。搬到三栏下方的全宽带横向铺开：
// 左栏回到「概览 + 预算 + 大交通」，高度与中栏接近，空白自然消失。
import type { MemoryEntry, Trip } from '../lib/types';
import {
  formatKm,
  dayItems,
  dayRoamKm,
  dayTransitMinutes,
  paceOf,
  type FiveRProgress,
} from '../lib/tripMath';

export function RhythmBand({
  trip,
  fiveR,
  selectedDay,
  onSelectDay,
  memories,
  onOpenMemory,
}: {
  trip: Trip;
  fiveR: FiveRProgress[];
  selectedDay: number;
  onSelectDay: (d: number) => void;
  memories: MemoryEntry[];
  onOpenMemory: () => void;
}) {
  return (
    <section className="wb-band" data-testid="rhythm-band" aria-label="旅程节奏与五感进度">
      <div className="col-head band-head">
        <p className="eyebrow">◎ 旅程节奏 · 五感进度</p>
        <span className="idx">RHYTHM &amp; FIVE R</span>
      </div>

      <div className="band-grid">
        <div className="band-cell">
          <p className="block-title">日节奏 · Pace</p>
          <ul className="perday-list is-wide">
            {trip.days.map((d) => {
              const km = dayRoamKm(trip.items, d.index);
              const pace = paceOf(km);
              const mins = dayTransitMinutes(trip.items, d.index);
              const count = dayItems(trip.items, d.index).length;
              return (
                <li key={d.index} className={d.index === selectedDay ? 'is-current' : ''}>
                  <button
                    type="button"
                    className="dlabel num"
                    onClick={() => onSelectDay(d.index)}
                    aria-label={`跳到第 ${d.index + 1} 天`}
                  >
                    D{d.index + 1}
                  </button>
                  <span className="pace-count">
                    {count} 块 · 通勤 {mins} 分
                  </span>
                  <span className="pace-km">
                    {formatKm(km)}
                    <span className={`pace-dot ${pace}`} aria-hidden="true" />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="tiny-note">舒适上限 7.0 km／天。超过即标为「偏满」，提示第二天别再排。</p>
        </div>

        <div className="band-cell">
          <p className="block-title">五 R 进度 · Five R</p>
          <ul className="five-r is-wide">
            {fiveR.map((r) => (
              <li key={r.key}>
                <div className="r-top">
                  <span className="r-letter" style={{ color: r.color }}>
                    {r.labelEn[0]}
                  </span>
                  <span className="r-label">
                    {r.label} <span className="r-en">{r.labelEn}</span>
                  </span>
                  <span className="r-value">{r.display}</span>
                </div>
                <div
                  className="r-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(r.ratio * 100)}
                  aria-label={`${r.label} ${r.labelEn}：${r.display}`}
                >
                  <i style={{ width: `${r.ratio * 100}%`, background: r.color }} />
                </div>
                <p className="r-hint">{r.hint}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="band-cell band-memory">
          <p className="block-title">世界记忆 · Remember</p>
          <div className="memory-callout">
            <p className="mc-count">
              已沉淀 {memories.length} 张{memories.length > 0 ? ` · 最近 ${memories[0].dateLabel}` : ''}
            </p>
            <p>行程走完之后，把其中一次真实的相遇写成一张 World Memory。它是闭环的预览，不是社交发布。</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenMemory}>
              记住这一刻
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
