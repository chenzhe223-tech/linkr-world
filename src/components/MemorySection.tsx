import type { MemoryEntry } from '../lib/types';
import { placeView } from '../data/tripData';
import { RememberMark } from '../brand/BrandMarkExtras';

interface MemorySectionProps {
  memories: MemoryEntry[];
  onCompose: () => void;
  onDelete: (id: string) => void;
  anchorRef?: React.RefObject<HTMLDivElement>;
}

export function MemorySection({ memories, onCompose, onDelete, anchorRef }: MemorySectionProps) {
  return (
    <section className="wb-memory" ref={anchorRef} id="memory-section" aria-labelledby="memory-h">
      <div className="memory-head">
        <div>
          <p className="eyebrow">Remember · 世界记忆</p>
          <h2 id="memory-h" style={{ fontSize: 21, marginTop: 8 }}>
            把一次真实的相遇，留成一张记忆
          </h2>
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              lineHeight: 1.8,
              color: 'var(--ink-2)',
              maxWidth: 620,
            }}
          >
            记忆不是动态流、不是打卡。它是这趟旅程里一个具体的人、一处具体的街角，和一句你当时真的听见的话。
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onCompose}>
          记住这一刻
        </button>
      </div>

      {memories.length === 0 ? (
        <div className="memory-empty">
          <span className="me-mark" aria-hidden="true">
            <RememberMark size={26} />
          </span>
          还没有记忆。从日程里选一个行程块，点“记住这一刻”，写下你记得的那个人或那句话。
          <br />
          保存后，五 R 进度中的 <strong style={{ color: '#7C5A82' }}>Remember</strong> 会计入这张卡片。
        </div>
      ) : (
        <div className="memory-grid">
          {memories.map((m) => {
            const place = placeView(m.placeId);
            return (
              <article className="memory-card notch" key={m.id}>
                <p className="mc-date">{m.dateLabel}</p>
                <p className="mc-place">{place ? place.name : '未指定地点'}</p>
                <p className="mc-title">{m.title}</p>
                <p className="mc-body">{m.body}</p>
                <div className="mc-foot">
                  <span className="mc-tag">{m.tag}</span>
                  <button
                    type="button"
                    className="btn-link btn-danger"
                    onClick={() => onDelete(m.id)}
                    aria-label={`删除记忆：${m.title}`}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
