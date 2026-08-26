import { RotateCcw, RotateCw, RefreshCw, Orbit } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { useStore } from '../store/useStore';
import { rotateNodes } from '../lib/graph';
import { useI18n } from '../i18n';

/**
 * 그래프 뷰 컨트롤 — 2D: 회전 버튼/자동회전, 3D: 자동 궤도 회전
 */
export default function ViewControls() {
  const { t } = useI18n();
  const langMode = useUIStore((s) => s.langMode);
  const autoRotate2d = useUIStore((s) => s.autoRotate2d);
  const toggleAutoRotate2d = useUIStore((s) => s.toggleAutoRotate2d);
  const autoOrbit3d = useUIStore((s) => s.autoOrbit3d);
  const toggleAutoOrbit3d = useUIStore((s) => s.toggleAutoOrbit3d);
  const graph = useStore((s) => s.graph);

  const spin = (deg: number) => rotateNodes(graph, deg);

  const btn =
    'flex h-9 w-9 items-center justify-center rounded-xl border border-slate-400/15 bg-ink-900/80 text-slate-300 backdrop-blur-xl transition-all hover:text-white hover:border-slate-300/30';
  const active = 'border-amber-400/50 bg-amber-400/15 text-amber-300';

  return (
    <div className="pointer-events-auto flex gap-1.5" data-testid="view-controls">
      {langMode === '2d' ? (
        <>
          <button
            data-testid="rotate-ccw"
            className={btn}
            title={t.rotateHint}
            aria-label={t.rotateHint}
            onClick={() => spin(-15)}
          >
            <RotateCcw size={15} />
          </button>
          <button
            data-testid="rotate-cw"
            className={btn}
            title={t.rotateHint}
            aria-label={t.rotateHint}
            onClick={() => spin(15)}
          >
            <RotateCw size={15} />
          </button>
          <button
            data-testid="rotate-auto"
            className={`${btn} ${autoRotate2d ? active : ''}`}
            title={t.autoRotate}
            aria-label={t.autoRotate}
            onClick={toggleAutoRotate2d}
          >
            <RefreshCw size={15} className={autoRotate2d ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
          </button>
        </>
      ) : (
        <button
          data-testid="orbit-toggle"
          className={`${btn} ${autoOrbit3d ? active : ''}`}
          title={t.orbit}
          aria-label={t.orbit}
          onClick={toggleAutoOrbit3d}
        >
          <Orbit size={15} className={autoOrbit3d ? 'animate-spin' : ''} style={{ animationDuration: '4s' }} />
        </button>
      )}
    </div>
  );
}
