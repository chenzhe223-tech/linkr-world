import { useEffect, useMemo, useRef, useState } from 'react';
import type { CostCategory, ItineraryItem, TimeSlot } from '../lib/types';
import { placeView, registerCustomPlace, tripPlacesOfCity, TRANSIT_RATE } from '../data/tripData';
import { getCity, type CityId } from '../data/cities';
import { COST_CATEGORY_LABEL, SLOT_LABEL, parseStartMinutes } from '../lib/tripMath';
import { loadMapKey, saveMapKey, searchBuiltIn, searchMap, type PlaceHit } from '../lib/poiSearch';
import { Modal } from './Modal';

export interface EditorDraft {
  id?: string;
  dayIndex: number;
  slot: TimeSlot;
  time: string;
  placeId: string;
  note: string;
  transitMode: string;
  transitMinutes: number;
  transitNeedCheck: boolean;
  cost: number;
  costCategory: CostCategory;
  roamKm: number;
  relateWith: string;
  relateLine: string;
}

export function emptyDraft(cityId: CityId, dayIndex: number): EditorDraft {
  const places = tripPlacesOfCity(cityId);
  return {
    dayIndex,
    slot: 'afternoon',
    time: '14:00–15:30',
    placeId: places[0]?.id ?? '',
    note: '',
    transitMode: '地铁',
    transitMinutes: 20,
    transitNeedCheck: false,
    cost: 0,
    costCategory: 'ticket',
    roamKm: 0,
    relateWith: '',
    relateLine: '',
  };
}

export function draftFromItem(item: ItineraryItem): EditorDraft {
  return {
    id: item.id,
    dayIndex: item.dayIndex,
    slot: item.slot,
    time: item.time,
    placeId: item.placeId,
    note: item.note,
    transitMode: item.transit.mode,
    transitMinutes: item.transit.minutes,
    transitNeedCheck: Boolean(item.transit.needCheck),
    cost: item.cost,
    costCategory: item.costCategory,
    roamKm: item.roamKm ?? 0,
    relateWith: item.relate?.with ?? '',
    relateLine: item.relate?.line ?? '',
  };
}

interface ItemEditorProps {
  mode: 'add' | 'edit';
  draft: EditorDraft;
  dayLabel: string;
  cityId: CityId;
  onCancel: () => void;
  onSave: (item: ItineraryItem) => void;
}

