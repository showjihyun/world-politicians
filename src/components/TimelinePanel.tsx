import { useEffect, useMemo, useState } from 'react';
import { X, LineChart, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { buildPairTimeline, polColor } from '../lib/timeline';
import type { Pol } from '../lib/timeline';
import { loadArchive, signalsByPair } from '../data/signals';
import { REL_META, type NewsSignal } from '../types';
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

  // 극성을 문자열 그대로 쓰면 한국어 화면에 `feud` 가 그대로 나간다. 옆의 라벨은
  // 번역해 두고 이것만 원값이면 내부 enum 이 새는 것이다 — 엔티티가 화면에
  // 그대로 나갔던 것과 같은 종류다
  const polLabel = (p: Pol): string => (p === 'neutral' ? t.polNeutral : L(REL_META[p].label));

  if (!tl) return null;
  const recentFlips = [...tl.flips].reverse().slice(0, 2);
  const hasContested = tl.cells.some((c) => c.contested);

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
            data-contested={c.contested ? 'true' : 'false'}
            // 미판정 건수를 적는다. 아무 표시 없이 회색으로 내보내면 "판정이 없다" 가
            // 아니라 "그냥 한산한 달" 로 읽힌다 — 근거 없는 엣지를 "근거 없음" 이라고
            // 적는 것과 같은 이유다
            title={`${c.ym} · ${polLabel(c.polarity)}${c.contested ? ` · ${t.tlContested}` : ''}${
              c.unclassified ? ` · ${c.unclassified} ${t.polUnclassified}` : ''
            }${c.note ? `\n${L(c.note)}` : ''}`}
            className="h-5 flex-1 rounded-[3px] transition-transform hover:scale-y-125"
            style={{
              // 색은 극성 그대로다. 불일치는 그 위에 얹는 부가 정보라 빗금으로 표시하고,
              // flip(흰 테두리)과 겹쳐도 서로 구분된다 — 둘은 뜻이 다르다
              backgroundColor: polColor(c.polarity) + (c.curated ? '99' : 'e6'),
              backgroundImage: c.contested ? CONTESTED_HATCH : undefined,
              boxShadow: c.flip ? `0 0 0 1.5px ${COLORS_WHITE}` : undefined,
            }}
          />
        ))}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10.5px] uppercase tracking-wider text-slate-600">
        <span>{tl.cells[0]?.ym}</span>
        <span>{tl.cells[tl.cells.length - 1]?.ym}</span>
      </div>

      {/* 빗금이 있는 카드에만 범례를 붙인다. 설명 없는 무늬는 노이즈로 읽힌다.
          카드마다 반복되므로 한 줄로 두고 규칙 전문은 툴팁에 남긴다 */}
      {hasContested && (
        <span
          data-testid="tl-contested-hint"
          title={t.tlContestedHint}
          className="mt-1 flex items-center gap-1.5 text-[11px] leading-snug text-slate-500"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-[2px]"
            style={{ backgroundColor: '#64748be6', backgroundImage: CONTESTED_HATCH }}
          />
          <span className="truncate">{t.tlContested}</span>
        </span>
      )}

      {recentFlips.map((f) => (
        <div
          key={f.ym}
          className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1"
        >
          <span className="mt-0.5 font-mono text-[10.5px] font-bold text-amber-300">
            {f.ym}
          </span>
          <span className="line-clamp-2 text-[11px] leading-snug text-amber-100/80">
            <span className="font-semibold">{t.turningPoint}: </span>
            {/* 노트 없는 달이 생길 수 있다 — 동률로 중립이 됐거나 이전 달을 물려받은
                달이다. 예전에는 여기에 `neutral` 이라는 원값이 그대로 나갔다 */}
            {f.note ? L(f.note) : polLabel(f.polarity)}
          </span>
        </div>
      ))}
    </button>
  );
}

const COLORS_WHITE = 'rgba(255,255,255,0.85)';
/** 판정 불일치 표시. 색조를 건드리지 않고 무늬만 얹는다 */
const CONTESTED_HATCH =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0 1.5px, rgba(255,255,255,0) 1.5px 4.5px)';
