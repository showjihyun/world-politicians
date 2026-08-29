import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useI18n } from '../i18n';

/**
 * 방문자 수. /api/hits 가 없거나(로컬 개발) KV 가 연결되지 않았으면 아무것도
 * 그리지 않는다 — 카운터 하나 때문에 헤더에 빈 칸이나 오류가 남으면 안 된다.
 *
 * 증가는 세션당 한 번. 새로고침마다 올리면 숫자가 방문자가 아니라 조회수가 된다.
 */
const SESSION_KEY = 'polaris-counted';

export default function VisitorCount() {
  const { t, locale } = useI18n();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;

    let firstVisit = true;
    try {
      firstVisit = sessionStorage.getItem(SESSION_KEY) === null;
      if (firstVisit) sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // 프라이빗 모드 등에서 sessionStorage 가 막히면 조회만 한다
      firstVisit = false;
    }

    fetch(`/api/hits${firstVisit ? '?bump=1' : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number | null } | null) => {
        if (live && typeof d?.count === 'number') setCount(d.count);
      })
      .catch(() => {
        /* 카운터는 없어도 되는 기능 — 조용히 넘어간다 */
      });

    return () => {
      live = false;
    };
  }, []);

  if (count === null) return null;

  return (
    <div
      data-testid="visitor-count"
      title={t.visitors}
      className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-400/15 bg-ink-900/80 px-3 backdrop-blur-xl"
    >
      <Eye size={13} className="shrink-0 text-slate-500" />
      <span className="font-mono text-[12.5px] font-semibold tabular-nums text-slate-300">
        {count.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')}
      </span>
      <span className="hidden text-[10.5px] text-slate-600 lg:inline">{t.visitors}</span>
    </div>
  );
}
