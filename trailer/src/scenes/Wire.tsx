import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Count, Kicker, Rise, Vignette } from '../components/Kit';
import { D, type Lang } from '../data';
import { copyFor } from '../copy';
import { BEAT, C, MONO, SANS, clamp } from '../theme';

/**
 * 야간 파이프라인 (5마디). 왼쪽은 아카이브의 실제 헤드라인과 그 판정,
 * 오른쪽은 아카이브 규모와 미판정 수. 미판정을 숨기지 않는다는 것도 기능이다.
 */
export const Wire: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  const items = D.wire.slice(0, 5);
  const m = D.manifest;
  const unjudged = m.total - m.classified;

  return (
    <AbsoluteFill>
      <Backdrop warm={0.6} />
      <AbsoluteFill style={{ padding: '200px 260px 0' }}>
        <Kicker text="NIGHTLY PIPELINE" at={0} />
        <div style={{ height: 30 }} />
        <Rise text={t.wireTitle} at={6} size={140} />
        <div style={{ height: 16 }} />
        <Rise text={t.wireSub} at={28} size={66} weight={500} color={C.sub} stagger={2} />
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: 260, top: 720, width: 2200, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {items.map((w, i) => {
          const at = 40 + i * BEAT * 1.5;
          const s = spring({ frame: frame - at, fps, config: { damping: 200 } });
          const stamp = spring({ frame: frame - at - BEAT, fps, config: { damping: 10, mass: 0.4 } });
          const col = w.polarity === 'ally' ? C.ally : C.feud;
          const verdict = w.polarity === 'ally' ? t.legendAlly : t.legendFeud;
          const pair = w.names.map((n) => n[lang]).join(' × ');
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 40,
                padding: '30px 44px',
                borderRadius: 28,
                background: '#0c1322e6',
                border: `3px solid ${C.line}`,
                opacity: s,
                translate: `${(1 - s) * -160}px 0`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 38, color: C.dim, letterSpacing: '0.06em' }}>
                  {w.date} · {w.source.toUpperCase()} · {pair}
                </div>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 56, color: C.ink, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lang === 'ko' ? w.summary_ko : w.title}
                </div>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: 46,
                  letterSpacing: '0.12em',
                  color: col,
                  border: `4px solid ${col}`,
                  borderRadius: 16,
                  padding: '12px 28px',
                  scale: String(1.6 - 0.6 * stamp),
                  opacity: Math.min(1, stamp * 1.5),
                  rotate: '-4deg',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {verdict}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ position: 'absolute', right: 260, top: 760, width: 1120, textAlign: 'right' }}>
        <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 340, color: C.ink, lineHeight: 0.95, letterSpacing: '-0.04em' }}>
          <Count value={m.total} at={60} dur={200} />
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 60, color: C.sub, marginTop: 10, opacity: interpolate(frame, [80, 100], [0, 1], clamp) }}>
          {t.wireCount}
        </div>
        <div style={{ marginTop: 70, fontFamily: SANS, fontSize: 62, fontWeight: 700, color: C.ally, opacity: interpolate(frame, [240, 256], [0, 1], clamp) }}>
          {t.wireJudged(m.classified)}
        </div>
        <div style={{ marginTop: 18, fontFamily: SANS, fontSize: 62, fontWeight: 700, color: C.gold, opacity: interpolate(frame, [288, 304], [0, 1], clamp) }}>
          {t.wireUnjudged(unjudged)}
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};
