import { useState } from 'react';
import { climateOfMonth, monthOfISO, type CityInfo } from '../data/cities';
import type { TripMood } from '../lib/mood';
import type { DateIssue } from '../lib/consistency';
import { AppHeader } from '../brand/AppHeader';
import { TripPrompt } from './TripPrompt';
import { CityHero } from './Photo';

interface LandingProps {
  value: string;
  onChange: (v: string) => void;
  chips: string[];
  onToggleChip: (key: string) => void;
  onGenerate: () => void;
  onUseExample: () => void;
  generating: boolean;
  genStep: number;
  error: string | null;
  onGoMemory: () => void;
  memoryCount: number;
  /** 当前选中的城市与切换 */
  city: CityInfo;
  onSelectCity: (cityId: CityInfo['id']) => void;
  cities: CityInfo[];
  /** 根据当前输入实时计算的旅行情绪预览 */
  mood: TripMood;
  /** 出发地 / 出发日期（显式字段，驱动逐日行程） */
  origin: string;
  onOriginChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
  /** 年龄（选填，个性化节奏） */
  age: string;
  onAgeChange: (v: string) => void;
  /** 从输入文字里实时识别出的天数 / 日期（用于字段联动提示） */
  daysHint: number | null;
  dateHint: string | null;
  /** 口径一致性提示（随 ...props 透传给 TripPrompt） */
  dateIssue?: DateIssue | null;
  onApplyDateFix?: () => void;
  onIgnoreDateFix?: () => void;
}

/** 首屏背景：极光航线，作为"出发台"的呼吸感。 */
function LandingCanvas() {
  return (
    <svg
      className="landing-canvas"
      viewBox="0 0 1200 820"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="landing-aurora" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#DBB27A" />
          <stop offset="55%" stopColor="#0B3A5B" />
          <stop offset="100%" stopColor="#0A2E48" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="rgba(13, 27, 38,0.07)" strokeWidth="1.2">
        <path d="M-40 690 C 220 610, 330 470, 520 430 C 720 388, 840 300, 1250 250" />
        <path d="M-40 780 C 260 700, 380 560, 600 512 C 830 462, 940 380, 1250 330" />
        <path d="M120 840 C 300 700, 420 660, 600 640 C 830 614, 1010 520, 1260 470" />
      </g>
      <g fill="none" stroke="url(#landing-aurora)" strokeOpacity="0.35" strokeWidth="1.4" strokeDasharray="7 9">
        <path d="M-20 470 C 230 460, 360 360, 560 316 C 748 275, 900 180, 1240 132" />
      </g>
      <circle cx="560" cy="316" r="4" fill="#DBB27A" opacity="0.6" />
      <circle cx="1132" cy="152" r="6.5" fill="#0A2E48" opacity="0.7" />
      <g fill="none" stroke="rgba(13, 27, 38,0.055)">
        <circle cx="1010" cy="640" r="180" />
        <circle cx="1010" cy="640" r="260" />
      </g>
    </svg>
  );
}

