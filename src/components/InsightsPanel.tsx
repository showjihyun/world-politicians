import { useMemo, useState } from 'react';
import { Flame, Share2, Landmark, TrendingUp, ChevronDown, Radio, PieChart } from 'lucide-react';
import { useStore } from '../store/useStore';
import { computeInsights } from '../lib/graph';
import { useI18n } from '../i18n';
import { LATEST_SIGNALS, SIGNALS_META } from '../data/signals';
import { PARTY_LABEL } from '../lib/colors';
import type { Party } from '../types';

function wireDot(p?: string): string {
  return p === 'ally' ? '#34d399' : p === 'feud' ? '#fb7185' : '#94a3b8';
}

export default function InsightsPanel() {
  const { t, L, locale } = useI18n();
  const graph = useStore((s) => s.graph);
  const links = useStore((s) => s.links);
  const select = useStore((s) => s.select);

  const insights = useMemo(() => computeInsights(graph, links), [graph, links]);

  const feudTotal = links.filter((l) => l.rel.type === 'feud').length;
  const bridgeTotal = links.filter((l) => l.rel.type === 'bipartisan').length;

  const nameOf = (id: string) => graph.find((g) => g.id === id)?.name[locale] ?? id;
  const partyLabelOf = (party: Party) => L(PARTY_LABEL[party]);

  return (
    <div className="space-y-3">
      {LATEST_SIGNALS.length > 0 && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
          <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-cyan-300">
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
                    <span className="block truncate text-[12px] text-slate-300 group-hover:text-white">
                      {nameOf(s.pair[0])} × {nameOf(s.pair[1])}
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-slate-600">
                      {s.date} · {s.source}
                    </span>
                  </span>
                </button>
              ) : null
            )}
          </div>
        </div>
      )}

      <SourceMix />

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
          sub: partyLabelOf(p.party),
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
          sub: partyLabelOf(p.party),
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
          sub: partyLabelOf(p.party),
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
          sub: partyLabelOf(p.party),
          value: p.buzz,
          suffix: '',
        }))}
        onSelect={select}
      />
    </div>
  );
}

/** 이름을 붙여 세는 상위 매체 수. 나머지는 접어서 한 줄로 묶는다 */
const MIX_TOP = 5;
/**
 * 단색 농도 램프. 매체마다 다른 색을 주면 색이 분류처럼 읽혀서
 * "이 매체는 이런 성향" 이라는 뜻이 없는데 있는 것처럼 보인다.
 */
const MIX_COLORS = [
  'rgba(34,211,238,0.92)',
  'rgba(34,211,238,0.72)',
  'rgba(34,211,238,0.54)',
  'rgba(34,211,238,0.4)',
  'rgba(34,211,238,0.28)',
];
const MIX_REST = 'rgba(148,163,184,0.3)';

/** 0% 로 반올림되는 매체를 "없음" 으로 보이게 하지 않는다 */
function sharePct(n: number, total: number): string {
  if (!total) return '0%';
  const v = (n / total) * 100;
  return v > 0 && v < 1 ? '<1%' : `${Math.round(v)}%`;
}

/**
 * 이 아카이브가 무엇으로 만들어졌는지.
 *
 * 수치는 전부 여기서 센다 — 문장에 숫자를 박으면 데이터가 바뀔 때 조용히 낡는다.
 * 건수는 `SIGNALS_META.count`(아카이브 전체)이지 `SIGNALS.length`(첫 화면 몫)가 아니다.
 * 매체명은 정규화 중이라 키를 하드코딩하지 않고 매니페스트가 준 대로 쓴다.
 */