export function ItemEditor({ mode, draft, dayLabel, cityId, onCancel, onSave }: ItemEditorProps) {
  const [f, setF] = useState<EditorDraft>(draft);
  const [error, setError] = useState<string | null>(null);
  const cityPlaces = useMemo(() => tripPlacesOfCity(cityId), [cityId]);
  const city = getCity(cityId);
  const place = placeView(f.placeId) ?? cityPlaces.find((p) => p.id === f.placeId);

  // ── 地点搜索：内置精选库即时过滤 + 地图大数据（腾讯位置服务，本机 Key） ──
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const [hasKey, setHasKey] = useState(() => loadMapKey() !== '');
  const [keyDraft, setKeyDraft] = useState('');
  const [mapHits, setMapHits] = useState<PlaceHit[] | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const builtinHits = useMemo(() => searchBuiltIn(cityId, query, 6), [cityId, query]);

  // 输入防抖后查地图 POI（有 Key 才查）
  useEffect(() => {
    const kw = query.trim();
    if (!hasKey || kw.length < 2) {
      setMapHits(null);
      setMapError('');
      return;
    }
    let alive = true;
    setMapBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const hits = await searchMap(kw, city?.name ?? '');
        if (!alive) return;
        setMapHits(hits ?? []);
        setMapError('');
      } catch (e) {
        if (!alive) return;
        setMapHits([]);
        setMapError(e instanceof Error ? e.message : '地图搜索失败。');
      } finally {
        if (alive) setMapBusy(false);
      }
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, hasKey, city]);

  const chooseHit = (hit: PlaceHit) => {
    if (hit.source === 'builtin') {
      set('placeId', hit.id);
    } else {
      const p = registerCustomPlace({
        cityId,
        name: hit.name,
        district: hit.district,
        lat: hit.lat,
        lng: hit.lng,
        address: hit.detail,
      });
      set('placeId', p.id);
      if (!f.note.trim()) set('note', `从地图添加：${hit.detail}`);
    }
    setQuery('');
    setShowList(false);
    setError(null);
  };

  const saveKey = () => {
    const k = keyDraft.trim();
    if (!k) return;
    saveMapKey(k);
    setHasKey(true);
    setKeyDraft('');
  };

  // 点弹层外面收起搜索结果
  useEffect(() => {
    if (!showList) return;
    const onDocDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowList(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [showList]);

  const transitModes = useMemo(() => Object.keys(TRANSIT_RATE), []);
  const set = <K extends keyof EditorDraft>(k: K, v: EditorDraft[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const submit = () => {
    if (parseStartMinutes(f.time) === null) {
      setError('时间需要写成“09:30–11:15”这样的格式，且小时分钟合法。');
      return;
    }
    if (!place) {
      setError('请先选一个地点。');
      return;
    }
    if (f.note.trim().length === 0) {
      setError('写一句体验提示：这一段要走什么、注意什么。');
      return;
    }
    const item: ItineraryItem = {
      id: f.id ?? `n-${Date.now().toString(36)}`,
      dayIndex: f.dayIndex,
      slot: f.slot,
      time: f.time.trim(),
      placeId: f.placeId,
      note: f.note.trim(),
      transit: {
        mode: f.transitMode,
        minutes: Math.max(0, Math.round(f.transitMinutes) || 0),
        ...(f.transitNeedCheck ? { needCheck: true } : {}),
      },
      cost: Math.max(0, Math.round(f.cost) || 0),
      costCategory: f.costCategory,
      ...(f.roamKm > 0 ? { roamKm: f.roamKm } : {}),
      ...(f.relateWith.trim().length > 0
        ? { relate: { with: f.relateWith.trim(), line: f.relateLine.trim() } }
        : {}),
    };
    onSave(item);
  };

  return (
    <Modal
      title={mode === 'add' ? '添加一个体验块' : '编辑行程块'}
      subtitle={`${dayLabel} · 保存后日程与预算立即重算`}
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
            {mode === 'add' ? '加入行程' : '保存修改'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="ed-place-q">地点（可搜索）</label>
          <div className="place-search" ref={boxRef}>
            <input
              id="ed-place-q"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              placeholder={place ? `已选：${place.name}（点此改搜别处）` : '输入名称搜索：精选库 / 地图大数据'}
              autoComplete="off"
            />
            {showList ? (
              <div className="place-results" role="listbox" aria-label="地点搜索结果">
                {builtinHits.length > 0 ? (
                  <>
                    <p className="pr-group">精选库里匹配的地点</p>
                    {builtinHits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        role="option"
                        aria-selected={f.placeId === h.id}
                        className="pr-item"
                        onClick={() => chooseHit(h)}
                      >
                        <span className="pr-name">{h.name}</span>
                        <span className="pr-meta">
                          {h.district} · {h.ticket === 0 ? '免费' : `¥${h.ticket}`}
                        </span>
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="pr-group">
                    {query.trim() ? '精选库里没有匹配，试试下面的地图大数据。' : '输入名称开始搜索。'}
                  </p>
                )}

                {!hasKey ? (
                  <div className="pr-keyrow">
                    <p className="pr-group">
                      想搜全城任意地点（餐厅 / 咖啡 / 酒店，同百度地图的搜法）？
                      <br />
                      填入免费的腾讯地图 Key 即可，Key 只存在你本机。
                      <a href="https://lbs.qq.com/dev/console/key/add" target="_blank" rel="noreferrer">
                        去申请（lbs.qq.com，勾选 WebServiceAPI）
                      </a>
                    </p>
                    <div className="pr-keyinput">
                      <input
                        type="text"
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveKey();
                          }
                        }}
                        placeholder="粘贴腾讯地图 Key"
                        aria-label="腾讯地图 Key"
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={saveKey}>
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="pr-group">地图大数据{mapBusy ? ' · 搜索中…' : ''}</p>
                    {mapError ? <p className="pr-err">{mapError}</p> : null}
                    {(mapHits ?? []).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="pr-item is-map"
                        onClick={() => chooseHit(h)}
                      >
                        <span className="pr-name">{h.name}</span>
                        <span className="pr-meta">
                          {h.category ? `${h.category} · ` : ''}
                          {h.detail}
                        </span>
                      </button>
                    ))}
                    {!mapBusy && !mapError && mapHits !== null && mapHits.length === 0 && query.trim().length >= 2 ? (
                      <p className="pr-group">地图里也没搜到，换个说法试试。</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
          {place ? (
            <p className="select-place-preview">
              <b>{place.name}</b>
              {place.nameEn ? `（${place.nameEn}）` : ''}　|　{place.district}　|　
              {place.ticket === 0 ? '免费' : `¥${place.ticket}`}
              <br />
              开放：{place.hours}
              <br />
              {place.tip}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="ed-slot">时段</label>
          <select
            id="ed-slot"
            value={f.slot}
            onChange={(e) => set('slot', e.target.value as TimeSlot)}
          >
            {(Object.keys(SLOT_LABEL) as TimeSlot[]).map((k) => (
              <option key={k} value={k}>
                {SLOT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ed-time">时间</label>
          <input
            id="ed-time"
            value={f.time}
            onChange={(e) => set('time', e.target.value)}
            placeholder="09:30–11:15"
            aria-describedby="ed-time-hint"
          />
          <span className="hint" id="ed-time-hint">
            用“开始–结束”的 24 小时制，界面按开始时间排序。
          </span>
        </div>

        <div className="field">
          <label htmlFor="ed-mode">通勤方式</label>
          <select
            id="ed-mode"
            value={f.transitMode}
            onChange={(e) => set('transitMode', e.target.value)}
          >
            {transitModes.map((m) => (
              <option key={m} value={m}>
                {m}（估算 ¥{TRANSIT_RATE[m]}／段）
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ed-min">通勤时长（分钟）</label>
          <input
            id="ed-min"
            type="number"
            min={0}
            max={240}
            value={f.transitMinutes}
            onChange={(e) => set('transitMinutes', Number(e.target.value))}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11.5,
              letterSpacing: 0,
              textTransform: 'none',
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-body)',
              marginTop: 2,
            }}
          >
            <input
              type="checkbox"
              checked={f.transitNeedCheck}
              onChange={(e) => set('transitNeedCheck', e.target.checked)}
              style={{ width: 'auto' }}
            />
            标记为班次易变（会提醒出发前确认）
          </label>
        </div>

        <div className="field">
          <label htmlFor="ed-cost">费用（元）</label>
          <input
            id="ed-cost"
            type="number"
            min={0}
            step={1}
            value={f.cost}
            onChange={(e) => set('cost', Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="ed-cat">费用分类</label>
          <select
            id="ed-cat"
            value={f.costCategory}
            onChange={(e) => set('costCategory', e.target.value as CostCategory)}
          >
            {(Object.keys(COST_CATEGORY_LABEL) as CostCategory[]).map((k) => (
              <option key={k} value={k}>
                {COST_CATEGORY_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ed-km">漫游里程（公里，可留空）</label>
          <input
            id="ed-km"
            type="number"
            min={0}
            step={0.1}
            value={f.roamKm}
            onChange={(e) => set('roamKm', Number(e.target.value))}
          />
        </div>

        <div className="field full">
          <label htmlFor="ed-note">体验提示</label>
          <textarea
            id="ed-note"
            value={f.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="这一段具体怎么走、什么时候去最好、要避开什么。"
          />
        </div>

        <div className="field">
          <label htmlFor="ed-with">相遇的人（可选）</label>
          <input
            id="ed-with"
            value={f.relateWith}
            onChange={(e) => set('relateWith', e.target.value)}
            placeholder="例如：书店店员"
          />
        </div>

        <div className="field">
          <label htmlFor="ed-line">他／她说的那句话（可选）</label>
          <input
            id="ed-line"
            value={f.relateLine}
            onChange={(e) => set('relateLine', e.target.value)}
            placeholder="写下来，之后可以做成 World Memory"
          />
        </div>
      </div>
    </Modal>
  );
}
