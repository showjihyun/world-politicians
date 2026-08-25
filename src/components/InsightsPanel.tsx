import { useMemo, useState } from 'react';
import { Flame, Share2, Landmark, TrendingUp, ChevronDown, Radio } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computeInsights } from '../lib/graph';
import { useI18n } from '../i18n';
import { LATEST_SIGNALS } from '../data/signals';
import { PARTY_LABEL } from '../lib/colors';

function wireDot(p?: string): string {
  return p === 'ally' ? '#34d399' : p === 'feud' ? '#fb7185' : '#94a3b8';
}

export default function InsightsPanel() {
  const { t, locale } = useI18n();
  const graph = useStore((s) => s.graph);
  const links = useStore((s) => s.links);
  const select = useStore((s) => s.select);

  const insights = useMemo(() => computeInsights(graph, links), [graph, links]);

  const feudTotal = links.filter((l) => l.rel.type === 'feud').length;
  const bridgeTotal = links.filter((l) => l.rel.type === 'bipartisan').length;

  const nameOf = (id: string) => graph.find((g) => g.id === id)?.name[locale] ?? id;

  return (
    <div className="space-y-3">
      {LATEST_SIGNALS.length > 0 && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
          <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            <Radio size={10} /> {t.wireTitle}
            <span className="ml-auto font-normal normal-case tracking-normal text-slate-600">
              {LATEST_SIGNALS.length}+
            </span>
          </h4>
          <div className="space-y-1">
            {LATEST_SIGNALS.map((s) =>
              s.pair ? (
                <button
                  key={s.id}
                  onClick={() => select(s.pair![0])}
                  className="group flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/5"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: wireDot(s.polarity) }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[10.5px] text-slate-300 group-hover:text-white">
                      {nameOf(s.pair[0])} × {nameOf(s.pair[1])}
                    </span>
                    <span className="font-mono text-[8px] uppercase tracking-wider text-slate-600">
                      {s.date} · {s.source}
                    </span>
                  </span>
                </button>
              ) : null
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <Stat label={t.statsTotal} value={graph.length} accent="text-white" />
        <Stat label={t.statsLinks} value={links.length} accent="text-emerald-300" />
        <Stat label={t.statsFeuds} value={feudTotal} accent="text-rose-300" />
        <Stat label={t.statsBridges} value={bridgeTotal} accent="text-amber-300" />
      </div>

      <RankList
        title={t.conflictHubs}
        desc={t.conflictHubsDesc}
        icon={<Flame size={11} className="text-rose-400" />}
        items={insights.conflictHubs.map((p) => ({
          id: p.id,
          name: p.name[locale],
          sub: PARTY_LABEL[p.party],
          value: p.feudCount,
          suffix: t.feudCount,
        }))}
        onSelect={select}
      />

      <RankList
        title={t.bridgeBuilders}
        desc={t.bridgeBuildersDesc}
        icon={<Landmark size={11} className="text-amber-400" />}
        items={insights.bridgeBuilders.map((p) => ({
          id: p.id,
          name: p.name[locale],
          sub: PARTY_LABEL[p.party],
          value: p.bridgeCount,
          suffix: t.bridgesCount,
        }))}
        onSelect={select}
      />

      <RankList
        title={t.connectHubs}
        desc={t.connectHubsDesc}
        icon={<Share2 size={11} className="text-emerald-400" />}
        items={insights.connectHubs.map((p) => ({
          id: p.id,
          name: p.name[locale],
          sub: PARTY_LABEL[p.party],
          value: p.degree,
          suffix: t.tiesCount,
        }))}
        onSelect={select}
      />

      <RankList
        title={t.buzzRanking}
        desc={t.buzzRankingDesc}
        icon={<TrendingUp size={11} className="text-cyan-400" />}
        items={insights.buzzRanking.map((p) => ({
          id: p.id,
          name: p.name[locale],
          sub: PARTY_LABEL[p.party],
          value: p.buzz,
          suffix: '',
        }))}
        onSelect={select}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-400/10 bg-white/[0.03] px-3 py-2">
      <div className={`font-mono text-lg font-bold leading-none ${accent}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[9.5px] leading-tight text-slate-500">{label}</div>
    </div>
  );
}

function RankList({
  title,
  desc,
  icon,
  items,
  onSelect,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  items: { id: string; name: string; sub: string; value: number; suffix: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-400/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
      >
        {icon}
        <span className="text-[11px] font-semibold text-slate-200">{title}</span>
        <ChevronDown
          size={12}
          className={`ml-auto text-slate-600 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <>
          <p className="px-3 pb-1 text-[9.5px] text-slate-500">{desc}</p>
          <ol className="pb-1.5">
            {items.map((it, i) => (
              <li key={it.id}>
                <button
                  onClick={() => onSelect(it.id)}
                  className="group flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-white/5"
                >
                  <span className="w-3.5 shrink-0 font-mono text-[9px] text-slate-600">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-[11px] text-slate-300 group-hover:text-white">
                    {it.name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[9.5px] text-amber-300/90">
                    {it.value}
                    {it.suffix && (
                      <span className="ml-0.5 text-[8.5px] text-slate-500">{it.suffix}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
