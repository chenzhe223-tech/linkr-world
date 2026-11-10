import type { CostCategory, Trip } from '../lib/types';
import type { CityRates } from '../data/cityRates';
import {
  PACE_LABEL,
  TIER_LABEL,
  dayRoamKm,
  formatCNY,
  paceOf,
  type BudgetSummary,
  type FullBudget,
  type PromptSummary,
} from '../lib/tripMath';
import type { IntercityPlan } from '../lib/transport';

const CATEGORY_COLOR: Record<CostCategory, string> = {
  ticket: '#0B3A5B',
  food: '#DBB27A',
  shop: '#7C5A82',
  transit: '#4F7F78',
  other: '#8E8E93',
};

interface TripSummaryProps {
  trip: Trip;
  summary: PromptSummary;
  budget: BudgetSummary;
  /** 吃住行全包预算（区间） */
  allIn: FullBudget;
  /** 大交通方案（按距离与当季价格推荐） */
  intercity: IntercityPlan;
  /** 目的地的消费参考价与通达性 */
  cityRates: CityRates;
  selectedDay: number;
  onSelectDay: (d: number) => void;
}

function rangeText(low: number, high: number): string {
  return low === high ? formatCNY(low) : `${formatCNY(low)} – ${formatCNY(high)}`;
}

