// Link-R World — 口径一致性检查（纯函数）
//
// 用户的一句话里常带时间口径词（周末 / 周五晚 / 国庆 …），与显式选择的出发日期、
// 天数可能前后矛盾。这里只做确定性检查与修正建议，绝不静默改用户的行程。

export interface DateFix {
  /** 修正后的出发日期（yyyy-mm-dd） */
  startDate: string;
  /** 修正后的天数 */
  days: number;
  /** 修正依据，写进提示与行程脚注（闭环：怎么去、怎么回） */
  note: string;
}

export interface DateIssue {
  code: 'weekend-mismatch';
  /** 矛盾提示（直接可展示） */
  message: string;
  /** 一键修正 */
  fixLabel: string;
  fix: DateFix;
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function isoWeekday(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmt(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])} 月 ${Number(m[3])} 日` : iso;
}

/** 某日期所在周（周一起算）的周六 */
function saturdayOfSameWeek(iso: string): string {
  const wd = isoWeekday(iso);
  if (wd === null) return iso;
  // JS getDay(): 周日 0 → 视作本周第 7 天
  const idx = wd === 0 ? 7 : wd;
  return addDaysISO(iso, 6 - idx);
}

function nextSaturday(fromISO: string): string {
  const wd = isoWeekday(fromISO);
  if (wd === null) return fromISO;
  return addDaysISO(fromISO, (6 - wd + 7) % 7 || 7);
}

const WEEKEND_RE = /周末/;
/** 明确否定周末口径的写法（"不是周末去""错峰"）不参与检查 */
const WEEKEND_NEG_RE = /不是周末|非周末|错峰/;

/**
 * 检查「愿望文字里的时间口径」与「显式出发日期 / 天数」是否矛盾。
 * 目前覆盖：周末口径（周六出发 · 周日返程 · 共 2 天 · 建议周五晚出发）。
 */
export function checkDateConsistency(input: {
  text: string;
  startDate: string;
  days: number | null;
  today?: string;
}): DateIssue[] {
  const { text, startDate, days } = input;
  const issues: DateIssue[] = [];
  if (!text || WEEKEND_NEG_RE.test(text) || !WEEKEND_RE.test(text)) return issues;

  const startWd = startDate ? isoWeekday(startDate) : null;
  const closedLoop = '周五晚上出发 · 周日晚返回出发地，全程 2 天闭环';

  // 情形一：写了周末，但出发日期不是周六
  if (startDate && startWd !== null && startWd !== 6) {
    const target =
      startWd === 5 || startWd === 0
        ? saturdayOfSameWeek(startDate)
        : nextSaturday(startDate);
    issues.push({
      code: 'weekend-mismatch',
      message: `你写了「周末去」的口径，但 ${fmt(startDate)} 是周${WEEKDAYS[startWd]}，不是周末。周末出行默认：周六出发、周日返回，共 2 天。`,
      fixLabel: `按周末修正：${fmt(target)}（周六）出发 · 2 天`,
      fix: {
        startDate: target,
        days: 2,
        note: `周末口径：${closedLoop}`,
      },
    });
    return issues;
  }

  // 情形二：日期是周六，但天数不是 2
  if (startDate && startWd === 6 && days !== null && days !== 2) {
    issues.push({
      code: 'weekend-mismatch',
      message: `你写了「周末」，出发日期 ${fmt(startDate)} 是周六没问题，但天数是 ${days} 天。周末口径默认共 2 天：${closedLoop}。`,
      fixLabel: '按周末修正：2 天（周日返回）',
      fix: {
        startDate,
        days: 2,
        note: `周末口径：${closedLoop}`,
      },
    });
    return issues;
  }

  // 情形三：没填日期但写了周末 → 提示建议下一个周六（给修正，不强改）
  if (!startDate) {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const target = nextSaturday(today);
    issues.push({
      code: 'weekend-mismatch',
      message: `你写了「周末」但还没选出发日期。周末出行默认：周六出发、周日返回，共 2 天（${closedLoop}）。`,
      fixLabel: `按周末口径：${fmt(target)}（周六）出发 · 2 天`,
      fix: {
        startDate: target,
        days: 2,
        note: `周末口径：${closedLoop}`,
      },
    });
  }
  return issues;
}
