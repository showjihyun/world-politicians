import { PARTY_COLOR, PARTY_LABEL } from '../lib/colors';
import { FACTION_MAP } from '../data/factions';
import { useI18n } from '../i18n';
import type { GraphNode } from '../lib/graph';

export default function NodeTooltip({
  node,
  x,
  y,
}: {
  node: GraphNode | null;
  x: number;
  y: number;
}) {
  const { t, L } = useI18n();
  if (!node) return null;

  const flipX = x > window.innerWidth - 260;
  const flipY = y > window.innerHeight - 170;
  const faction = FACTION_MAP[node.faction];

  return (
    <div
      className="pointer-events-none absolute z-40 w-60 rounded-xl border border-slate-400/20 bg-ink-900/95 p-3 shadow-2xl shadow-black/70 backdrop-blur-xl"
      style={{
        left: flipX ? x - 250 : x + 16,
        top: flipY ? y - 150 : y + 14,
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: PARTY_COLOR[node.party] }}
        />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-bold leading-tight text-white">
            {L(node.name)}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-slate-400">
            {L(node.role)}
          </div>
        </div>
      </div>

      {faction && (
        <div className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-500">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: faction.color }}
          />
          {L(faction.label)}
          <span className="ml-auto rounded px-1 py-0.5 font-mono text-[8px] uppercase"
            style={{
              color: PARTY_COLOR[node.party],
              backgroundColor: PARTY_COLOR[node.party] + '18',
            }}
          >
            {PARTY_LABEL[node.party]}
          </span>
        </div>
      )}

      <div className="mt-2">
        <div className="flex items-center justify-between text-[8.5px] text-slate-500">
          <span>{t.buzzScore}</span>
          <span className="font-mono text-cyan-300">{node.buzz}</span>
        </div>
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-400"
            style={{ width: `${node.buzz}%` }}
          />
        </div>
      </div>

      <div className="mt-2 border-t border-slate-400/10 pt-1.5 font-mono text-[8px] uppercase tracking-wider text-slate-600">
        click → network
      </div>
    </div>
  );
}
