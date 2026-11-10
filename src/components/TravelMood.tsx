import { climateOfMonth, type CityInfo } from '../data/cities';
import type { TripMood } from '../lib/mood';
import { CityHero } from './Photo';

interface TravelMoodProps {
  city: CityInfo;
  mood: TripMood;
  /** 出发月份（1–12）：气温与穿搭口径统一跟它走 */
  month: number;
}

/**
 * 旅行情绪条：文艺主题 + 城市性格 + 旅行配色 + 穿搭建议。
 * 与首页输入的城市和愿望联动，进入工作台后始终可见。
 */
export function TravelMood({ city, mood, month }: TravelMoodProps) {
  const mc = climateOfMonth(city, month);
  return (
    <section className="mood-strip" aria-label="旅行主题与穿搭建议">
      <div className="mood-strip-inner">
        <div className="mood-main">
          <CityHero cityId={city.id}>
            <div className="hero-copy">
              <p className="hero-title">{city.slogan.title}</p>
              <p className="hero-sub">{city.slogan.sub}</p>
            </div>
          </CityHero>
          <p className="eyebrow">
            旅行主题 · Theme
            <span className="mood-where">
              {city.name} · {city.province} · {mc.month} 月 {mc.lowC}–{mc.highC}°C
            </span>
          </p>
          <p className="mood-headline">「{mood.themeLine}」</p>
          <p className="mood-sub">
            {city.intro}—— 城市性格：{city.character.join(' / ')}。
          </p>
        </div>

        <div className="mood-side">
          <div className="mood-block">
            <p className="mood-block-title">旅行配色 · Palette</p>
            <ul className="palette-row">
              {mood.palette.map((s) => (
                <li key={s.hex} title={`${s.name} · ${s.use}`}>
                  <i style={{ background: s.hex }} aria-hidden="true" />
                  <span className="pl-name">{s.name}</span>
                  <span className="pl-use">{s.use}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mood-block">
            <p className="mood-block-title">穿搭建议 · Outfit</p>
            <p className="outfit-summary">{mood.outfit.summary}</p>
            <ul className="outfit-list">
              {mood.outfit.items.map((o) => (
                <li key={o.piece}>
                  <b>{o.piece}</b>
                  <span>{o.detail}</span>
                </li>
              ))}
            </ul>
            {mood.outfit.notes.length > 0 ? (
              <ul className="outfit-notes">
                {mood.outfit.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
