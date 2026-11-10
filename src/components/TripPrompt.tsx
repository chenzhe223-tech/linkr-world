import { useState, type ChangeEvent } from 'react';
import type { CityInfo } from '../data/cities';
import type { DateIssue } from '../lib/consistency';

export interface QuickChip {
  key: string;
  label: string;
}

export const QUICK_CHIPS: QuickChip[] = [
  { key: '独行', label: '独行' },
  { key: '慢节奏', label: '慢节奏' },
  { key: '亲子游', label: '亲子游' },
  { key: '带父母旅行', label: '带父母旅行' },
  { key: '书店与咖啡', label: '书店与咖啡' },
  { key: '美术馆与展览', label: '美术馆与展览' },
  { key: '夜市', label: '夜市' },
  { key: '茶山与徒步', label: '茶山与徒步' },
];

/** 自定义标签的本地存储键（跨会话保留用户自己加的标签） */
const CUSTOM_CHIPS_KEY = 'lrw-custom-chips';
const MAX_CUSTOM_CHIPS = 12;

function loadCustomChips(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_CHIPS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()).slice(0, MAX_CUSTOM_CHIPS) : [];
  } catch {
    return [];
  }
}

export const EXAMPLE_PROMPT =
  '4 月一个人去玩 5 天，想逛书店、吃当地小馆，不赶路。';

export const GEN_STEPS_BASE = [
  '读取你的旅行愿望',
  '对齐目的地的地点与时段',
  '排布逐日行程与通勤',
  '核对票价与开放时间口径',
  '生成行程草稿',
];

interface TripPromptProps {
  value: string;
  onChange: (v: string) => void;
  chips: string[];
  onToggleChip: (key: string) => void;
  onGenerate: () => void;
  onUseExample: () => void;
  generating: boolean;
  genStep: number;
  error: string | null;
  city: CityInfo;
  /** 出发地 / 出发日期（显式字段） */
  origin: string;
  onOriginChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  /** 年龄（选填）：节奏与体验按年纪微调 */
  age: string;
  onAgeChange: (v: string) => void;
  /** 从愿望文字里实时识别出的天数 / 日期 */
  daysHint: number | null;
  dateHint: string | null;
  /** 口径一致性：愿望与日期/天数矛盾时的提示卡（可一键修正或否决） */
  dateIssue?: DateIssue | null;
  onApplyDateFix?: () => void;
  onIgnoreDateFix?: () => void;
}

