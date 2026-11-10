import { useState } from 'react';
import type { MemoryEntry, Trip } from '../lib/types';
import { placeView } from '../data/tripData';
import { placesInTrip } from '../lib/tripMath';
import { Modal } from './Modal';

interface MemoryComposerProps {
  trip: Trip;
  defaultDayIndex: number;
  defaultItemId: string | null;
  onCancel: () => void;
  onSave: (m: MemoryEntry) => void;
}

const TAG_PRESETS = ['相遇', '街角', '味道', '声音', '一场雨', '刚好赶上'];

export function MemoryComposer({
  trip,
  defaultDayIndex,
  defaultItemId,
  onCancel,
  onSave,
}: MemoryComposerProps) {
  const tripPlaces = placesInTrip(trip);
  const sourceItem = trip.items.find((i) => i.id === defaultItemId) ?? null;

  const [dayIndex, setDayIndex] = useState(defaultDayIndex);
  const [placeId, setPlaceId] = useState(
    sourceItem?.placeId ?? tripPlaces[0]?.id ?? ''
  );
  const [title, setTitle] = useState(
    sourceItem ? `在${placeView(sourceItem.placeId)?.name ?? '路上'}的一次相遇` : ''
  );
  const [body, setBody] = useState(sourceItem?.relate?.line ? `${sourceItem.relate.line}` : '');
  const [tag, setTag] = useState('相遇');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (title.trim().length === 0) {
      setError('给这张记忆起一个短标题。');
      return;
    }
    if (body.trim().length === 0) {
      setError('写下一两句你记得的细节。');
      return;
    }
    if (!placeId) {
      setError('请选择这张记忆对应的地点。');
      return;
    }
    onSave({
      id: `mem-${Date.now().toString(36)}`,
      dateLabel: trip.days[dayIndex]?.date ?? '',
      placeId,
      title: title.trim(),
      body: body.trim(),
      tag: tag.trim() || '相遇',
      createdAt: Date.now(),
    });
  };

  return (
    <Modal
      title="记住这一刻"
      subtitle="保存后会计入五 R 中的 Remember。这是闭环的预览，不是社交发布。"
      onClose={onCancel}
      footer={
        <>
          {error ? (
            <p className="field-error left" style={{ color: '#A8473C', marginTop: 0 }}>
              {error}
            </p>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            保存记忆
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="mc-day">旅行日期</label>
          <select
            id="mc-day"
            value={dayIndex}
            onChange={(e) => setDayIndex(Number(e.target.value))}
          >
            {trip.days.map((d) => (
              <option key={d.index} value={d.index}>
                {d.date}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="mc-place">地点</label>
          <select id="mc-place" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            {tripPlaces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field full">
          <label htmlFor="mc-title">标题</label>
          <input
            id="mc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="一张卡片只记一件事"
          />
        </div>

        <div className="field full">
          <label htmlFor="mc-body">你记得的细节</label>
          <textarea
            id="mc-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="那个人说了什么、当时是什么天气、你为什么会记得。"
          />
        </div>

        <div className="field full">
          <label htmlFor="mc-tag">色标</label>
          <input id="mc-tag" value={tag} onChange={(e) => setTag(e.target.value)} />
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {TAG_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                style={{ cursor: 'pointer' }}
                onClick={() => setTag(t)}
              >
                {t}
              </button>
            ))}
          </span>
        </div>
      </div>
    </Modal>
  );
}
