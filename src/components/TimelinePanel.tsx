import { useEffect, useMemo, useState } from 'react';
import { X, LineChart, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { buildPairTimeline, polColor } from '../lib/timeline';
import { loadArchive, signalsByPair } from '../data/signals';
import type { NewsSignal } from '../types';
import { pairKey } from '../lib/graph';

const WINDOWS = [1, 3, 6, 12] as const;

/**
 * 시계열은 아카이브 전체가 필요하다. 첫 화면 번들에는 최근분만 들어 있으므로
 * 이 탭을 열었을 때 월별 파티션을 받아온다.
 */
function useArchivePairs(): { byPair: Map<string, NewsSignal[]>; loading: boolean } {
  const [all, setAll] = useState<NewsSignal[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadArchive().then((a) => {
      if (live) setAll(a);
    });
    return () => {
      live = false;
    };
  }, []);
  const byPair = useMemo(() => signalsByPair(all ?? []), [all]);
  return { byPair, loading: all === null };
}

export default function TimelinePanel() {
  const { t, locale } = useI18n();
  const { byPair, loading } = useArchivePairs();
  const graph = useStore((s) => s.graph);
  const watchIds = useStore((s) => s.watchIds);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const select = useStore((s) => s.select);
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(12);

  const nameOf = (id: string) => graph.find((g) => g.id === id)?.name[locale] ?? id;

  const pairs = useMemo(() => {
    const out: { a: string; b: string }[] = [];
    for (let i = 0; i < watchIds.length; i++) {
      for (let j = i + 1; j < watchIds.length; j++) {
        out.push({ a: watchIds[i], b: watchIds[j] });
      }
    }
    return out;
  }, [watchIds]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-1.5 flex items-center gap-1.5 font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
          <LineChart size={12} /> {t.watchTitle}
        </h3>
        <p className="mb-2 text-[11.5px] leading-snug text-slate-500">{t.watchHint}</p>

        {watchIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {watchIds.map((id) => (
              <span
                key={id}
                className="flex items-center gap-1 rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[12px] text-blue-100"
              >
                {nameOf(id)}
                <button
                  onClick={() => toggleWatch(id)}
                  className="text-blue-300/60 hover:text-white"
                  aria-label="remove"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-500/30 px-2.5 py-2 text-[12px] leading-relaxed text-slate-500">
            {t.noWatch}
          </p>
        )}
      </div>

      <div className="flex gap-1">
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWin(w)}
            className={`flex-1 rounded-lg py-1 font-mono text-[11.5px] transition-all ${
              win === w
                ? 'bg-white/[0.1] font-bold text-white'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
          >
            {w === 1 ? t.window1M : w === 3 ? t.window3M : w === 6 ? t.window6M : t.window1Y}
          </button>
        ))}
      </div>

      {pairs.length === 0 && watchIds.length > 0 && (
        <p className="text-[13px] text-slate-500">{t.watchNeedTwo}</p>
      )}

      {/* 카드가 없는 것과 아직 안 온 것은 다르다 */}
      {loading && pairs.length > 0 && (
        <p className="text-[13px] text-slate-500">{t.archiveLoading}</p>
      )}

      {pairs.map(({ a, b }) => (
        <PairTimelineCard
          key={pairKey(a, b)}
          a={a}
          b={b}
          nameA={nameOf(a)}
          nameB={nameOf(b)}
          win={win}
          byPair={byPair}
          onSelect={() => select(a)}
        />
      ))}
    </div>
  );
}

function PairTimelineCard({
  a,
  b,
  nameA,
  nameB,
  win,
  byPair,
  onSelect,
}: {
  a: string;
  b: string;
  nameA: string;
  nameB: string;
  win: number;
  byPair: Map<string, NewsSignal[]>;
  onSelect: () => void;
}) {
  const { t, L } = useI18n();
  const tl = useMemo(() => buildPairTimeline(a, b, win, byPair), [a, b, win, byPair]);

  if (!tl) return null;
  const recentFlips = [...tl.flips].reverse().slice(0, 2);

  return (
    <button
      onClick={onSelect}
      className="block w-full rounded-xl border border-slate-400/10 bg-white/[0.02] p-3 text-left transition-colors hover:border-slate-400/25 hover:bg-white/[0.04]"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="truncate text-[13px] font-semibold text-slate-200">
          {nameA} × {nameB}
        </span>
        <Sparkles size={10} className="ml-auto shrink-0 text-amber-400/70" />
      </div>

      <div className="flex gap-[2px]" data-testid="tl-strip">
        {tl.cells.map((c) => (
          <div
            key={c.ym}
            data-testid="tl-cell"
            title={`${c.ym} · ${c.polarity}${c.note ? `\n${L(c.note)}` : ''}`}
            className="h-5 flex-1 rounded-[3px] transition-transform hover:scale-y-125"
            style={{
              backgroundColor: polColor(c.polarity) + (c.curated ? '99' : 'e6'),
              boxShadow: c.flip ? `0 0 0 1.5px ${COLORS_WHITE}` : undefined,
            }}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[9.5px] uppercase tracking-wider text-slate-600">
        <span>{tl.cells[0]?.ym}</span>
        <span>{tl.cells[tl.cells.length - 1]?.ym}</span>
      </div>

      {recentFlips.map((f) => (
        <div
          key={f.ym}
          className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1"
        >
          <span className="mt-0.5 font-mono text-[10px] font-bold text-amber-300">
            {f.ym}
          </span>
          <span className="line-clamp-2 text-[11px] leading-snug text-amber-100/80">
            <span className="font-semibold">{t.turningPoint}: </span>
            {f.note ? L(f.note) : `${f.polarity}`}
          </span>
        </div>
      ))}
    </button>
  );
}

const COLORS_WHITE = 'rgba(255,255,255,0.85)';
