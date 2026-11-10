import type { ItineraryItem as Item, Trip, TripLeg } from '../lib/types';
import { placeView } from '../data/tripData';
import {
  PACE_LABEL,
  dayItems,
  dayRoamKm,
  dayTransitMinutes,
  formatCNY,
  formatKm,
  formatMinutes,
  paceOf,
  sumCost,
} from '../lib/tripMath';
import { formatClock, humanDuration } from '../lib/journey';
import { DaySelector } from './DaySelector';
import { ItineraryItemRow } from './ItineraryItem';

const LEG_LABEL: Record<TripLeg['kind'], string> = {
  outbound: '去程',
  return: '返程',
  intercity: '城际',
  access: '接驳',
};

/** 行程块展示时段 → 起始分钟（与 tripData.spanOf 同口径，用于把交通段按时间插进时间线） */
function startMinOf(time: string): number {
  const m = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
}

interface ItineraryBoardProps {
  trip: Trip;
  /** 当前城市（地点照片兜底用） */
  cityId?: string;
  /** 闭环引擎给出的当日交通段（去程 / 城际 / 返程），为 undefined 时不插入 */
  legs?: TripLeg[];
  /** 当日由闭环引擎算出的可玩时间（分钟），用于在日头如实标注 */
  playMinutes?: number;
  selectedDay: number;
  selectedItemId: string | null;
  onSelectDay: (d: number) => void;
  onSelectItem: (id: string) => void;
  onEditItem: (item: Item) => void;
  onDeleteItem: (id: string) => void;
  onAddItem: (dayIndex: number) => void;
}

