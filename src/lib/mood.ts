// Link-R World — 旅行情绪引擎
//
// 根据用户输入 + 城市性格，生成文艺旅行主题、旅行配色与穿搭建议。
// 全部确定性规则：同一句输入 + 同一座城市，输出恒定。

import { currentMonth, seasonOfMonth, type CityInfo, type OutfitItem, type PaletteSwatch } from '../data/cities';

export interface TripMood {
  /** 文艺主题句（一整句） */
  themeLine: string;
  themeEn: string;
  /** 标题短句（主题句的第一个分句） */
  titleShort: string;
  /** 气质关键词 */
  keywords: string[];
  /** 旅行配色 */
  palette: PaletteSwatch[];
  /** 穿搭建议（按出发季节取口径 + 输入个性化） */
  outfit: { summary: string; items: OutfitItem[]; notes: string[] };
}

/** 输入关键词 → 个性化提醒（确定性规则） */
const INPUT_NOTES: Array<{ keys: string[]; note: string }> = [
  { keys: ['夜', '酒', '夜市'], note: '夜里把行程放宽半小时——这座城的夜和白天是两种节奏。' },
  { keys: ['茶', '茶山', '茶园'], note: '进茶室或上山前把手机调成静音，茶是要坐着喝的。' },
  { keys: ['爬山', '徒步', '山'], note: '登山段把背包收轻，水带够，鞋底认真选。' },
  { keys: ['海', '滩', '岛', '潜水'], note: '海边风大紫外线强，物理防晒优先于防晒霜。' },
  { keys: ['拍照', '出片', '写真', '簪花'], note: '拍照日穿纯色，把复杂留给背景。' },
  { keys: ['书店', '阅读', '旧书'], note: '给书包留出四分之一的空间，战利品总比计划多。' },
  { keys: ['带娃', '孩子', '父母', '家人', '亲子游', '带父母', '爸妈', '老人'], note: '带家人出行，每天只排两个"必去"，剩下的交给巷子。' },
  { keys: ['不赶', '慢', '松弛'], note: '慢节奏的秘诀不是少排，是每天留一个"什么都不做"的下午。' },
];

export function buildMood(city: CityInfo, input: string, month?: number, age?: number): TripMood {
  const text = (input ?? '').trim();
  const matched = city.themes.find((t) => t.keys.some((k) => text.includes(k)));
  const theme = matched ?? { keys: [], line: city.intro, en: 'The City Itself' };

  const short = theme.line.split('，')[0]?.split('。')[0] ?? theme.line;

  const notes = INPUT_NOTES.filter((r) => r.keys.some((k) => text.includes(k))).map((r) => r.note);

  // 年龄字段（选填）：节奏与体验按年纪微调，但不改变用户自己写的要求
  if (typeof age === 'number' && Number.isFinite(age) && age > 0) {
    if (age >= 60) {
      notes.unshift('长辈同行：上午一个重点、下午一个重点，午休别省，步数别贪多。');
    } else if (age <= 25) {
      notes.unshift('这个年纪值得把夜生活留一晚，白天别排太满，睡醒再出发也没关系。');
    }
  }

  // 穿搭口径跟着出发月份走：用户几月出发，页面就是那个季节的说法
  const season = seasonOfMonth(month ?? currentMonth());

  return {
    themeLine: theme.line,
    themeEn: theme.en,
    titleShort: short,
    keywords: city.character.slice(0, 3),
    palette: city.palette,
    outfit: {
      summary: city.outfit.summary[season],
      items: city.outfit.items,
      notes,
    },
  };
}
