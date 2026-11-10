// Link-R World — 特色住宿推荐（IV · 特色住宿）
//
// 模块职责（只做三件事，绝不臆造酒店事实）：
//   1) 展示：把 stays.ts 里逐家对照过携程详情页的品牌门店按「层级 → 钻级」列出来，
//      每家都给携程详情页链接，用户可以自己点开核对；
//   2) 个性化：读当前行程的同行人与偏好关键词，用 matchStays 做排序 + 给理由；
//   3) 筛选：按酒店集团 / 层级过滤，方便按"想住哪个牌子"来找。
//
// 数据口径见 stays.ts 顶部注释：名录来自携程 hotel-suggest，官方名称与钻级逐家
// 抓自携程详情页；本模块不提供报价（房态与价格随日期波动），不做二次加工。
import { useMemo, useState } from 'react';
import type { CityId } from '../data/cities';
import {
  STAY_SOURCE,
  STAYS,
  allBrandGroups,
  ctripUrl,
  matchStays,
  sortStays,
  staysOfCity,
  type Stay,
  type StayTier,
} from '../data/stays';

const TIERS: StayTier[] = ['国际连锁', '国内连锁', '度假奢华', '精品民宿'];

/** 钻级 → 星串（0 钻时给一个中性说明，不硬凑星级） */
function DiamondMark({ diamond }: { diamond: number }) {
  if (diamond <= 0) return <span className="stay-dim">钻级待核</span>;
  return (
    <span className="stay-dim" aria-label={`携程 ${diamond} 钻`}>
      {'◆'.repeat(Math.min(5, diamond))}
      <b>{diamond} 钻</b>
    </span>
  );
}

function StayCard({ match, rank }: { match: ReturnType<typeof matchStays>[number]; rank: number }) {
  const { stay, hits, reason } = match;
  return (
    <article className="stay-card" data-testid="stay-card" data-stay-id={stay.id}>
      <header className="stay-card-head">
        <span className="stay-rank">{rank}</span>
        <div className="stay-title-wrap">
          <h4 className="stay-name" title={stay.name}>
            {stay.name}
          </h4>
          <p className="stay-meta">
            <span className="stay-tier" data-tier={stay.tier}>
              {stay.tier}
            </span>
            <span className="stay-brand">{stay.brandGroup}</span>
            <span className="stay-area">{stay.area}</span>
          </p>
        </div>
        <DiamondMark diamond={stay.diamond} />
      </header>

      <p className="stay-reason">{reason}</p>
      <p className="stay-note">{stay.note}</p>

      <footer className="stay-card-foot">
        <span className="stay-tags">
          {stay.bestFor.map((t) => (
            <i key={t} className={hits.includes(t) ? 'stay-tag hit' : 'stay-tag'}>
              {t}
            </i>
          ))}
        </span>
        <a className="stay-verify" href={ctripUrl(stay)} target="_blank" rel="noreferrer">
          携程看实时价 ↗
        </a>
      </footer>
    </article>
  );
}

export function StaySection({ cityId, trip }: { cityId: CityId; trip: { companions?: string; preference?: string; travelers?: number } }) {
  const [brand, setBrand] = useState<string>('全部');
  const [tier, setTier] = useState<StayTier | '全部'>('全部');
  const [personal, setPersonal] = useState(true);

  const cityStays = useMemo(() => staysOfCity(cityId), [cityId]);
  const groups = useMemo(() => allBrandGroups().filter((g) => cityStays.some((s) => s.brandGroup === g)), [cityStays]);

  /** 个性化匹配（同行人 + 偏好关键词 + 出行人数） */
  const matched = useMemo(() => {
    const keywords = (trip.preference ?? '')
      .split(/[\s,，、。；;：:!！?？/|]+/)
      .filter((w) => w.length >= 2);
    const budgetFriendly = /穷游|省|预算|性价比/.test(trip.preference ?? '');
    const list = matchStays(cityId, { companions: trip.companions, keywords, budgetFriendly });
    return list;
  }, [cityId, trip.companions, trip.preference]);

  /** 关闭个性化时回到"稳定排序"，方便用户按品牌/钻级自己看 */
  const ordered = useMemo(() => {
    if (!personal) return sortStays(cityStays).map((stay) => ({ stay, hits: [], reason: '' }));
    return matched;
  }, [personal, cityStays, matched]);

  const visible = useMemo(
    () =>
      ordered
        .filter((m) => brand === '全部' || m.stay.brandGroup === brand)
        .filter((m) => tier === '全部' || m.stay.tier === tier),
    [ordered, brand, tier]
  );

  if (cityStays.length === 0) {
    return (
      <section className="stay-section" aria-label="特色住宿推荐" data-testid="stay-section">
        <div className="col-head stay-col-head">
          <p className="eyebrow">IV · 特色住宿推荐</p>
          <span className="idx">FEATURED STAYS</span>
        </div>
        <p className="stay-empty-note">
          特色住宿模块首批覆盖云南三城（大理 / 腾冲 / 丽江），共 {STAYS.length} 家门店，名称与钻级逐家对照携程详情页；
          其余城市暂时没有这样逐家对照的数据，就不在这里硬凑了。
        </p>
      </section>
    );
  }

  const personalized = personal && matched.some((m) => m.hits.length > 0);

  return (
    <section className="stay-section" aria-label="特色住宿推荐" data-testid="stay-section">
      <div className="col-head stay-col-head">
        <p className="eyebrow">IV · 特色住宿推荐</p>
        <span className="idx">FEATURED STAYS</span>
      </div>

      <div className="stay-toolbar">
        <div className="stay-filter" role="group" aria-label="按酒店集团筛选">
          <span className="stay-filter-label">集团</span>
          {['全部', ...groups].map((g) => (
            <button
              key={g}
              type="button"
              className={brand === g ? 'stay-chip on' : 'stay-chip'}
              onClick={() => setBrand(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="stay-filter" role="group" aria-label="按层级筛选">
          <span className="stay-filter-label">层级</span>
          {(['全部', ...TIERS] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={tier === t ? 'stay-chip on' : 'stay-chip'}
              onClick={() => setTier(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={personal ? 'stay-chip on stay-chip-toggle' : 'stay-chip stay-chip-toggle'}
          onClick={() => setPersonal((v) => !v)}
          title="按同行人与偏好关键词重排（只影响顺序与推荐理由，不改变任何酒店事实）"
        >
          ✦ 按我的行程排序
        </button>
      </div>

      <p className="stay-basis" data-testid="stay-basis">
        {personalized
          ? `已按你的行程（${[trip.companions, trip.preference].filter(Boolean).slice(0, 2).join(' / ') || '默认口径'}）重排 ${cityStays.length} 家门店；顺序是建议，事实以携程为准。`
          : `按「层级 → 钻级」列出 ${cityStays.length} 家门店；打开个性化排序可读到你行程的侧重点。`}
      </p>

      <div className="stay-grid">
        {visible.map((m, i) => (
          <StayCard key={m.stay.id} match={m} rank={i + 1} />
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="stay-empty-note">这个筛选组合下没有门店，换一个集团或层级试试。</p>
      ) : null}

      <p className="stay-source">
        数据来源：{STAY_SOURCE}。房态与价格随日期波动，本模块不提供报价，请以携程 / 飞猪当日实时价为准。
      </p>
    </section>
  );
}

/** 供测试引用的纯函数：某城榜单长度 */
export function stayCountOf(cityId: CityId): number {
  return staysOfCity(cityId).length;
}

export type { Stay };