export function ItineraryBoard({
  trip,
  cityId,
  legs,
  playMinutes,
  selectedDay,
  selectedItemId,
  onSelectDay,
  onSelectItem,
  onEditItem,
  onDeleteItem,
  onAddItem,
}: ItineraryBoardProps) {
  const day = trip.days[selectedDay];
  const list = dayItems(trip.items, selectedDay);
  const km = dayRoamKm(trip.items, selectedDay);
  const pace = paceOf(km);
  const mins = dayTransitMinutes(trip.items, selectedDay);
  const cost = sumCost(list);

  // 当天的交通段：按时间与行程块并入同一条时间线（时间线从出发连续到返程结束）
  const dayLegs = (legs ?? []).filter((l) => l.dayIndex === selectedDay);
  const rows: Array<{ kind: 'leg'; leg: TripLeg } | { kind: 'item'; item: Item }> = [
    ...dayLegs.map((leg) => ({ kind: 'leg' as const, leg })),
    ...list.map((item) => ({ kind: 'item' as const, item })),
  ].sort((a, b) => {
    const sa = a.kind === 'leg' ? a.leg.startMin : startMinOf(a.item.time);
    const sb = b.kind === 'leg' ? b.leg.startMin : startMinOf(b.item.time);
    return sa - sb;
  });

  // 「交通没结束就开玩」这类硬冲突，直接在这一天顶上点名
  const hasDeadWindow = playMinutes !== undefined && playMinutes <= 0 && dayLegs.length > 0;

  // 日期感知提示：当天的星期与"周一闭馆"地点冲突时明说，不静默
  const weekdayLabel = day?.dateISO
    ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
        new Date(`${day.dateISO}T12:00:00`).getDay()
      ]
    : '';
  const closedToday = list
    .map((i) => ({ item: i, place: placeView(i.placeId) }))
    .filter((r) => r.place && weekdayLabel === '周一' && r.place.hours.includes('周一闭馆'));

  return (
    <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${selectedDay}`}>
      <DaySelector
        days={trip.days}
        items={trip.items}
        selectedDay={selectedDay}
        onSelect={onSelectDay}
      />

      <div className="day-head">
        <h2>
          {day.theme}
          <span>{day.themeEn}</span>
        </h2>
        <div className="day-stats">
          <span>
            <b>{list.length}</b> 个行程块
          </span>
          <span>
            漫游 <b>{formatKm(km)}</b>
          </span>
          <span>
            通勤 <b>{formatMinutes(mins)}</b>
          </span>
          <span>
            当日 <b>{formatCNY(cost)}</b>
          </span>
          <span>
            节奏 <b>{PACE_LABEL[pace]}</b>
          </span>
          {playMinutes !== undefined ? (
            <span data-testid="day-play">
              可玩{' '}
              <b>{playMinutes > 0 ? humanDuration(playMinutes) : '无'}</b>
            </span>
          ) : null}
        </div>
      </div>

      {hasDeadWindow ? (
        <p
          style={{
            marginTop: 10,
            padding: '9px 13px',
            borderLeft: '2px solid var(--red)',
            background: 'rgba(168,71,60,.08)',
            fontSize: 12,
            lineHeight: 1.7,
            color: '#7E3229',
            borderRadius: '0 3px 3px 0',
          }}
          data-testid="day-dead-window"
        >
          这一天的时间已被交通占满：去程 / 返程的接驳与候车之后，已经没有可以安排活动的时间窗。
          把班次挪到更早或更晚，或给这一天多留一晚，才有可玩的时间。
        </p>
      ) : null}

      {pace === 'full' ? (
        <p
          style={{
            marginTop: 10,
            padding: '9px 13px',
            borderLeft: '2px solid var(--orange)',
            background: 'rgba(255,149,0,.09)',
            fontSize: 12,
            lineHeight: 1.7,
            color: '#B25E00',
            borderRadius: '0 3px 3px 0',
          }}
        >
          这一天的漫游里程超过舒适上限（{formatKm(7)}），建议删掉一个行程块，或把其中一段改成车行。
        </p>
      ) : null}

      {closedToday.length > 0 ? (
        <p
          style={{
            marginTop: 10,
            padding: '9px 13px',
            borderLeft: '2px solid var(--orange)',
            background: 'rgba(255,149,0,.09)',
            fontSize: 12,
            lineHeight: 1.7,
            color: '#B25E00',
            borderRadius: '0 3px 3px 0',
          }}
        >
          这天是周一：{closedToday.map((r) => r.place!.name).join('、')}
          {' '}当天闭馆，建议换成周边街区，或用"加一个体验块"替换。
        </p>
      ) : null}

      {list.length === 0 && dayLegs.length === 0 ? (
        <p
          style={{
            marginTop: 20,
            padding: '26px 20px',
            border: '1px dashed var(--rule-strong)',
            borderRadius: 3,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          这一天还没有行程块。用下面的按钮加一个。
        </p>
      ) : (
        <ul className="timeline">
          {rows.map((row) => {
            if (row.kind === 'leg') {
              const l = row.leg;
              return (
                <li className="tl-item is-leg" key={l.id} data-testid={`leg-${l.kind}`}>
                  <div className="tl-gutter">
                    <div className="tl-time">
                      {formatClock(l.hubStartMin)}
                      <br />
                      <span style={{ fontWeight: 400, color: 'var(--sub)' }}>
                        → {formatClock(l.hubEndMin)}
                      </span>
                    </div>
                    <div className="tl-slot">在途</div>
                    <span className="tl-node" aria-hidden="true" />
                  </div>
                  <div className="tl-body">
                    <div className="tl-card-leg">
                      <span className="leg-kind">{LEG_LABEL[l.kind]}</span>
                      <span className="leg-route">
                        {l.from} → {l.to} · {l.mode}
                      </span>
                      <span className="leg-est">估算 · 待确认</span>
                      <span className="leg-time">
                        离开住处 {formatClock(l.startMin)} · 枢纽 {l.hubTime} · 抵达落脚 {formatClock(l.endMin)}
                        {l.overnight ? ' · 跨日' : ''}
                      </span>
                      <span className="leg-basis">{l.basis}</span>
                    </div>
                  </div>
                </li>
              );
            }
            const item = row.item;
            const place = placeView(item.placeId);
            if (!place) {
              // 数据缺失时留痕，不静默丢弃
              return (
                <li className="tl-item" key={item.id}>
                  <div className="tl-gutter">
                    <div className="tl-time">{item.time}</div>
                    <span className="tl-node" aria-hidden="true" />
                  </div>
                  <div className="tl-body">
                    <p style={{ fontSize: 12, color: 'var(--sub)' }}>
                      行程块 {item.id} 引用的地点“{item.placeId}”不在地点库中，已保留占位。
                    </p>
                  </div>
                </li>
              );
            }
            return (
              <ItineraryItemRow
                key={item.id}
                item={item}
                place={place}
                cityId={cityId}
                isSelected={item.id === selectedItemId}
                onSelect={() => onSelectItem(item.id)}
                onEdit={() => onEditItem(item)}
                onDelete={() => onDeleteItem(item.id)}
              />
            );
          })}

          <li className="tl-item add-slot">
            <div className="tl-gutter" aria-hidden="true" />
            <div className="tl-body" style={{ paddingBottom: 0 }}>
              <button type="button" onClick={() => onAddItem(selectedDay)}>
                ＋ 在第 {selectedDay + 1} 天加一个体验块
              </button>
            </div>
          </li>
        </ul>
      )}

      {list.length === 0 ? (
        <div className="add-slot" style={{ marginTop: 14 }}>
          <button type="button" onClick={() => onAddItem(selectedDay)}>
            ＋ 在第 {selectedDay + 1} 天加一个体验块
          </button>
        </div>
      ) : null}

      <div className="tip-note">
        <span className="ico" aria-hidden="true">
          ※
        </span>
        <span>
          <strong>改就生效 · </strong>
          修改行程块会立即重算当日与全程预算、漫游里程与通勤时长，地图与地点列表同步更新。
          开放时间与票价以景区当日官方公示为准。
        </span>
      </div>
    </div>
  );
}
