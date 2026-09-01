import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { SIGNALS_META } from '../data/signals';
import { useI18n } from '../i18n';

/** 마지막 수집이 얼마나 지났는지 — 24h 이내 초록, 3일 이내 호박, 그 뒤 빨강 */
function freshness(generatedAt: string | null) {
  if (!generatedAt) return { hours: null as number | null, color: '#64748b' };
  const hours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  const color = hours < 24 ? '#34d399' : hours < 72 ? '#fbbf24' : '#fb7185';
  return { hours, color };
}

function fmtDate(ymd: string | null, locale: string): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return locale === 'ko' ? `${y}.${m}.${d}` : `${m}/${d}`;
}

/**
 * 우측 하단 데이터 신선도 배지.
 * 수집 기간(수록된 기사의 실제 날짜 범위)과 마지막 갱신 경과를 함께 보여줘
 * 지금 보는 게 최신인지 한눈에 알 수 있게 한다.
 */
export default function DataFreshness() {
  const { t, locale } = useI18n();
  // 경과 시간이 화면에 남아 있는 동안 굳지 않도록 1분마다 다시 계산
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { hours, color } = freshness(SIGNALS_META.generatedAt);
  const ago =
    hours == null
      ? '—'
      : hours < 1
        ? t.freshNow
        : hours < 24
          ? `${Math.floor(hours)}${t.freshHours}`
          : `${Math.floor(hours / 24)}${t.freshDays}`;

  return (
    <div
      data-testid="data-freshness"
      className="pointer-events-auto rounded-2xl border border-slate-400/15 bg-ink-900/85 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur-2xl"
    >
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
        <Database size={10} />
        {t.dataCoverage}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5 font-mono text-[15px] font-bold leading-none text-slate-100">
        <span data-testid="coverage-range">
          {fmtDate(SIGNALS_META.firstDate, locale)}
          <span className="mx-1 text-slate-600">→</span>
          {fmtDate(SIGNALS_META.lastDate, locale)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-slate-400">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
          aria-hidden
        />
        <span>
          {t.dataUpdated} {ago}
        </span>
        <span className="text-slate-600">·</span>
        <span className="font-mono">
          {SIGNALS_META.count} {t.signalsUnit}
        </span>
      </div>
    </div>
  );
}
