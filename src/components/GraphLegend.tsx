import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { ALL_REL_TYPES, REL_META } from '../types';

/**
 * 그래프 좌측 하단의 범례 겸 관계 유형 필터.
 * 범례가 곧 토글이라 "무슨 선인지" 와 "그 선을 볼지" 가 한자리에 있다.
 * 기본값은 전부 선택(= 전부 표시).
 */
export default function GraphLegend() {
  const { t, L } = useI18n();
  const relTypes = useStore((s) => s.filters.relTypes);
  const toggleRelType = useStore((s) => s.toggleRelType);

  return (
    <div
      data-testid="graph-legend"
      className="pointer-events-auto w-[212px] rounded-2xl border border-slate-400/15 bg-ink-900/85 p-2.5 shadow-2xl shadow-black/40 backdrop-blur-2xl"
    >
      <h3 className="mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
        <span className="text-[12px]">◈</span> {t.legend}
      </h3>

      <div className="flex flex-col gap-0.5">
        {ALL_REL_TYPES.map((rt) => {
          const meta = REL_META[rt];
          const on = relTypes.includes(rt);
          return (
            <button
              key={rt}
              data-testid={`legend-${rt}`}
              aria-pressed={on}
              onClick={() => toggleRelType(rt)}
              className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.06] ${
                on ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              <svg width="24" height="6" className="shrink-0" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="24"
                  y2="3"
                  stroke={meta.color}
                  strokeWidth="2"
                  strokeDasharray={meta.dash?.join(',')}
                  opacity={on ? 1 : 0.28}
                />
              </svg>
              <span className={`truncate text-[11.5px] ${on ? '' : 'line-through decoration-slate-600'}`}>
                {L(meta.label)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 border-t border-slate-400/10 px-1 pt-1.5 text-[10px] leading-relaxed text-slate-600">
        · {t.edgeWidth}
        <br />· {t.nodeSize}
        <br />· {t.particleNote}
      </p>
    </div>
  );
}
