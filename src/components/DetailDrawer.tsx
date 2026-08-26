import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { X, MapPin, Zap, Crown, Newspaper, ExternalLink } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { FACTION_MAP } from '../data/factions';
import { SIGNALS_BY_PERSON } from '../data/signals';
import { PARTY_COLOR, PARTY_LABEL } from '../lib/colors';
import { REL_META, type Party, type RelType } from '../types';
import { pairKey, type GraphLink, type GraphNode } from '../lib/graph';

type RelRow = { link: GraphLink; other: GraphNode };

function polarityColor(p?: string): string {
  return p === 'ally' ? '#34d399' : p === 'feud' ? '#fb7185' : '#94a3b8';
}

export default function DetailDrawer() {
  const { t, L, locale } = useI18n();
  const partyLabelOf = (party: Party) => L(PARTY_LABEL[party]);
  const graph = useStore((s) => s.graph);
  const links = useStore((s) => s.links);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const adjacency = useStore((s) => s.adjacency);

  const person = selectedId ? graph.find((p) => p.id === selectedId) : null;

  const relRows = useMemo<RelRow[]>(() => {
    if (!person) return [];
    return links
      .filter((l) => l.rel.a === person.id || l.rel.b === person.id)
      .map((l) => {
        const otherId = l.rel.a === person.id ? l.rel.b : l.rel.a;
        const other = graph.find((g) => g.id === otherId)!;
        return { link: l, other };
      })
      .sort((a, b) => a.other.degree - b.other.degree)
      .reverse();
  }, [person, links, graph]);

  const grouped = useMemo(() => {
    const g: Partial<Record<RelType, RelRow[]>> = {};
    for (const row of relRows) {
      if (!g[row.link.rel.type]) g[row.link.rel.type] = [];
      g[row.link.rel.type]!.push(row);
    }
    return g;
  }, [relRows]);

  return (
    <AnimatePresence>
      {person && (
        <motion.aside
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto absolute right-3 top-3 z-20 flex max-h-[calc(100vh-24px)] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-slate-400/15 bg-ink-900/92 shadow-2xl shadow-black/60 backdrop-blur-2xl"
        >
          <div
            className="h-1 w-full shrink-0"
            style={{ backgroundColor: PARTY_COLOR[person.party] }}
          />
          <div className="flex items-start gap-3 p-4 pb-3">
            <Monogram name={person.enName} party={person.party} size={46} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold leading-snug text-white">
                {L(person.name)}
              </h2>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{L(person.role)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px] text-slate-500">
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{
                    color: PARTY_COLOR[person.party],
                    backgroundColor: PARTY_COLOR[person.party] + '1c',
                  }}
                >
                  {partyLabelOf(person.party)}
                </span>
                {person.state && (
                  <span className="flex items-center gap-0.5">
                    <MapPin size={8} /> {person.state}
                  </span>
                )}
                {FACTION_MAP[person.faction] && (
                  <span className="flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: FACTION_MAP[person.faction].color }}
                    />
                    {L(FACTION_MAP[person.faction].label)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => select(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t.close}
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex gap-1.5 px-4 pb-3">
            <Meter icon={<Zap size={10} />} label={t.buzzScore} value={person.buzz} color="#22d3ee" />
            <Meter
              icon={<Crown size={10} />}
              label={t.prominence}
              value={person.prominence * 10}
              color="#fbbf24"
            />
            <Meter
              icon={<span className="font-mono text-[8px]">Σ</span>}
              label={t.degree}
              value={(adjacency.get(person.id)?.size ?? 0) * 14}
              color="#34d399"
              text={`${adjacency.get(person.id)?.size ?? 0}`}
            />
          </div>

          <div className="mx-4 mb-3 rounded-xl border border-slate-400/10 bg-white/[0.03] p-3">
            <p className="text-[11px] leading-relaxed text-slate-300">{L(person.bio)}</p>
            {person.tags && person.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {person.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-slate-100/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-slate-400"
                  >
                    #{L(tag)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {(SIGNALS_BY_PERSON.get(person.id)?.length ?? 0) > 0 && (
            <div className="mx-4 mb-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
              <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                <Newspaper size={10} /> {t.wireTitle}
                <span className="ml-auto font-normal normal-case text-slate-600">
                  {SIGNALS_BY_PERSON.get(person.id)!.length}
                </span>
              </h4>
              <div className="space-y-1.5">
                {SIGNALS_BY_PERSON.get(person.id)!.slice(0, 4).map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-white/5"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: polarityColor(s.polarity) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[10.5px] leading-snug text-slate-300 group-hover:text-white">
                        {s.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-slate-600">
                        {s.date} · {s.source}
                        {s.polarity === 'ally' || s.polarity === 'feud'
                          ? ` · ${L(REL_META[s.polarity].label)}`
                          : s.polarity === 'neutral'
                            ? ` · ${t.polNeutral}`
                            : ''}
                        <ExternalLink size={7} className="opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      {locale === 'ko' ? s.summary_ko : s.summary_en}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 polaris-scroll">
            {(['feud', 'ally', 'bipartisan', 'family', 'mentor'] as RelType[]).map((type) => {
              const rows = grouped[type];
              if (!rows?.length) return null;
              const meta = REL_META[type];
              const sectionTitle =
                type === 'feud'
                  ? t.detailRivals
                  : type === 'ally'
                    ? t.detailAllies
                    : type === 'bipartisan'
                      ? t.detailBipartisan
                      : type === 'family'
                        ? t.detailFamily
                        : t.detailMentor;
              return (
                <div key={type} className="mb-3">
                  <h4 className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: meta.color }}>
                    <svg width="16" height="4">
                      <line x1="0" y1="2" x2="16" y2="2" stroke={meta.color} strokeWidth="2" strokeDasharray={meta.dash?.join(',')} />
                    </svg>
                    {sectionTitle}
                    <span className="font-normal normal-case tracking-normal text-slate-600">
                      {rows.length}
                    </span>
                  </h4>
                  <div className="space-y-1">
                    {rows.map(({ link, other }) => {
                      const isA = link.rel.a === person.id;
                      const initiatorNote =
                        link.rel.type === 'feud' && link.rel.initiator
                          ? (link.rel.initiator === 'a') === isA
                            ? ` · ${t.initiatedBy}: ${L(person.name)}`
                            : ''
                          : '';
                      return (
                        <button
                          key={pairKey(link.rel.a, link.rel.b)}
                          onClick={() => select(other.id)}
                          className="group block w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-all hover:border-slate-400/15 hover:bg-white/[0.04]"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: PARTY_COLOR[other.party] }}
                            />
                            <span className="truncate text-[11.5px] font-medium text-slate-200 group-hover:text-white">
                              {L(other.name)}
                            </span>
                            <span className="ml-auto flex shrink-0 items-center gap-0.5">
                              {[1, 2, 3].map((s) => (
                                <span
                                  key={s}
                                  className="h-1 rounded-full transition-colors"
                                  style={{
                                    width: s === 1 ? 5 : s === 2 ? 7 : 9,
                                    backgroundColor:
                                      s <= link.rel.strength ? meta.color : 'rgba(148,163,184,0.2)',
                                  }}
                                />
                              ))}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500 group-hover:text-slate-400">
                            {L(link.rel.note)}
                            {initiatorNote && (
                              <span className="text-rose-400/80">{initiatorNote}</span>
                            )}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function Meter({
  icon,
  label,
  value,
  color,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  text?: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-slate-400/10 bg-white/[0.03] px-2 py-1.5">
      <div className="flex items-center gap-1 text-[8.5px] text-slate-500">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
        />
      </div>
      {text && <div className="mt-0.5 font-mono text-[9px] text-slate-300">{text}</div>}
    </div>
  );
}

function Monogram({
  name,
  party,
  size = 40,
}: {
  name: string;
  party: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-mono font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        color: PARTY_COLOR[party as keyof typeof PARTY_COLOR],
        background: `linear-gradient(135deg, ${PARTY_COLOR[party as keyof typeof PARTY_COLOR]}30, ${PARTY_COLOR[party as keyof typeof PARTY_COLOR]}0d)`,
        border: `1.5px solid ${PARTY_COLOR[party as keyof typeof PARTY_COLOR]}55`,
      }}
    >
      {initials}
    </div>
  );
}
