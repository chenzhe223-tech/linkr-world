import { Wordmark } from './BrandMark';

interface AppHeaderProps {
  tone?: 'blue' | 'paper';
  /** 是否处于工作台（首屏之外） */
  inWorkbench: boolean;
  onGoWorkbench: () => void;
  onGoLanding: () => void;
  onGoMemory: () => void;
  memoryCount: number;
}

export function AppHeader({
  inWorkbench,
  onGoWorkbench,
  onGoLanding,
  onGoMemory,
  memoryCount,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <Wordmark />
      <div className="spacer" />
      <nav className="header-nav" aria-label="主导航">
        <button type="button" onClick={onGoWorkbench} aria-current={inWorkbench ? 'page' : undefined}>
          行程工作台
        </button>
        <button type="button" onClick={onGoMemory}>
          世界记忆{memoryCount > 0 ? ` · ${memoryCount}` : ''}
        </button>
        {inWorkbench ? (
          <button type="button" onClick={onGoLanding} className="hide-sm">
            改写愿望
          </button>
        ) : null}
      </nav>
    </header>
  );
}
