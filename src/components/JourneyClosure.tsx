// Link-R World — 旅行闭环与「真实可游玩时间」展示
//
// 这一段回答一个过去被含糊掉的问题：标着「3 天」的行程，真正能玩多久？
//
// 两种形态（同一份时间账本，两种详略）：
//   · summary —— 放左栏「旅程概况」：一句话结论 + 三个数 + 状态，够看不够占地方；
//   · detail  —— 放三栏下方的全宽带「时间账本」：时间轴、逐日可玩、可行性建议、口径脚注。
//
// 为什么拆两种：左栏只有约 330px 宽，把明细全塞进去会把左栏撑到近 3000px，
// 中栏却只有 1300px，页面右侧出现大片空白（本项目此前已因同样原因把节奏带搬出左栏）。
// 拆开之后左栏只长一句话，明细在整屏宽里横排，信息密度与版式都成立。
//
// 口径纪律：所有交通时刻一律标注「估算 · 待确认」，不虚构航班号与发车时刻；
// 数据缺失项单列 pending，绝不混进「已确认」的表述里。

import type { JourneyRole, TripLifecycle } from '../lib/types';
import { formatClock, humanDuration, playDaysEquivalent } from '../lib/journey';

const ROLE_LABEL: Record<JourneyRole, string> = {
  departure: '抵达日',
  full: '完整游玩日',
  transit: '城际转移日',
  return: '返程日',
};

const STATUS_META: Record<
  TripLifecycle['feasibility']['status'],
  { label: string; color: string; bg: string; note: string }
> = {
  ok: {
    label: '时间账成立',
    color: '#567D5F',
    bg: 'rgba(86,125,95,.10)',
    note: '每个行程块都落在当天的可用时间窗内，不用压缩内容。',
  },
  tight: {
    label: '时间偏紧',
    color: '#C8862F',
    bg: 'rgba(200,134,47,.12)',
    note: '能走完，但交通吃掉了不少可玩时间，建议按下面的建议调一调。',
  },
  infeasible: {
    label: '时间不够',
    color: '#A8473C',
    bg: 'rgba(168,71,60,.10)',
    note: '按现在的天数排不下已选的行程块，需要先减内容或加天数。',
  },
};

interface Props {
  lifecycle: TripLifecycle;
  /** summary = 左栏一句话；detail = 全宽带时间账本 */
  variant?: 'summary' | 'detail';
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="cl-figure">
      <p className="clf-label">{label}</p>
      <p className="clf-value num">{value}</p>
      {sub ? <p className="clf-sub">{sub}</p> : null}
    </div>
  );
}

/** 未填出发地时，交通与总时长都算不出来 —— 显示「待定」，不显示会误导的 0 小时 */
const PENDING = '待定';
const dur = (min: number): string => (min > 0 ? humanDuration(min) : PENDING);

/** 左栏：一句话结论 + 三个数 + 状态（约 4 行，不撑高左栏） */
function Summary({ lifecycle: lc }: { lifecycle: TripLifecycle }) {
  const st = STATUS_META[lc.feasibility.status];
  // 未填出发地：往返交通与真实可玩时间都算不出来，别写成「含去程与返程」
  const noOrigin = !lc.origin || lc.origin === '出发地';
  return (
    <div className="block" data-testid="journey-closure">
      <p className="block-title">旅行闭环 · 真正能玩多久</p>
      <p className="budget-sub" data-testid="closure-verdict">
        {noOrigin ? (
          <>
            还差一个出发地：日历 <b className="num">{lc.calendarDays}</b> 天，
            但往返交通与真实可玩时间暂时算不出来（不凭空编一段交通）。
          </>
        ) : (
          <>
            日历 <b className="num">{lc.calendarDays}</b> 天
            {lc.mode === 'round-trip' ? '（含去程与返程）' : '（开放式）'}， 实际可用于游玩{' '}
            <b className="num">{humanDuration(lc.playMinutes)}</b>
            {lc.mode === 'round-trip' ? (
              <>
                ，往返交通 <b className="num">{humanDuration(lc.travelMinutes)}</b>
              </>
            ) : null}
            。
          </>
        )}
      </p>
      <p className="closure-inline">
        <span>
          {lc.origin} → {lc.route[0] ?? '—'}
          <br />
          {lc.departDate || '日期未定'}
        </span>
        {lc.mode === 'round-trip' && lc.legs.some((l) => l.kind === 'return') ? (
          <span>
            返程 {lc.returnTo}
            <br />
            枢纽 {formatClock(lc.returnDepartMin)} 出发
          </span>
        ) : (
          <span>
            结束于 {lc.returnTo || lc.route[lc.route.length - 1] || '—'}
            <br />
            {noOrigin ? '待填出发地' : '不含返程'}
          </span>
        )}
        <span style={{ color: st.color, fontWeight: 600 }}>
          {st.label}
          {lc.feasibility.suggestedDays ? ` · 建议 ${lc.feasibility.suggestedDays} 天` : ''}
        </span>
      </p>
      <p className="tiny-note" style={{ marginTop: 8 }}>
        {playDaysEquivalent(lc.playMinutes)}；去程 / 返程、逐日可玩与可行性建议见下方「时间账本」。
      </p>
    </div>
  );
}

