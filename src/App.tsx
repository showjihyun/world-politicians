import { Suspense, lazy, useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import FilterPanel from './components/FilterPanel';
import InsightsPanel from './components/InsightsPanel';
import TimelinePanel from './components/TimelinePanel';
import GraphView2D from './components/GraphView2D';
import DetailDrawer from './components/DetailDrawer';
import LinkPopover from './components/LinkPopover';
import { StoryDock, StoryOverlay } from './components/StoryDock';
import { useStore } from './store/useStore';
import { useUIStore } from './store/uiStore';
import { useI18n } from './i18n';
import { SIGNALS_META } from './data/signals';

const GraphView3D = lazy(() => import('./components/GraphView3D'));

export default function App() {
  const { t, locale } = useI18n();
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const storyIndex = useStore((s) => s.storyIndex);
  const select = useStore((s) => s.select);
  const langMode = useUIStore((s) => s.langMode);
  const [tab, setTab] = useState<'filters' | 'insights' | 'analysis'>('filters');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  const dockHidden = storyIndex != null;
  const wireTime = SIGNALS_META.generatedAt
    ? new Date(SIGNALS_META.generatedAt).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-ink-950 text-slate-100">
      <div className="polaris-backdrop absolute inset-0" />
      <div className="polaris-vignette absolute inset-0" />

      <Suspense fallback={<GraphLoader />}>
        {langMode === '3d' ? <GraphView3D /> : <GraphView2D />}
      </Suspense>

      <TopBar />

      <aside
        className={`absolute bottom-3 left-3 top-[72px] z-20 w-[324px] max-w-[calc(100vw-24px)] transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-400/15 bg-ink-900/85 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="flex shrink-0 gap-1 border-b border-slate-400/10 p-1.5">
            {(['filters', 'insights', 'analysis'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-all ${
                  tab === key
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {key === 'filters' ? t.tabFilters : key === 'insights' ? t.tabInsights : t.tabTimeline}
              </button>
            ))}
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-7 rounded-lg text-slate-600 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 polaris-scroll">
            {tab === 'filters' ? <FilterPanel /> : tab === 'insights' ? <InsightsPanel /> : <TimelinePanel />}
          </div>
        </div>
      </aside>

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="absolute left-3 top-[76px] z-20 rounded-lg border border-slate-400/15 bg-ink-900/80 px-2.5 py-1.5 font-mono text-[11.5px] tracking-wider text-slate-400 backdrop-blur-xl transition-colors hover:text-white"
        >
          ◧ PANEL
        </button>
      )}

      <DetailDrawer />
      <StoryOverlay />

      <div style={{ display: dockHidden ? 'none' : 'contents' }}>
        <StoryDock />
        <LinkPopover />
      </div>

      <footer
        className={`pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-slate-700 transition-opacity duration-500 ${
          dockHidden ? 'opacity-0' : 'opacity-100'
        }`}
        data-testid="data-footer"
      >
        {t.rotateGesture} · {t.dataNote} · {t.wireTitle}: {wireTime ?? '—'} ({SIGNALS_META.count})
      </footer>
    </div>
  );
}

function GraphLoader() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="font-mono text-[11.5px] tracking-[0.3em] text-slate-600">
        LOADING NEURAL VIEW…
      </span>
    </div>
  );
}
