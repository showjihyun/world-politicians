import { Suspense, lazy, useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import FilterPanel from './components/FilterPanel';
import InsightsPanel from './components/InsightsPanel';
import TimelinePanel from './components/TimelinePanel';
import StoriesPanel from './components/StoriesPanel';
import GraphLegend from './components/GraphLegend';
import DataFreshness from './components/DataFreshness';
import GraphView2D from './components/GraphView2D';
import DetailDrawer from './components/DetailDrawer';
import LinkPopover from './components/LinkPopover';
import { StoryOverlay } from './components/StoryDock';
import { useStore } from './store/useStore';
import { useUIStore } from './store/uiStore';
import { useI18n } from './i18n';

const GraphView3D = lazy(() => import('./components/GraphView3D'));

export default function App() {
  const { t } = useI18n();
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const storyIndex = useStore((s) => s.storyIndex);
  const select = useStore((s) => s.select);
  const langMode = useUIStore((s) => s.langMode);
  const graph = useStore((s) => s.graph);
  const selectedId = useStore((s) => s.selectedId);
  const [tab, setTab] = useState<'filters' | 'insights' | 'analysis' | 'stories'>('filters');

  // 첫 진입 시 관계가 가장 많은 인물을 자동 선택 — 빈 화면 대신 바로 읽을 거리를 준다.
  // 이 시점엔 노드 좌표가 아직 없어서 GraphView 의 카메라 이동 이펙트는 no-op 이고,
  // 레이아웃이 끝난 뒤 zoomToFit 이 평소대로 전체를 잡는다.
  useEffect(() => {
    let top: (typeof graph)[number] | null = null;
    for (const n of graph) {
      if (n.degree > 0 && (!top || n.degree > top.degree)) top = n;
    }
    if (top) select(top.id);
    // 최초 1회만 — 이후 사용자의 선택을 덮어쓰지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  const dockHidden = storyIndex != null;

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
            {(['filters', 'insights', 'analysis', 'stories'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`min-w-0 flex-1 truncate rounded-lg px-0.5 py-1.5 text-[11px] font-medium transition-all ${
                  tab === key
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {key === 'filters'
                  ? t.tabFilters
                  : key === 'insights'
                    ? t.tabInsights
                    : key === 'analysis'
                      ? t.tabTimeline
                      : t.tabStories}
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
            {tab === 'filters' ? (
              <FilterPanel />
            ) : tab === 'insights' ? (
              <InsightsPanel />
            ) : tab === 'analysis' ? (
              <TimelinePanel />
            ) : (
              <StoriesPanel />
            )}
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

      {/* 데이터 신선도 — 첫 화면부터 프로필이 열려 있으므로 드로어를 피해 왼쪽으로 비킨다 */}
      <div
        className={`absolute bottom-3 z-10 transition-all duration-300 ${
          selectedId ? 'right-[416px]' : 'right-3'
        }`}
      >
        <DataFreshness />
      </div>

      {/* 범례 겸 관계 필터 — 그래프 좌측 하단 */}
      <div
        className={`absolute bottom-3 z-20 transition-all duration-300 ${
          sidebarOpen ? 'left-[349px]' : 'left-3'
        }`}
      >
        <GraphLegend />
      </div>

      <div style={{ display: dockHidden ? 'none' : 'contents' }}>
        <LinkPopover />
      </div>

      <footer
        className={`pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-slate-700 transition-opacity duration-500 ${
          dockHidden ? 'opacity-0' : 'opacity-100'
        }`}
        data-testid="data-footer"
      >
        {t.rotateGesture} · {t.dataNote}
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
