import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { X, MapPin, Zap, Crown, Briefcase, Gavel, Landmark, Newspaper, ExternalLink, Globe, BookOpen, AtSign, BookmarkPlus, BookmarkCheck, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { cosponsorCount } from '../data/cosponsorship';
import { FACTION_MAP } from '../data/factions';
import { SIGNALS_BY_PERSON, signalCountFor } from '../data/signals';
import { money, useFunding } from '../lib/funding';
import { useUnity } from '../lib/party-unity';
import { useLobbying } from '../lib/lobbying';
import { usePortrait } from '../lib/portrait';
import { siteUrlOf, xSearchUrl, newsSearchUrl } from '../lib/links';
import { PARTY_COLOR, PARTY_LABEL } from '../lib/colors';
import { REL_META, type Party, type RelType } from '../types';
import { pairKey, type GraphLink, type GraphNode } from '../lib/graph';

type RelRow = { link: GraphLink; other: GraphNode };

function polarityColor(p?: string): string {
  return p === 'ally' ? '#34d399' : p === 'feud' ? '#fb7185' : '#94a3b8';
}

const linkChip =
  'flex min-h-[26px] items-center gap-1 rounded-full border border-slate-400/15 bg-white/[0.04] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-slate-400 transition-colors hover:border-cyan-400/40 hover:text-cyan-200';

export default function DetailDrawer() {
  const { t, L, locale } = useI18n();
  const partyLabelOf = (party: Party) => L(PARTY_LABEL[party]);
  const graph = useStore((s) => s.graph);
  const links = useStore((s) => s.links);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const adjacency = useStore((s) => s.adjacency);
  const watchIds = useStore((s) => s.watchIds);
  const toggleWatch = useStore((s) => s.toggleWatch);
  const selectLink = useStore((s) => s.selectLink);
  const [imgFail, setImgFail] = useState(false);

  const person = selectedId ? graph.find((p) => p.id === selectedId) : null;
  const { funding, cycle: fundingCycle, through: fundingThrough } = useFunding(person?.id ?? null);
  const {
    unity,
    median: unityMedian,
    axisMax,
    congress,
    known: unityKnown,
    reason: unityReason,
  } = useUnity(person?.id ?? null);
  const { lobbying, years: lobbyYears } = useLobbying(person?.id ?? null);
  // 음수(환불)와 0 나눗셈을 여기서 한 번만 막는다
  const pct = (n: number) =>
    funding && funding.receipts > 0 ? Math.max(0, Math.min(100, (100 * n) / funding.receipts)) : 0;

  useEffect(() => setImgFail(false), [selectedId]);

  const portrait = usePortrait(person?.id ?? '', person?.enName ?? '');
  const isWatched = person ? watchIds.includes(person.id) : false;
  const site = person ? siteUrlOf(person) : undefined;

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
          data-graph-inset="right"
          className="pointer-events-auto absolute right-3 top-[72px] z-20 flex max-h-[calc(100vh-84px)] w-[min(92vw,392px)] flex-col overflow-hidden rounded-2xl border border-slate-400/15 bg-ink-900/92 shadow-2xl shadow-black/60 backdrop-blur-2xl"
        >
          <div
            className="h-1 w-full shrink-0"
            style={{ backgroundColor: PARTY_COLOR[person.party] }}
          />
          <div className="flex items-start gap-3 p-4 pb-3">
            {portrait.img && !imgFail ? (
              <img
                src={portrait.img}
                alt={L(person.name)}
                onError={() => setImgFail(true)}
                className="h-[88px] w-[88px] shrink-0 rounded-xl border border-slate-400/25 object-cover"
                style={{ boxShadow: `0 0 18px ${PARTY_COLOR[person.party]}33` }}
              />
            ) : (
              <Monogram name={person.enName} party={person.party} size={88} />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[18.5px] font-bold leading-snug text-white">
                {L(person.name)}
              </h2>
              <p className="mt-0.5 text-[14px] leading-snug text-slate-400">
                {L(person.role)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
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
              data-testid="track-btn"
              onClick={() => person && toggleWatch(person.id)}
              title={isWatched ? t.tracking : t.track}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                isWatched
                  ? 'bg-blue-500/25 text-blue-200'
                  : 'text-slate-500 hover:bg-white/10 hover:text-white'
              }`}
            >
              {isWatched ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
            </button>
            <button
              onClick={() => select(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t.close}
            >
              <X size={15} />
            </button>
          </div>

          {/* 헤더만 고정하고 나머지는 전부 스크롤 — 화면이 낮아도 아래가 잘리지 않는다 */}
          <div className="min-h-0 flex-1 overflow-y-auto polaris-scroll" data-testid="drawer-scroll">
          {person && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2.5" data-testid="profile-links">
              {site && (
                <a href={site} target="_blank" rel="noopener noreferrer" className={linkChip}>
                  <Globe size={10} /> {t.website}
                </a>
              )}
              {portrait.wikiUrl && (
                <a href={portrait.wikiUrl} target="_blank" rel="noopener noreferrer" className={linkChip}>
                  <BookOpen size={10} /> {t.wikipedia}
                </a>
              )}
              <a href={xSearchUrl(person.enName)} target="_blank" rel="noopener noreferrer" className={linkChip}>
                <AtSign size={10} /> {t.xPosts}
              </a>
              <a href={newsSearchUrl(person.enName)} target="_blank" rel="noopener noreferrer" className={linkChip}>
                <Newspaper size={10} /> {t.newsSearch}
              </a>
            </div>
          )}

          <div className="flex gap-1.5 px-4 pb-3">
            <Meter icon={<Zap size={10} />} label={t.buzzScore} value={person.buzz} color="#22d3ee" />
            <Meter
              icon={<Crown size={10} />}
              label={t.prominence}
              value={person.prominence * 10}
              color="#fbbf24"
            />
            <Meter
              icon={<span className="font-mono text-[10.5px]">Σ</span>}
              label={t.degree}
              value={(adjacency.get(person.id)?.size ?? 0) * 14}
              color="#34d399"
              text={`${adjacency.get(person.id)?.size ?? 0}`}
            />
          </div>

          <div className="mx-4 mb-3 rounded-xl border border-slate-400/10 bg-white/[0.03] p-3">
            <p className="text-[12.5px] leading-relaxed text-slate-300">{L(person.bio)}</p>
            {person.tags && person.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {person.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-slate-100/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-slate-400"
                  >
                    #{L(tag)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {unity && (
            <div
              data-testid="party-unity"
              className="mx-4 mb-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3"
            >
              <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-violet-300">
                <Gavel size={10} /> {t.unityTitle}
                <span className="ml-auto font-normal normal-case text-slate-600">
                  {t.unityCongress(congress)}
                </span>
              </h4>

              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="font-mono text-[15px] font-bold text-slate-200">
                  {unity.rate.toFixed(1)}%
                </span>
                <span className="text-[10.5px] text-slate-500">{t.unityRate}</span>
              </div>

              {/*
                분포가 심하게 쏠려 있다 — 중앙값 0.4%, 최대 28.5%. 0~100% 축에
                그리면 거의 모두가 빈 막대가 되고, 중앙값 눈금은 왼쪽 끝에 붙어
                보이지 않는다. 축은 관측 최대치에서 계산해 데이터가 내려보낸다 — 화면에
                박아 두면 데이터가 그 위로 올라간 날 상위 몇 명이 똑같이 가득 찬
                막대가 된다. 중앙값은 눈금 대신 글로 적는다.
              */}
              <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-slate-700/40">
                <span
                  className="block h-full bg-violet-400/80"
                  style={{ width: `${Math.min(100, (unity.rate / axisMax) * 100)}%` }}
                />
              </div>
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-slate-600">
                {unityMedian != null && (
                  <>
                    {t.unityMedian(`${unityMedian.toFixed(1)}%`)}
                    <span className="text-slate-700"> · </span>
                  </>
                )}
                {t.unityCounts(unity.against, unity.votes)}
              </p>

              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">{t.unityCaveat}</p>
            </div>
          )}

          {/*
            기록이 없는 사람에게 아무것도 안 그리면
            "아직 불러오는 중" 과 구분되지 않는다. 이유는 뭉개지 않는다 — 자리는
            있었는데 표결이 없던 사람에게 "현직이 아니다" 라고 적으면 거짓이 된다.
          */}
          {!unity && unityKnown && (
            <p
              data-testid="party-unity-none"
              className="mx-4 mb-3 rounded-xl border border-slate-400/10 bg-white/[0.02] px-3 py-2 text-[10.5px] leading-relaxed text-slate-600"
            >
              <span className="font-mono uppercase tracking-[0.16em] text-slate-500">{t.unityTitle}</span>{' '}
              — {t.unityNone(unityReason ?? 'notInCongress')}
            </p>
          )}
          {funding && funding.receipts > 0 && (
            <div className="mx-4 mb-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
              <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                <Landmark size={10} /> {t.fundingTitle}
                <span className="ml-auto font-normal normal-case text-slate-600">
                  {fundingCycle} · {fundingThrough}
                </span>
              </h4>

              <div className="mb-2 flex items-baseline gap-2">
                <span className="font-mono text-[15px] font-bold text-slate-200">
                  {money(funding.receipts)}
                </span>
                <span className="text-[10.5px] text-slate-500">{t.fundingReceipts}</span>
              </div>

              {/* 어디서 온 돈인지 — 이름 있는 기부자로 설명되는 부분은 일부다 */}
              {/*
                은퇴·사임한 인물은 받은 PAC 돈을 돌려주어 순액이 음수가 된다.
                실제 사실이지만 막대 폭으로는 그릴 수 없으므로 0 으로 눌러 둔다.
              */}
              <div className="mb-1 flex h-1.5 overflow-hidden rounded-full bg-slate-700/40">
                <span className="bg-slate-400/70" style={{ width: `${pct(funding.individual)}%` }} />
                <span className="bg-emerald-400/80" style={{ width: `${pct(funding.pacDirect)}%` }} />
              </div>
              <p className="mb-2.5 font-mono text-[10.5px] uppercase tracking-wider text-slate-600">
                {t.fundingIndividual} {Math.round(pct(funding.individual))}%
                {' · '}
                <span className={funding.pacDirect < 0 ? 'text-rose-400/70' : 'text-emerald-400/80'}>
                  {t.fundingPac}{' '}
                  {funding.pacDirect < 0
                    ? t.fundingRefunded(money(-funding.pacDirect))
                    : `${Math.round(pct(funding.pacDirect))}%`}
                </span>
              </p>

              {funding.topFunders.length > 0 && (
                <div className="space-y-1">
                  {funding.topFunders.slice(0, 5).map((f) => (
                    <div key={f.name} className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-300">
                        {f.org || f.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-slate-500">
                        {money(f.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 독립지출은 기부가 아니다. 특히 반대 지출을 후원으로 읽게 두면 안 된다 */}
              {(funding.ieSupport > 0 || funding.ieOppose > 0) && (
                <p className="mt-2 border-t border-emerald-400/15 pt-1.5 font-mono text-[10.5px] uppercase tracking-wider">
                  <span className="text-slate-600">{t.fundingOutside}</span>{' '}
                  {funding.ieSupport > 0 && (
                    <span className="text-sky-400/80">
                      {t.fundingFor} {money(funding.ieSupport)}
                    </span>
                  )}
                  {funding.ieSupport > 0 && funding.ieOppose > 0 && <span className="text-slate-700"> · </span>}
                  {funding.ieOppose > 0 && (
                    <span className="text-rose-400/80">
                      {t.fundingAgainst} {money(funding.ieOppose)}
                    </span>
                  )}
                </p>
              )}

              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">{t.fundingCaveat}</p>
            </div>
          )}
          {lobbying && lobbying.alumniCount > 0 && (
            <div className="mx-4 mb-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
              <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-amber-300">
                <Briefcase size={10} /> {t.lobbyTitle}
                <span className="ml-auto font-normal normal-case text-slate-600">
                  {lobbyYears[0]}–{lobbyYears[lobbyYears.length - 1]}
                </span>
              </h4>

              <p className="mb-2 text-[12px] leading-snug text-slate-300">
                {t.lobbyLede(lobbying.alumniCount)}
              </p>

              <div className="space-y-1.5">
                {lobbying.alumni.slice(0, 4).map((a) => (
                  <div key={`${a.name}-${a.firm}`} className="leading-snug">
                    <span className="text-[11.5px] text-slate-300">{a.name}</span>
                    <span className="ml-1.5 font-mono text-[10.5px] uppercase tracking-wider text-amber-400/70">
                      {a.firm}
                    </span>
                    <span className="block truncate text-[10.5px] text-slate-600">{a.role}</span>
                  </div>
                ))}
              </div>

              {lobbying.topClients.length > 0 && (
                <p className="mt-2 border-t border-amber-400/15 pt-1.5 text-[10.5px] leading-relaxed text-slate-600">
                  <span className="font-mono uppercase tracking-wider">{t.lobbyClients}</span>{' '}
                  {lobbying.topClients.slice(0, 3).map((c) => c.name).join(' · ')}
                </p>
              )}

              {/* 고객은 기업이다. 이걸 "이 의원을 로비한다" 로 읽게 두면 안 된다 */}
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">{t.lobbyCaveat}</p>
            </div>
          )}
          {(SIGNALS_BY_PERSON.get(person.id)?.length ?? 0) > 0 && (
            <div className="mx-4 mb-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
              <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                <Newspaper size={10} /> {t.wireTitle}
                <span className="ml-auto font-normal normal-case text-slate-600">
                  {signalCountFor(person.id)}
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
                    data-testid="wire-item"
                    data-polarity={s.classified ? (s.polarity ?? 'none') : 'unclassified'}
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: polarityColor(s.polarity) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[12px] leading-snug text-slate-300 group-hover:text-white">
                        {s.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-slate-600">
                        {s.date} · {s.source}
                        {/*
                          분류에 실패한 신호는 극성도 요약도 없다. 아무 표시 없이
                          내보내면 "판정이 없다" 가 아니라 "그냥 빈약한 항목" 으로
                          보인다. 근거 없는 엣지를 "근거 없음" 이라고 적는 것과 같다.
                        */}
                        {s.polarity === 'ally' || s.polarity === 'feud'
                          ? ` · ${L(REL_META[s.polarity].label)}`
                          : s.polarity === 'neutral'
                            ? ` · ${t.polNeutral}`
                            : ` · ${t.polUnclassified}`}
                        <ExternalLink size={7} className="opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      {locale === 'ko' ? s.summary_ko : s.summary_en}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 pb-4">
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
                  <h4 className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: meta.color }}>
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
                      // 같은 initiator 필드지만 뜻이 다르다. feud 는 먼저 공격한 쪽,
                      // 공동발의는 상대 법안에 더 많이 서명한 쪽이다. 상호적이면 비어 있다.
                      const initiatedHere = link.rel.initiator
                        ? (link.rel.initiator === 'a') === isA
                        : null;
                      const initiatorNote =
                        link.rel.type === 'feud' && initiatedHere
                          ? ` · ${t.initiatedBy}: ${L(person.name)}`
                          : '';
                      const leanNote =
                        link.rel.type === 'cosponsor' && initiatedHere !== null
                          ? initiatedHere
                            ? t.cosponsorLean(L(person.name), L(other.name))
                            : t.cosponsorLean(L(other.name), L(person.name))
                          : '';
                      return (
                        <div
                          key={pairKey(link.rel.a, link.rel.b)}
                          className="group flex items-start gap-1 rounded-lg border border-transparent pr-1 transition-all hover:border-slate-400/15 hover:bg-white/[0.04]"
                        >
                        <button
                          onClick={() => select(other.id)}
                          className="block min-w-0 flex-1 px-2.5 py-2 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: PARTY_COLOR[other.party] }}
                            />
                            <span className="truncate text-[13px] font-medium text-slate-200 group-hover:text-white">
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
                          <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500 group-hover:text-slate-400">
                            {L(link.rel.note)}
                            {initiatorNote && (
                              <span className="text-rose-400/80">{initiatorNote}</span>
                            )}
                          </p>
                          {/*
                            큐레이션한 관계에는 공동발의 엣지를 겹쳐 긋지 않는다.
                            대신 측정값이 그 관계를 뒷받침하면 건수만 조용히 붙인다.
                          */}
                          {leanNote && (
                            <p className="mt-1 font-mono text-[10.5px] tracking-wide text-sky-400/70">
                              {leanNote}
                            </p>
                          )}
                          {link.rel.type !== 'cosponsor' && cosponsorCount(link.rel.a, link.rel.b) > 0 && (
                            <p className="mt-1 font-mono text-[10.5px] tracking-wide text-sky-400/70">
                              {t.cosponsorCorroboration(cosponsorCount(link.rel.a, link.rel.b))}
                            </p>
                          )}
                        </button>
                        {/* 이 관계를 왜 그렇게 봤는지 — 이동하지 않고 근거만 연다 */}
                        <button
                          data-testid="row-evidence"
                          onClick={() => selectLink(link.id)}
                          title={t.sourcesLabel}
                          aria-label={t.sourcesLabel}
                          className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-white/10 hover:text-cyan-300"
                        >
                          <FileText size={11} />
                        </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
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
      <div className="flex items-center gap-1 text-[10.5px] text-slate-500">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }}
        />
      </div>
      {text && <div className="mt-0.5 font-mono text-[10.5px] text-slate-300">{text}</div>}
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
