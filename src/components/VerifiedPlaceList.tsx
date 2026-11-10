import type { Trip } from '../lib/types';
import { placeView, tripPlacesOfCity } from '../data/tripData';
import { CITY_ID_BY_NAME, dayItems, placesInTrip } from '../lib/tripMath';
import type { CityId } from '../data/cities';

interface PlaceListProps {
  trip: Trip;
  selectedDay: number;
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}

export function PlaceList({ trip, selectedDay, selectedItemId, onSelectItem }: PlaceListProps) {
  const dayList = dayItems(trip.items, selectedDay);
  const used = placesInTrip(trip);
  const cityId = (CITY_ID_BY_NAME[trip.destination] ?? 'shanghai') as CityId;
  const spare = tripPlacesOfCity(cityId).filter((p) => !trip.items.some((i) => i.placeId === p.id));

  return (
    <div>
      <p className="block-title" style={{ marginBottom: 10 }}>
        当日地点 · {dayList.length} 处
      </p>

      <ul className="place-list">
        {dayList.length === 0 ? (
          <li>
            <p className="place-empty">这一天还没有地点。</p>
          </li>
        ) : null}
        {dayList.map((item) => {
          const place = placeView(item.placeId);
          if (!place) return null;
          const isSel = item.id === selectedItemId;
          return (
            <li key={item.id} className={isSel ? 'is-selected' : ''}>
              <button
                type="button"
                className="place-row"
                onClick={() => onSelectItem(item.id)}
                aria-current={isSel ? 'true' : undefined}
              >
                <span className="pr-top">
                  <span className="pr-name">{place.name}</span>
                  <span className="pr-dist">
                    {place.district} · {item.time}
                  </span>
                </span>
                <span className="pr-facts">
                  <span className="pf">
                    门票 <b>{place.ticket === 0 ? '免费' : `¥${place.ticket}`}</b>
                  </span>
                  <span className="pf">开放 {place.hours}</span>
                </span>
                <span className="pr-tip">{place.tip}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mini-chips">
        <span className="mc">
          <b>{trip.days.length}</b>
          行程天数
        </span>
        <span className="mc">
          <b>{trip.items.length}</b>
          行程块数
        </span>
        <span className="mc">
          <b>{used.length}</b>
          涉及地点
        </span>
      </div>

      <div className="tip-note">
        <span className="ico" aria-hidden="true">
          ※
        </span>
        <span>
          开放时间与票价按官方公示口径整理，节假日与临时公告可能调整，
          <strong>出发前在景区官方小程序再确认一次</strong>。
        </span>
      </div>

      {spare.length > 0 ? (
        <>
          <p className="block-title" style={{ marginTop: 22, marginBottom: 10 }}>
            {trip.destination}还有 {spare.length} 处可选
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {spare.map((p) => (
              <span className="chip" key={p.id} title={`${p.nameEn} · ${p.district}`}>
                {p.name}
              </span>
            ))}
          </div>
          <p className="tiny-note">
            用日程下方的"加一个体验块"可以把其中任意一处排进某一天。
          </p>
        </>
      ) : null}
    </div>
  );
}
