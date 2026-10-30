import { type ReactElement, type ReactNode } from 'react';
import type { LayoutMode } from '../../hooks/useLayoutState';

interface AppLayoutProps {
  mode: LayoutMode;
  leftPanel: ReactNode;
  centerStage: ReactNode;
  rightPanel: ReactNode;
}

export function AppLayout({
  mode,
  leftPanel,
  centerStage,
  rightPanel,
}: AppLayoutProps): ReactElement {
  const showLeft = mode === 'decision-point' || mode === 'output-review';
  const showRight = mode === 'output-only' || mode === 'output-review';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-stage-bg">
      {/* Left Panel — 240px */}
      <div
        className={`absolute left-0 top-0 z-10 h-full w-[240px] transform transition-transform duration-200 ease-panel-slide lg:relative ${
          showLeft ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!showLeft}
      >
        {leftPanel}
      </div>

      {/* Center Stage — always visible, min 400px */}
      <div className="flex min-w-[400px] flex-1 flex-col">{centerStage}</div>

      {/* Right Panel — 380px */}
      <div
        className={`absolute right-0 top-0 z-10 h-full w-[380px] transform transition-transform duration-200 ease-panel-slide lg:relative ${
          showRight ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!showRight}
      >
        {rightPanel}
      </div>
    </div>
  );
}