function SourceMix() {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const mix = useMemo(() => {
    const entries = Object.entries(SIGNALS_META.outlets)
      .filter(([name, n]) => name.length > 0 && n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    const rest = entries.slice(MIX_TOP);
    const restTotal = rest.reduce((sum, [, n]) => sum + n, 0);
    return {
      entries,
      total,
      top: entries.slice(0, MIX_TOP),
      rest,
      restTotal,
      topShare: total ? Math.round(((total - restTotal) / total) * 100) : 0,
    };
  }, []);

  // 매니페스트에 매체 구성이 없으면 블록을 아예 내지 않는다 — 빈 막대는 거짓말이 된다
  if (mix.entries.length === 0 || mix.total === 0) return null;

  return (
    <div
      data-testid="source-mix"
      className="overflow-hidden rounded-xl border border-slate-400/10 bg-white/[0.02]"
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5"
      >
        <PieChart size={11} className="text-cyan-400" aria-hidden />
        <span className="text-[12.5px] font-semibold text-slate-200">{t.srcMixTitle}</span>
        <ChevronDown
          size={12}
          className={`ml-auto text-slate-600 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-2.5">
          <div className="flex h-2 gap-px overflow-hidden rounded-full bg-white/5">
            {mix.top.map(([name, n], i) => (
              <span
                key={name}
                title={`${name} · ${n}`}
                style={{
                  width: `${(n / mix.total) * 100}%`,
                  backgroundColor: MIX_COLORS[i % MIX_COLORS.length],
                }}
              />
            ))}
            {mix.restTotal > 0 && (
              <span
                title={`${t.srcMixOthers(mix.rest.length)} · ${mix.restTotal}`}
                style={{
                  width: `${(mix.restTotal / mix.total) * 100}%`,
                  backgroundColor: MIX_REST,
                }}
              />
            )}
          </div>

          <p
            data-testid="source-mix-lede"
            className="mt-1.5 text-[11.5px] leading-snug text-slate-500"
          >
            {/*
              막대와 비율은 전부 mix.total 로 나눈다. 여기서만 stats.total 을 쓰면
              분모가 둘이 되어, 매니페스트가 어긋난 순간 "302건" 위에 295건의 100%가
              그려진다. 감사가 그 어긋남을 막지만 감사는 CI 에서만 돈다 — 화면이
              스스로 일관되게 둔다.
            */}
            {t.srcMixLede(mix.total, mix.entries.length)}
          </p>

          <ul className="mt-2 space-y-0.5">
            {mix.top.map(([name, n], i) => (
              <OutletRow
                key={name}
                name={name}
                count={n}
                total={mix.total}
                color={MIX_COLORS[i % MIX_COLORS.length]}
              />
            ))}
            {expanded &&
              mix.rest.map(([name, n]) => (
                <OutletRow key={name} name={name} count={n} total={mix.total} color={MIX_REST} />
              ))}
          </ul>

          {mix.rest.length > 0 && (
            <button
              data-testid="source-mix-more"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-[11.5px] text-slate-500 transition-colors hover:text-slate-300"
            >
              <ChevronDown
                size={11}
                className={`shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
              />
              {/* 펼친 뒤에도 "그 외 12곳" 이면, 17줄을 보면서 12곳이 더 숨어 있다고 읽는다.
                  11px 셰브론 회전만으로는 상태가 전달되지 않는다 */}
              {expanded ? t.srcMixFewer : t.srcMixOthers(mix.rest.length)}
              {!expanded && (
                <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-600">
                  {mix.restTotal} · {sharePct(mix.restTotal, mix.total)}
                </span>
              )}
            </button>
          )}

          <p className="mt-1.5 border-t border-slate-400/10 pt-1.5 text-[11.5px] leading-snug text-slate-500">
            {t.srcMixCaveat(mix.top.length, mix.topShare)}
          </p>
        </div>
      )}
    </div>
  );
}

function OutletRow({
  name,
  count,
  total,
  color,
}: {
  name: string;
  count: number;
  total: number;
  color: string;
}) {
  return (
    <li data-testid="source-mix-row" className="flex items-center gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      {/* 매체명이 길다(정규화 전에는 문장에 가깝다). 잘라 보이고 전체는 title 에 남긴다 */}
      <span className="truncate text-[12px] text-slate-300" title={name}>
        {name}
      </span>
      <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-500">{count}</span>
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-cyan-300/80">
        {sharePct(count, total)}
      </span>
    </li>
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
      <div className={`font-mono text-[19.5px] font-bold leading-none ${accent}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[11px] leading-tight text-slate-500">{label}</div>
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
        <span className="text-[12.5px] font-semibold text-slate-200">{title}</span>
        <ChevronDown
          size={12}
          className={`ml-auto text-slate-600 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <>
          <p className="px-3 pb-1 text-[11px] text-slate-500">{desc}</p>
          <ol className="pb-1.5">
            {items.map((it, i) => (
              <li key={it.id}>
                <button
                  onClick={() => onSelect(it.id)}
                  className="group flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-white/5"
                >
                  <span className="w-3.5 shrink-0 font-mono text-[10.5px] text-slate-600">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-[12.5px] text-slate-300 group-hover:text-white">
                    {it.name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-amber-300/90">
                    {it.value}
                    {it.suffix && (
                      <span className="ml-0.5 text-[10.5px] text-slate-500">{it.suffix}</span>
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
