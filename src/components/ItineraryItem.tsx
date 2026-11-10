import type { ItineraryItem as Item, Place } from '../lib/types';
import { COST_CATEGORY_LABEL, SLOT_LABEL, formatCNY, formatMinutes } from '../lib/tripMath';
import { PlacePhoto } from './Photo';

/** 吃 / 咖啡 / 茶 / 甜品 / 微醺的角标文案（让"吃饭的地儿"一眼可辨） */
const FOOD_BADGE: Record<string, string> = {
  food: '在地味',
  cafe: '咖啡',
  tea: '茶',
  dessert: '甜品',
  bar: '微醺',
};

interface ItineraryItemProps {
  item: Item;
  place: Place;
  /** 当前城市（照片兜底用） */
  cityId?: string;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ItineraryItemRow({
  item,
  place,
  cityId,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: ItineraryItemProps) {
  const flexible = place.status === 'check';
  const badge = FOOD_BADGE[place.kind];

  return (
    <li className={`tl-item${isSelected ? ' is-selected' : ''}`}>
      <div className="tl-gutter">
        <div className="tl-time">{item.time}</div>
        <div className="tl-slot">{SLOT_LABEL[item.slot]}</div>
        <span className="tl-node" aria-hidden="true" />
      </div>

      <div className="tl-body">
        <button
          type="button"
          className="tl-card"
          onClick={onSelect}
          aria-current={isSelected ? 'true' : undefined}
          aria-label={`${item.time} ${place.name}，${item.note}`}
        >
          <span className="tl-card-row">
            <PlacePhoto place={place} cityId={cityId} />
            <span className="tl-card-main">
              <span className="tl-place">
                <span className="pname">{place.name}</span>
                {badge ? <span className={`kind-badge k-${place.kind}`}>{badge}</span> : null}
                <span className="pen">{place.nameEn}</span>
                <span className="pen">· {place.district}</span>
              </span>

              <span className="tl-note" style={{ display: 'block' }}>
                {item.note}
              </span>

              <span className="tl-meta">
                <span className="m">
                  通勤 <b>{item.transit.mode}</b>
                  {item.transit.minutes > 0 ? (
                    <>
                      {' '}
                      <b>{formatMinutes(item.transit.minutes)}</b>
                    </>
                  ) : null}
                  {item.transit.needCheck ? <span className="warn">· 班次出发前确认</span> : null}
                </span>
                <span className="m">
                  费用 <b>{formatCNY(item.cost)}</b> · {COST_CATEGORY_LABEL[item.costCategory]}
                </span>
                <span className="m">
                  开放 <b>{place.hours}</b>
                </span>
                {item.roamKm ? (
                  <span className="m">
                    漫游 <b>{item.roamKm.toFixed(1)} km</b>
                  </span>
                ) : null}
                {flexible ? <span className="warn">· 时段易变，出发前再确认</span> : null}
              </span>

              {item.relate ? (
                <span className="tl-relate" style={{ display: 'block' }}>
                  <span className="who">
                    <i
                      className="dot"
                      style={{ background: '#C8862F', width: 5, height: 5, borderRadius: '50%' }}
                    />
                    相遇 · {item.relate.with}
                  </span>
                  <span className="line" style={{ display: 'block' }}>
                    “{item.relate.line}”
                  </span>
                </span>
              ) : null}
            </span>
          </span>
        </button>

        <div className="tl-actions">
          <button type="button" className="btn-link" onClick={onEdit}>
            编辑此块
          </button>
          <button type="button" className="btn-link btn-danger" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
    </li>
  );
}