export function Landing(props: LandingProps) {
  const {
    onGoMemory,
    memoryCount,
    city,
    cities,
    mood,
    origin,
    onOriginChange,
    startDate,
    onStartDateChange,
    age,
    onAgeChange,
    daysHint,
    dateHint,
    ...promptProps
  } = props;

  // 城市卡上的月份、气温与穿搭口径：出发日期优先，没填就按当前月
  const mc = climateOfMonth(city, monthOfISO(startDate || dateHint));

  // ── 待上线 · 申请城市 ──────────────────────────────────────
  // 用户想去的城市还没上线？记下申请（本地留存），先给已上线城市的完整规划。
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDraft, setApplyDraft] = useState('');
  const [applyNote, setApplyNote] = useState('');
  const [requests, setRequests] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('lrw-city-requests') || '[]');
      return Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === 'string').slice(0, 8) : [];
    } catch {
      return [];
    }
  });

  const applyCity = () => {
    const name = applyDraft.trim().replace(/\s+/g, '').slice(0, 6);
    setApplyOpen(false);
    setApplyDraft('');
    if (!name) return;
    const next = requests.includes(name) ? requests : [...requests, name].slice(-8);
    setRequests(next);
    try {
      localStorage.setItem('lrw-city-requests', JSON.stringify(next));
    } catch {
      /* 存不进就不存，不影响本次 */
    }
    setApplyNote(`「${name}」已加入待上线名单，攒够呼声我们就优先上线；先挑一座已上线的城市出发。`);
  };

  return (
    <div className="landing">
      <LandingCanvas />
      <AppHeader
        inWorkbench={false}
        onGoWorkbench={props.onGenerate}
        onGoLanding={() => undefined}
        onGoMemory={onGoMemory}
        memoryCount={memoryCount}
      />

      <main className="landing-inner">
        <div className="landing-copy">
          <p className="eyebrow on-blue">自由行 · AI 行程工作台</p>
          <h1>
            把一句旅行愿望，
            <br />
            变成一份<em>走得下去</em>的行程。
          </h1>
          <p className="landing-lede">
            不做攻略聚合，不建旅行社区。只做一件事：让你说的"我想怎样旅行"，变成可调整、可理解、可执行的逐日行程
            —— 地点、路线、时间、预算和现实限制，都写在同一个画面上。
          </p>

          <div className="city-grid" role="group" aria-label="选择目的地">
            {cities.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`city-chip${c.id === city.id ? ' is-active' : ''}`}
                aria-pressed={c.id === city.id}
                onClick={() => props.onSelectCity(c.id)}
                style={c.id === city.id ? { borderColor: c.stateColor, color: '#1C1C1E' } : undefined}
              >
                <i
                  className="city-dot"
                  aria-hidden="true"
                  style={{ background: c.id === city.id ? c.stateColor : 'rgba(13, 27, 38,.35)' }}
                />
                {c.name}
              </button>
            ))}

            {/* 待上线：用户申请想去的城市，攒够呼声优先上线 */}
            {requests.map((r) => (
              <span key={r} className="city-chip is-pending" title="待上线：已收到申请">
                {r} · 待上线
              </span>
            ))}
            {applyOpen ? (
              <span className="apply-city">
                <input
                  className="apply-input"
                  value={applyDraft}
                  autoFocus
                  maxLength={6}
                  placeholder="城市名，如：大理"
                  aria-label="申请上线的城市"
                  onChange={(e) => setApplyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyCity();
                    }
                    if (e.key === 'Escape') {
                      setApplyOpen(false);
                      setApplyDraft('');
                    }
                  }}
                  onBlur={applyCity}
                />
              </span>
            ) : (
              <button
                type="button"
                className="city-chip apply-btn"
                onClick={() => setApplyOpen(true)}
                title="想去的城市还没上线？申请优先开通"
              >
                ＋ 申请城市
              </button>
            )}
          </div>
          {applyNote ? <p className="apply-note">{applyNote}</p> : null}

          <div className="mood-preview" aria-live="polite">
            <CityHero cityId={city.id}>
              <div className="hero-copy">
                <p className="hero-title">{city.slogan.title}</p>
                <p className="hero-sub">{city.slogan.sub}</p>
              </div>
            </CityHero>
            <p className="mood-city">
              {city.name}
              <span>
                {city.province} · {mc.month} 月 {mc.lowC}–{mc.highC}°C · {city.stateColorName}
              </span>
            </p>            <p className="mood-line">「{mood.themeLine}」</p>
            <p className="mood-keywords">{mood.keywords.join(' · ')}</p>
          </div>
        </div>

        <TripPrompt
          {...promptProps}
          city={city}
          origin={origin}
          onOriginChange={onOriginChange}
          startDate={startDate}
          onStartDateChange={onStartDateChange}
          age={age}
          onAgeChange={onAgeChange}
          daysHint={daysHint}
          dateHint={dateHint}
        />
      </main>
    </div>
  );
}
