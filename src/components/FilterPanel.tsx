import { RotateCcw, Filter } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { FACTIONS, FACTION_MAP } from '../data/factions';
import { PARTY_COLOR, PARTY_LABEL } from '../lib/colors';
import { ALL_REL_TYPES, BRANCH_META, type Branch, type Party } from '../types';

const PARTIES: Party[] = ['R', 'D', 'I', 'X'];
const BRANCHES: Branch[] = ['executive', 'senate', 'house', 'governor', 'former', 'special'];

export default function FilterPanel() {
  const { t, L } = useI18n();
  const filters = useStore((s) => s.filters);
  const toggleFilterItem = useStore((s) => s.toggleFilterItem);
  const setStrongOnly = useStore((s) => s.setStrongOnly);
  const resetFilters = useStore((s) => s.resetFilters);

  const hasAny =
    filters.parties.length ||
    filters.branches.length ||
    filters.factions.length ||
    filters.relTypes.length !== ALL_REL_TYPES.length ||
    filters.strongOnly;

  return (
    <div className="space-y-5">
      <Section title={t.filters} icon={<Filter size={12} />}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11.5px] uppercase tracking-wider text-slate-500">{t.party}</span>
          {hasAny ? (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-[11.5px] text-slate-500 transition-colors hover:text-amber-300"
            >
              <RotateCcw size={9} /> {t.resetFilters}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PARTIES.map((p) => {
            const active = filters.parties.includes(p);
            return (
              <Chip
                key={p}
                active={active}
                color={PARTY_COLOR[p]}
                onClick={() => toggleFilterItem('parties', p)}
              >
                {L(PARTY_LABEL[p])}
              </Chip>
            );
          })}
        </div>

        <div className="mb-1.5 mt-4 text-[11.5px] uppercase tracking-wider text-slate-500">
          {t.branch}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BRANCHES.map((b) => {
            const active = filters.branches.includes(b);
            return (
              <Chip
                key={b}
                active={active}
                onClick={() => toggleFilterItem('branches', b)}
              >
                {L(BRANCH_META[b].label)}
              </Chip>
            );
          })}
        </div>

        <div className="mb-1.5 mt-4 text-[11.5px] uppercase tracking-wider text-slate-500">
          {t.faction}
        </div>
        <div className="flex flex-col gap-1">
          {FACTIONS.map((f) => {
            const active = filters.factions.includes(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggleFilterItem('factions', f.id)}
                title={L(f.desc)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-all ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: f.color }}
                />
                <span>{L(f.label)}</span>
                <span className="ml-auto font-mono text-[10.5px] text-slate-600">{f.short}</span>
              </button>
            );
          })}
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-400 hover:text-slate-200">
          <input
            type="checkbox"
            checked={filters.strongOnly}
            onChange={(e) => setStrongOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-amber-400"
          />
          {t.strongOnly}
        </label>
      </Section>

    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={
        active && color
          ? { borderColor: color + '88', backgroundColor: color + '22', color }
          : undefined
      }
      className={`rounded-full border px-2.5 py-1 text-[12px] transition-all ${
        active
          ? color
            ? ''
            : 'border-blue-400/50 bg-blue-400/15 text-blue-200'
          : 'border-slate-500/25 bg-transparent text-slate-400 hover:border-slate-400/40 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

export function FactionDot({ factionId }: { factionId: string }) {
  const f = FACTION_MAP[factionId];
  if (!f) return null;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: f.color }}
      title={f.label.en}
    />
  );
}