/** 全宽带：完整时间账本 */
function Detail({ lifecycle: lc }: { lifecycle: TripLifecycle }) {
  const f = lc.feasibility;
  const st = STATUS_META[f.status];
  const out = lc.legs.find((l) => l.kind === 'outbound');
  const back = lc.legs.find((l) => l.kind === 'return');
  const intercity = lc.legs.filter((l) => l.kind === 'intercity');

  return (
    <section className="wb-closure" data-testid="journey-ledger" aria-label="旅行时间账本">
      <p className="block-title">旅行时间账本 · 去程与返程都要算进去</p>

      <div className="closure-band-grid">
        {/* ① 五个互不混用的数 + 出发 / 返回 / 日期 */}
        <div>
          <div className="cl-figures">
            <Figure label="日历天数" value={`${lc.calendarDays} 天`} sub={lc.departDate || '日期未定'} />
            <Figure label="旅行总时长" value={dur(lc.totalMinutes)} sub="出发 → 返回落地" />
            <Figure
              label="往返交通"
              value={dur(lc.travelMinutes)}
              sub={lc.travelMinutes > 0 ? '含接驳与候车' : '未填出发地或无需大交通'}
            />
            <Figure
              label="城际接驳"
              value={dur(lc.intercityMinutes)}
              sub={intercity.length > 0 ? `${intercity.length} 段城市间` : '单城或无'}
            />
            <Figure
              label="实际可玩"
              value={humanDuration(lc.playMinutes)}
              sub={`≈ ${playDaysEquivalent(lc.playMinutes)}`}
            />
          </div>

          <dl className="closure-facts">
            <div className="closure-row">
              <dt>出发</dt>
              <dd>
                {lc.origin} → {lc.route[0] ?? lc.origin}
                {out ? (
                  <>
                    <br />
                    枢纽 {formatClock(lc.outboundDepartMin)} 出发 · {formatClock(lc.outboundArriveMin)} 抵达
                  </>
                ) : (
                  <>
                    <br />
                    未填出发地，往返交通暂时算不出来
                  </>
                )}
              </dd>
            </div>
            {lc.route.length > 1 ? (
              <div className="closure-row">
                <dt>途经</dt>
                <dd>{lc.route.join(' → ')}</dd>
              </div>
            ) : null}
            <div className="closure-row">
              <dt>返回</dt>
              <dd>
                {lc.mode === 'open-jaw' ? (
                  <>开放式路线：结束于 {lc.returnTo || lc.route[lc.route.length - 1]}，不含返程</>
                ) : back ? (
                  <>
                    枢纽 {formatClock(lc.returnDepartMin)} 出发 · {formatClock(lc.returnArriveMin)} 抵达
                  </>
                ) : (
                  <>—</>
                )}
              </dd>
            </div>
            <div className="closure-row">
              <dt>日期</dt>
              <dd>
                {lc.departDate || '未定'} – {lc.returnDate || '未定'}（{lc.calendarDays} 天）
              </dd>
            </div>
          </dl>
        </div>

        {/* ② 交通段（逐段给出接驳 · 候车 · 抵达，全部标注为估算） */}
        <div>
          <p className="closure-sub-title">交通段 · 逐段闭环</p>
          {lc.legs.length === 0 ? (
            <p className="closure-empty">
              未填出发地：不编造一段不存在的交通。填上出发地后，这里会给出每一段的接驳、候车与抵达时刻。
            </p>
          ) : (
            <ul className="closure-legs" data-testid="closure-legs">
              {lc.legs.map((l) => (
                <li key={l.id}>
                  <div className="cl-top">
                    <span className="cl-kind">
                      {l.kind === 'outbound' ? '去程' : l.kind === 'return' ? '返程' : '城际'}
                    </span>
                    <span className="cl-route">
                      {l.from} → {l.to} · {l.mode}
                    </span>
                    <span className="cl-est">估算 · 待确认</span>
                  </div>
                  <p className="cl-time num">
                    离开住处 {formatClock(l.startMin)} · 枢纽 {l.hubTime} · 抵达落脚 {formatClock(l.endMin)}
                    {l.overnight ? ' · 跨日' : ''}
                  </p>
                  <p className="cl-basis">{l.basis}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ③ 逐日可玩 + 可行性 */}
        <div>
          <p className="closure-sub-title">逐日可玩时间</p>
          <ul className="closure-days" data-testid="closure-days">
            {lc.days.map((d) => (
              <li key={d.dayIndex}>
                <span className="cd-day num">D{d.dayIndex + 1}</span>
                <span className="cd-role">{ROLE_LABEL[d.role]}</span>
                <span className="cd-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.min(100, Math.round((d.playMinutes / (10 * 60)) * 100))}%`,
                    }}
                  />
                </span>
                <span className="num cd-play">
                  {d.playMinutes > 0 ? humanDuration(d.playMinutes) : '无可玩时间'}
                </span>
                <span className="cd-note">
                  {d.windows.length > 0
                    ? `可用 ${formatClock(d.windows[0].lo)}–${formatClock(d.windows[0].hi)}${
                        d.mealMinutes + d.bufferMinutes > 0
                          ? ` · 扣用餐 ${d.mealMinutes} 分 + 缓冲 ${d.bufferMinutes} 分`
                          : ''
                      }`
                    : d.note}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="closure-status"
            style={{ background: st.bg, borderColor: st.color }}
            data-testid="closure-status"
          >
            <p style={{ color: st.color, fontWeight: 600, fontSize: 13 }}>
              {st.label}
              {f.suggestedDays ? ` · 建议延长到 ${f.suggestedDays} 天` : ''}
            </p>
            <p style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.65 }}>{st.note}</p>

            {f.issues.length > 0 ? (
              <ul className="closure-issues">
                {f.issues.map((i, n) => (
                  <li key={`${i.code}-${n}`} className={i.severity === 'block' ? 'is-block' : ''}>
                    {i.message}
                  </li>
                ))}
              </ul>
            ) : null}

            {f.suggestions.length > 0 ? (
              <ul className="closure-fixes" data-testid="closure-suggestions">
                {f.suggestions.map((s, n) => (
                  <li key={n}>{s}</li>
                ))}
              </ul>
            ) : null}
          </div>

                      {/* 直飞规则：≤5 天拿不到直飞时不偷偷放宽，把选择权交给用户 */}
            {lc.directFlight?.message ? (
              <div
                className={`closure-direct${lc.directFlight.question ? ' is-ask' : ''}`}
                data-testid="closure-direct"
                data-need-decision={lc.directFlight.question ? 'yes' : 'no'}
              >
                <p className="closure-direct-msg">
                  <b>直飞规则</b> · {lc.directFlight.message}
                </p>
                {lc.recommendReason ? (
                  <p className="closure-direct-reason">推荐方式：{lc.recommendReason}</p>
                ) : null}
                {lc.directFlight.question ? (
                  <>
                    <p className="closure-direct-q">{lc.directFlight.question}</p>
                    <ul className="closure-direct-choices">
                      {lc.directFlight.choices.map((c, n) => (
                        <li key={n}>{c}</li>
                      ))}
                    </ul>
                    <p className="closure-direct-hint">
                      在「大交通票价账本」里录入你查到的实价，或回复我们改排法 —— 不会自动按中转排。
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

          {lc.pending.length > 0 ? (
            <ul className="closure-pending" data-testid="closure-pending">
              {lc.pending.map((p, n) => (
                <li key={n}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <p className="closure-foot">
        口径：每天可用时间窗默认 08:30–22:30；抵达日从「抵达 + 30 分休整」起算，返程日从「返程实际出发 −
        接驳候车 − 30 分回住处取行李」倒推。用餐预留（午餐 60 分 / 晚餐 75 分）只在时间窗覆盖饭点时计入，
        且不与行程块重复扣减；块间缓冲 30 分/天。交通运输时长按两点距离与当季票价估算，
        <b>不代表已预订的真实班次</b>，出发前请在 12306 / 航司复核。
      </p>
    </section>
  );
}

export function JourneyClosure({ lifecycle, variant = 'detail' }: Props) {
  return variant === 'summary' ? <Summary lifecycle={lifecycle} /> : <Detail lifecycle={lifecycle} />;
}
