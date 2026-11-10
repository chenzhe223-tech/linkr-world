// Link-R World — 大交通票价账本（预算里的「去程 + 返程」两行的出处）
//
// 这块要回答三个问题，缺一个就是「把估算当实价」：
//   · 这个数从哪来（估算口径 / 你录入的实价 + 来源 + 查询时间）；
//   · 拿不到实时票价怎么办（明说「暂未获取实时票价」，给出官方核对入口 + 手工录入）；
//   · 行程变了以后哪些行要重新确认（行 id = 方向|区间|日期|方式，没变的行连同实价一起保留）。

import { useState } from 'react';
import { FARE_STATUS_LABEL, type FareLedger, type FareLine, type ManualFare } from '../lib/fares';

interface FareLedgerPanelProps {
  ledger: FareLedger;
  onSave: (lineId: string, fare: ManualFare) => void;
  onRemove: (lineId: string) => void;
}

const KIND_LABEL: Record<FareLine['kind'], string> = {
  outbound: '去程',
  return: '返程',
};

function money(n: number): string {
  return `¥${n.toLocaleString('zh-Hans-CN')}`;
}

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '日期未定';
  const [, m, d] = iso.split('-');
  return `${Number(m)} 月 ${Number(d)} 日`;
}

export function FareLedgerPanel({ ledger, onSave, onRemove }: FareLedgerPanelProps) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section className="fare" data-testid="fare-ledger">
      <div className="fare-head">
        <div>
          <p className="eyebrow">大交通票价账本 · 去程 + 返程</p>
          <p className="fare-sub">
            本平台未接入 12306 / 航旅纵横的实时票价接口，不代查、不杜撰：下面给出的是
            <b>明确标注的估算</b>，点「去官网核对」查实价，或直接录入你查到的价格。
          </p>
        </div>
        <div className="fare-counts" data-testid="fare-counts">
          {ledger.counts.live > 0 ? (
            <span className="fare-chip is-live">已查实时 {ledger.counts.live}</span>
          ) : null}
          {ledger.counts.estimate > 0 ? (
            <span className="fare-chip is-est">估算 {ledger.counts.estimate}</span>
          ) : null}
          {ledger.counts.unconfirmed > 0 ? (
            <span className="fare-chip is-warn">待确认 {ledger.counts.unconfirmed}</span>
          ) : null}
        </div>
      </div>

      {ledger.notices.length > 0 ? (
        <ul className="fare-notices" data-testid="fare-notices">
          {ledger.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <ul className="fare-lines">
        {ledger.lines.map((l) => {
          const isLive = l.status === 'live';
          return (
            <li
              className={`fare-line is-${l.status}`}
              key={l.id}
              data-testid="fare-line"
              data-status={l.status}
              data-fare-id={l.id}
            >
              <div className="fl-main">
                <span className="fl-kind">{KIND_LABEL[l.kind]}</span>
                <span className="fl-route">
                  {l.from} → {l.to}
                </span>
                <span className="fl-date">{fmtDate(l.date)}</span>
                <span className="fl-mode">
                  {l.modeLabel}
                  {!l.direct && l.transfer ? <i className="fl-transfer">中转</i> : null}
                </span>
              </div>
              <div className="fl-fare">
                <b data-testid="fare-amount">
                  {isLive ? money(l.perPersonLow) : `${money(l.perPersonLow)}–${money(l.perPersonHigh)}`}
                </b>
                <span className="fl-unit">/ 人单程</span>
                <span className={`fl-status is-${l.status}`}>{FARE_STATUS_LABEL[l.status]}</span>
              </div>
              <div className="fl-meta">
                <span>
                  小计（{l.travelers} 人）：<b>{money(l.perPersonLow * l.travelers)}</b>
                  {!isLive ? `–${money(l.perPersonHigh * l.travelers)}` : ''}
                </span>
                <span className="fl-src">
                  来源：{l.source}
                  {l.queriedAt ? ` · ${l.queriedAt}` : ''}
                </span>
              </div>
              <p className="fl-note">{l.note}</p>
              <div className="fl-actions">
                {l.queryUrl ? (
                  <a
                    className="fare-link"
                    href={l.queryUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-testid="fare-official-link"
                  >
                    去官网核对 ↗ {l.queryLabel}
                  </a>
                ) : null}
                {isLive ? (
                  <button
                    type="button"
                    className="fare-btn ghost"
                    onClick={() => {
                      onRemove(l.id);
                      setEditing(null);
                    }}
                  >
                    清除实价
                  </button>
                ) : (
                  <button
                    type="button"
                    className="fare-btn"
                    data-testid="fare-edit-btn"
                    onClick={() => setEditing(editing === l.id ? null : l.id)}
                  >
                    录入实价
                  </button>
                )}
              </div>

              {editing === l.id && !isLive ? (
                <FareForm
                  line={l}
                  onCancel={() => setEditing(null)}
                  onSubmit={(fare) => {
                    onSave(l.id, fare);
                    setEditing(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
        {ledger.lines.length === 0 ? (
          <li className="fare-empty">还没有可计价的去程 / 返程 —— 填上出发地与日期后再来看这一栏。</li>
        ) : null}
      </ul>

      <div className="fare-total" data-testid="fare-total">
        <span>
          人均往返（去程 + 返程）：
          <b>
            {money(ledger.perPerson.low)}
            {ledger.perPerson.high !== ledger.perPerson.low
              ? `–${money(ledger.perPerson.high)}`
              : ''}
          </b>
        </span>
        <span>
          同行合计：
          <b>
            {money(ledger.party.low)}
            {ledger.party.high !== ledger.party.low ? `–${money(ledger.party.high)}` : ''}
          </b>
        </span>
        <span className="fare-total-note">
          {ledger.hasLive
            ? '含已录入的实价；其余仍为估算。'
            : '全部为估算区间，未获取实时票价。'}
        </span>
      </div>
    </section>
  );
}

function FareForm({
  line,
  onSubmit,
  onCancel,
}: {
  line: FareLine;
  onSubmit: (fare: ManualFare) => void;
  onCancel: () => void;
}) {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const todayISO = Number.isNaN(today.getTime())
    ? ''
    : `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  const [perPerson, setPerPerson] = useState('');
  const [service, setService] = useState('');
  const [cabin, setCabin] = useState('');
  const [source, setSource] = useState('');
  const [queriedAt, setQueriedAt] = useState(todayISO);
  const valid = Number(perPerson) > 0 && source.trim().length > 0;

  return (
    <form
      className="fare-form"
      data-testid="fare-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          perPerson: Number(perPerson),
          service: service.trim() || undefined,
          cabin: cabin.trim() || undefined,
          source: source.trim(),
          queriedAt: queriedAt || todayISO,
        });
      }}
    >
      <p className="fare-form-title">
        录入 {line.from} → {line.to} 的实价（这一行会升级为「已查实时」，预算按它算）
      </p>
      <div className="fare-form-grid">
        <label>
          单人单程（元）
          <input
            data-testid="fare-per-person"
            type="number"
            min="1"
            step="1"
            value={perPerson}
            onChange={(e) => setPerPerson(e.target.value)}
            placeholder="如 820"
            required
          />
        </label>
        <label>
          车次 / 航班（选填）
          <input
            data-testid="fare-service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="如 G1373 / MU5401"
          />
        </label>
        <label>
          席别 / 舱位（选填）
          <input
            data-testid="fare-cabin"
            value={cabin}
            onChange={(e) => setCabin(e.target.value)}
            placeholder="如 二等座 / 经济舱"
          />
        </label>
        <label>
          来源
          <input
            data-testid="fare-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="如 12306 App / 航旅纵横"
            required
          />
        </label>
        <label>
          查询时间
          <input
            data-testid="fare-queried"
            type="date"
            value={queriedAt}
            onChange={(e) => setQueriedAt(e.target.value)}
          />
        </label>
      </div>
      <div className="fare-form-actions">
        <button type="submit" className="fare-btn" disabled={!valid}>
          保存实价
        </button>
        <button type="button" className="fare-btn ghost" onClick={onCancel}>
          取消
        </button>
        <span className="fare-form-hint">只填你真的查到的数；来源必填，方便日后复核。</span>
      </div>
    </form>
  );
}
