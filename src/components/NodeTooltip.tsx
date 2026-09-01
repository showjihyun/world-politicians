import { PARTY_COLOR, PARTY_LABEL } from '../lib/colors';
import { FACTION_MAP } from '../data/factions';
import { usePortrait } from '../lib/portrait';
import { useI18n } from '../i18n';
import type { GraphNode } from '../lib/graph';
import type { Party } from '../types';

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
  const partyLabelOf = (party: Party) => L(PARTY_LABEL[party]);
  const { img } = usePortrait(node?.id ?? '', node?.enName ?? '');
  if (!node) return null;

  const flipX = x > window.innerWidth - 296;
  const flipY = y > window.innerHeight - 200;
  const faction = FACTION_MAP[node.faction];

  return (
    <div
      className="pointer-events-none absolute z-40 w-[276px] rounded-xl border border-slate-400/20 bg-ink-900/95 p-3 shadow-2xl shadow-black/70 backdrop-blur-xl"
      style={{
        left: flipX ? x - 286 : x + 16,
        top: flipY ? y - 180 : y + 14,
      }}
    >
      <div className="flex items-start gap-2">
        {node && img ? (
          <img
            src={img}
            alt=""
            className="h-[52px] w-[52px] shrink-0 rounded-lg border border-slate-400/25 object-cover"
          />
        ) : (
          <span
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg font-mono text-[18px] font-bold"
            style={{
              color: PARTY_COLOR[node.party],
              background: PARTY_COLOR[node.party] + '1c',
              border: `1px solid ${PARTY_COLOR[node.party]}55`,
            }}
          >
            {node.enName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold leading-tight text-white">
            {L(node.name)}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400">
            {L(node.role)}
          </div>
        </div>
      </div>

      {faction && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-slate-500">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: faction.color }}
          />
          {L(faction.label)}
          <span className="ml-auto rounded px-1 py-0.5 font-mono text-[10.5px] uppercase"
            style={{
              color: PARTY_COLOR[node.party],
              backgroundColor: PARTY_COLOR[node.party] + '18',
            }}
          >
            {partyLabelOf(node.party)}
          </span>
        </div>
      )}

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10.5px] text-slate-500">
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

      <div className="mt-2 border-t border-slate-400/10 pt-1.5 font-mono text-[10.5px] uppercase tracking-wider text-slate-600">
        click → network
      </div>
    </div>
  );
}