export function TripPrompt({
  value,
  onChange,
  chips,
  onToggleChip,
  onGenerate,
  onUseExample,
  generating,
  genStep,
  error,
  city,
  origin,
  onOriginChange,
  startDate,
  onStartDateChange,
  age,
  onAgeChange,
  daysHint,
  dateHint,
  dateIssue,
  onApplyDateFix,
  onIgnoreDateFix,
}: TripPromptProps) {
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value);
  const canSubmit = !generating && (value.trim().length > 0 || chips.length > 0);
  const genSteps = [`读取你的旅行愿望`, `对齐${city.name}的地点与时段`, ...GEN_STEPS_BASE.slice(2)];

  // 自定义标签：用户自己加，本地保留，点了即刻生效（和内置标签同一套逻辑）
  const [customChips, setCustomChips] = useState<string[]>(loadCustomChips);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const addCustomChip = () => {
    const label = draft.trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!label) {
      setAdding(false);
      setDraft('');
      return;
    }
    const next = customChips.includes(label) ? customChips : [...customChips, label].slice(-MAX_CUSTOM_CHIPS);
    setCustomChips(next);
    try {
      localStorage.setItem(CUSTOM_CHIPS_KEY, JSON.stringify(next));
    } catch {
      /* 存不进就不存，不影响本次使用 */
    }
    if (!chips.includes(label)) onToggleChip(label);
    setDraft('');
    setAdding(false);
  };

  return (
    <section className="departure" aria-labelledby="departure-label">
      <div className="departure-label">
        <p className="eyebrow on-blue" id="departure-label">
          出发台 · {city.name}
        </p>
        <button
          type="button"
          className="btn-link on-dark"
          onClick={onUseExample}
        >
          用示例句
        </button>
      </div>

      {/* 出发地 / 出发日期 / 天数：写几天就排几天，写哪天出发就从哪天开始排 */}
      <div className="trip-fields">
        <div className="field">
          <label htmlFor="tp-origin">出发地</label>
          <input
            id="tp-origin"
            value={origin}
            onChange={(e) => onOriginChange(e.target.value)}
            placeholder="例如：杭州"
          />
        </div>
        <div className="field">
          <label htmlFor="tp-date">出发日期</label>
          <input
            id="tp-date"
            type="date"
            value={startDate || dateHint || ''}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="tp-days">天数</label>
          <input id="tp-days" value={daysHint ? `${daysHint} 天` : '按文字识别'} readOnly />
        </div>
        <div className="field">
          <label htmlFor="tp-age">年龄（选填）</label>
          <input
            id="tp-age"
            type="number"
            min={1}
            max={99}
            value={age}
            onChange={(e) => onAgeChange(e.target.value)}
            placeholder="个性化节奏用"
          />
        </div>
      </div>

      <label htmlFor="wish" className="sr-only">
        写下你的旅行愿望
      </label>
      <textarea
        id="wish"
        value={value}
        onChange={handleChange}
        placeholder={`用一句自然语言写下：几月几号去${city.name}、玩几天、和谁、什么节奏、想做什么。写几天就排几天。`}
        aria-describedby={error ? 'wish-error' : undefined}
        aria-invalid={error ? true : undefined}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
            e.preventDefault();
            onGenerate();
          }
        }}
      />

      <div className="quick-row" role="group" aria-label="快捷偏好">
        {QUICK_CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            className="quick-chip"
            aria-pressed={chips.includes(c.key)}
            onClick={() => onToggleChip(c.key)}
          >
            {c.label}
          </button>
        ))}
        {customChips.map((label) => (
          <button
            key={`custom-${label}`}
            type="button"
            className="quick-chip is-custom"
            aria-pressed={chips.includes(label)}
            onClick={() => onToggleChip(label)}
            title="自定义标签，点击选用 / 取消"
          >
            {label}
          </button>
        ))}
        {adding ? (
          <input
            type="text"
            className="quick-add-input"
            value={draft}
            autoFocus
            maxLength={12}
            placeholder="输入标签，回车确认"
            aria-label="自定义标签"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addCustomChip}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomChip();
              }
              if (e.key === 'Escape') {
                setDraft('');
                setAdding(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="quick-chip quick-add"
            onClick={() => setAdding(true)}
            title="加一个你自己的标签"
          >
            ＋ 自定义
          </button>
        )}
      </div>

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={generating}
          aria-disabled={generating}
        >
          {generating ? '正在生成行程…' : `生成${city.name}行程`}
        </button>
        <span className="actions-note">
          {generating
            ? '请稍候，生成中按钮不可重复点击'
            : '天数与日期按你写的排：打卡点不求多，只求精和准。'}
        </span>
      </div>

      {error ? (
        <p className="field-error" id="wish-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* 口径矛盾提示：先讲清矛盾，再给一键修正；用户也可以坚持原口径 */}
      {dateIssue && !generating ? (
        <div className="date-issue" role="alert" data-testid="date-issue">
          <p className="date-issue-title">前后矛盾了，先对一下口径</p>
          <p className="date-issue-msg">{dateIssue.message}</p>
          <div className="date-issue-actions">
            <button type="button" className="btn-primary" onClick={onApplyDateFix}>
              {dateIssue.fixLabel}
            </button>
            <button type="button" className="btn-link" onClick={onIgnoreDateFix}>
              仍按当前日期生成
            </button>
          </div>
        </div>
      ) : null}

      {generating ? (
        <div className="gen-status" role="status" aria-live="polite">
          <p className="eyebrow on-blue">AI 工作状态</p>
          <ul className="gen-steps">
            {genSteps.map((s, i) => (
              <li
                key={s}
                className={i < genStep ? 'is-done' : i === genStep ? 'is-active' : ''}
              >
                <span className="marker">{i < genStep ? '✓' : i === genStep ? '›' : '·'}</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <div className="gen-bar" aria-hidden="true">
            <i style={{ width: `${Math.round((genStep / genSteps.length) * 100)}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
