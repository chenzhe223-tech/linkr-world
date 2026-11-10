/**
 * 手机端底部标签栏（iOS 风格）。
 * 窄屏下工作台一次只显示一栏，用底部标签切换：
 * 行程（逐日行程）/ 概况（预算与五 R）/ 住宿（特色住宿推荐）/ 地图（路线与地点）/ 记忆（World Memory）。
 *
 * 注意：这里刻意不使用 role="tab" —— 页面里的 role="tab" 只属于「按天切换」的日期标签，
 * 以免两套 tablist 互相污染（读屏与自动化验收都依赖这一点）。
 */

import type { ReactNode } from 'react';

export type MobileTab = 'plan' | 'overview' | 'stay' | 'map' | 'memory';

interface TabDef {
  key: MobileTab;
  label: string;
  icon: ReactNode;
}

const ICONS: Record<MobileTab, ReactNode> = {
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M8.5 14.5l1.8 1.8 3.7-3.8" />
    </svg>
  ),
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.2a9 9 0 1 0 9 9h-9z" />
      <path d="M14.6 2.5A9 9 0 0 1 21.5 9.4h-6.9z" />
    </svg>
  ),
  stay: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 19v-6.4h18V19" />
      <path d="M3 19v2M21 19v2" />
      <path d="M6.2 12.6V9.2a1.4 1.4 0 0 1 1.4-1.4h9.8a1.4 1.4 0 0 1 1.4 1.4v3.4" />
      <path d="M6.2 8.6V5.6a1.4 1.4 0 0 1 1.4-1.4h4.6a1.4 1.4 0 0 1 1.4 1.4v3" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21.2s7-6.2 7-11.1a7 7 0 1 0-14 0c0 4.9 7 11.1 7 11.1z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3.8h10A1.2 1.2 0 0 1 18.2 5v16l-6.2-4.2L5.8 21V5A1.2 1.2 0 0 1 7 3.8z" />
    </svg>
  ),
};

const TABS: TabDef[] = [
  { key: 'plan', label: '行程', icon: ICONS.plan },
  { key: 'overview', label: '概况', icon: ICONS.overview },
  { key: 'stay', label: '住宿', icon: ICONS.stay },
  { key: 'map', label: '地图', icon: ICONS.map },
  { key: 'memory', label: '记忆', icon: ICONS.memory },
];

interface MobileTabBarProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
  memoryCount: number;
}

export function MobileTabBar({ active, onChange, memoryCount }: MobileTabBarProps) {
  return (
    <nav className="mobile-tabbar" aria-label="工作台分栏切换">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            className={`mtab${on ? ' is-active' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange(t.key)}
          >
            <span className="mtab-ico" aria-hidden="true">
              {t.icon}
              {t.key === 'memory' && memoryCount > 0 ? <i className="mtab-dot" /> : null}
            </span>
            <span className="mtab-lb">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