export function TripSummary({
  trip,
  summary,
  budget,
  allIn,
  intercity,
  cityRates,
  selectedDay,
  onSelectDay,
}: TripSummaryProps) {
  const maxDayCost = Math.max(1, ...budget.perDay);
  const dateRange = `${trip.days[0]?.date ?? ''} – ${trip.days[trip.days.length - 1]?.date ?? ''}`;

  return (
    <div className="left-inner">
      <div className="block" style={{ marginTop: 0 }}>
        <div className="overview-dates">
          <span className="big num">{trip.days.length}</span>
          <span className="rest">
            天 · {trip.destination}
            <br />
            {dateRange}
          </span>
        </div>

        <dl className="fact-list" style={{ marginTop: 18 }}>
          {trip.origin ? (
            <div className="fact-row">
              <dt>出发地</dt>
              <dd>
                {trip.origin} → {trip.destination}
              </dd>
            </div>
          ) : null}
          {trip.note ? (
            <div className="fact-row trip-note-row">
              <dt>口径</dt>
              <dd>{trip.note}</dd>
            </div>
          ) : null}
          <div className="fact-row">
            <dt>同行</dt>
            <dd>
              {summary.companions} · {trip.travelers} 人
            </dd>
          </div>
          <div className="fact-row">
            <dt>主题</dt>
            <dd>{summary.mood.themeEn}</dd>
          </div>
          <div className="fact-row">
            <dt>行程块</dt>
            <dd>{trip.items.length} 个</dd>
          </div>
        </dl>

        <p className="pref-note">
          <span>偏好 · </span>
          {summary.preference}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>
          {summary.tags.map((t) => (
            <span className="chip" key={t}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="block" data-testid="budget-block">
        <p className="block-title">预算 · 吃住行全包（估算区间）</p>
        <p className="allin-total num" data-testid="budget-range">
          {rangeText(allIn.low, allIn.high)}
        </p>
        <p className="budget-sub">
          {trip.days.length} 天 {allIn.nights} 晚 · {trip.travelers} 人同行 ·{' '}
          <span className="tier-chip">{TIER_LABEL[allIn.tier]}</span>
          <br />
          含往返大交通、住宿、三餐（含茶咖甜品）、门票体验与市内交通
        </p>

        <ul className="budget-rows" data-testid="budget-rows">
          {allIn.rows.map((r) => (
            <li key={r.key}>
              <div className="br-top">
                <span className="br-label">{r.label}</span>
                <span className="br-amt num">{rangeText(r.low, r.high)}</span>
              </div>
              <p className="br-note">{r.note}</p>
            </li>
          ))}
        </ul>

        <p className="tiny-note">
          区间为估算：大交通按出发地到目的地的距离与当季票价走势推算，实时价格以 12306 与航司公示为准；
          住宿与餐饮按 {cityRates.stayPerNight[0]}–{cityRates.stayPerNight[1]} 元/晚、
          {cityRates.mealPerDay[0]}–{cityRates.mealPerDay[1]} 元/天的当地参考价，再按档位缩放。
        </p>
      </div>

      <div className="block" data-testid="intercity-block">
        <p className="block-title">大交通 · 去与回</p>
        {!intercity.recognized ? (
          <p className="budget-sub">
            在输入框里写上出发地（例如"从杭州出发，2 天"），这里会按两点距离与当季票价，
            给出高铁 / 飞机 / 网约车的时间与价格区间，并计入上面的总预算。
          </p>
        ) : intercity.options.length > 0 ? (
          <div className="tc-card">
            <div className="tc-head">
              <span className="tc-route">
                {intercity.from} → {intercity.to}
              </span>
              <span className="tc-km num">约 {intercity.km} km</span>
            </div>
            <ul className="tc-options">
              {intercity.options.map((o) => (
                <li key={o.key} className={o.recommended ? 'is-rec' : ''}>
                  <div className="tc-top">
                    <span className="tc-mode">
                      {o.label}
                      {o.recommended ? <em className="tc-badge">推荐</em> : null}
                    </span>
                    <span className="tc-price num">
                      {rangeText(o.oneWayLow, o.oneWayHigh)}
                      <span className="tc-unit"> 单程</span>
                    </span>
                  </div>
                  <p className="tc-dur">{o.durationLabel}</p>
                  <p className="tc-note">{o.note}</p>
                </li>
              ))}
            </ul>
            <p className="tc-basis">
              推荐方式往返合计约 {rangeText(intercity.roundTripLow, intercity.roundTripHigh)}／人。
              <br />
              {intercity.basis}
            </p>
          </div>
        ) : (
          <p className="budget-sub">
            {intercity.from}与{intercity.to}同城或相邻，本次按无大交通估算。
          </p>
        )}
      </div>

      <div className="block">
        <p className="block-title">逐日花费 · Per day</p>
        <p className="budget-total num is-sub" data-testid="items-total">
          {formatCNY(budget.total)}
        </p>
        <p className="budget-sub">
          行程内合计：门票/体验/购入 {formatCNY(budget.itemsTotal)} ＋ 市内交通估算{' '}
          {formatCNY(budget.transitTotal)}
          <br />
          按天均摊约 {formatCNY(budget.avgPerDay)}／天（住宿与大交通见上方全包预算）
        </p>

        <div
          className="stack-bar"
          role="img"
          aria-label={`预算构成：${budget.byCategory
            .map((c) => `${c.label} ${formatCNY(c.amount)}`)
            .join('，')}`}
        >
          {budget.byCategory.map((c) => (
            <i
              key={c.key}
              style={{ width: `${c.ratio * 100}%`, background: CATEGORY_COLOR[c.key] }}
            />
          ))}
        </div>

        <ul className="cat-list">
          {budget.byCategory.map((c) => (
            <li key={c.key}>
              <span className="swatch" style={{ background: CATEGORY_COLOR[c.key] }} />
              <span className="name">{c.label}</span>
              <span className="amt">{formatCNY(c.amount)}</span>
            </li>
          ))}
        </ul>

        <ul className="perday-list">
          {trip.days.map((d) => {
            const km = dayRoamKm(trip.items, d.index);
            const pace = paceOf(km);
            return (
              <li
                key={d.index}
                className={d.index === selectedDay ? 'is-current' : ''}
                aria-current={d.index === selectedDay ? 'true' : undefined}
              >
                <button
                  type="button"
                  className="dlabel"
                  onClick={() => onSelectDay(d.index)}
                  style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
                  aria-label={`跳到第 ${d.index + 1} 天，${d.theme}，${PACE_LABEL[pace]}`}
                >
                  <span className={`pace-dot ${pace}`} aria-hidden="true" />
                  <span className="num">D{d.index + 1}</span>
                </button>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${(budget.perDay[d.index] / maxDayCost) * 100}%` }} />
                </span>
                <span className="amt">{formatCNY(budget.perDay[d.index])}</span>
              </li>
            );
          })}
        </ul>

        <p className="tiny-note">
          市内交通按固定费率逐段估算：步行／骑行 ¥0，公交 ¥2，地铁 ¥4，网约车 ¥45。估算单列，不摊入行程块金额。
        </p>
      </div>
    </div>
  );
}
