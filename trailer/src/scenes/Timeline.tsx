import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Kicker, Rise, Vignette } from '../components/Kit';
import { D, type Lang } from '../data';
import { copyFor } from '../copy';
import { BEAT, C, MONO, SANS, clamp } from '../theme';

/**
 * Trump × Musk 월별 띠 (6마디). 셀은 앱의 정본 산식 buildPairTimeline 이 낸 값이다.
 */
const POL = { ally: C.ally, feud: C.feud, neutral: '#3b4660' } as const;
const CELL = 168;
const GAP = 14;

export const Timeline: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  const cells = D.timeline.cells;
  const total = cells.length * CELL + (cells.length - 1) * GAP;

  return (
    <AbsoluteFill>
      <Backdrop warm={0.8} />
      <AbsoluteFill style={{ padding: '210px 260px', flexDirection: 'column' }}>
        <Kicker text="ANALYSIS · TIMELINE" at={0} />
        <div style={{ height: 34 }} />
        <Rise text={t.tlTitle} at={6} size={150} />
        <div style={{ height: 20 }} />
        <Rise text={t.tlNames} at={26} size={84} weight={600} color={C.sub} stagger={3} />
      </AbsoluteFill>

      {/* 띠 */}
      <div style={{ position: 'absolute', left: (3840 - total) / 2, top: 1010, display: 'flex', gap: GAP }}>
        {cells.map((c, i) => {
          const at = 60 + i * 7;
          const s = spring({ frame: frame - at, fps, config: { damping: 16, mass: 0.5 } });
          const label = t.tlFlips[c.ym];
          const callout = interpolate(frame, [at + 30, at + 46], [0, 1], clamp);
          const yearStart = i === 0 || c.ym.endsWith('-01');
          return (
            <div key={c.ym} style={{ position: 'relative', width: CELL }}>
              <div
                style={{
                  height: 240,
                  borderRadius: 22,
                  backgroundColor: POL[c.polarity],
                  scale: `1 ${s}`,
                  transformOrigin: 'bottom',
                  opacity: s,
                  boxShadow: label ? `0 0 0 8px ${C.bg}, 0 0 0 14px ${C.gold}` : undefined,
                }}
              />
              <div style={{ fontFamily: MONO, fontSize: 40, color: yearStart ? C.ink : C.dim, textAlign: 'center', marginTop: 30, opacity: s }}>
                {c.ym.slice(5)}
              </div>
              {yearStart ? (
                <div style={{ fontFamily: MONO, fontSize: 40, color: C.sub, textAlign: 'center', marginTop: 6, opacity: s }}>{c.ym.slice(0, 4)}</div>
              ) : null}
              {label ? (
                <div
                  style={{
                    position: 'absolute',
                    top: -200,
                    left: CELL / 2,
                    translate: '-50% 0',
                    opacity: callout,
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 72, color: POL[c.polarity] }}>{label}</div>
                  <div style={{ width: 6, height: 70 * callout, background: C.gold, margin: '16px auto 0' }} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* 범례 + 규칙 */}
      <div style={{ position: 'absolute', left: 260, right: 260, bottom: 200, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 60, opacity: interpolate(frame, [180, 200], [0, 1], clamp) }}>
          {(
            [
              ['ally', t.legendAlly],
              ['feud', t.legendFeud],
              ['neutral', t.legendNeutral],
            ] as const
          ).map(([k, l]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 20, fontFamily: SANS, fontSize: 56, color: C.sub }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: POL[k] }} />
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, alignItems: 'flex-end' }}>
          {t.tlRules.map((r, i) => {
            const at = BEAT * 13 + i * BEAT * 2;
            const o = interpolate(frame, [at, at + 14], [0, 1], clamp);
            return (
              <div
                key={r}
                style={{
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: 62,
                  color: C.ink,
                  padding: '18px 40px',
                  borderRadius: 999,
                  border: `3px solid ${C.line}`,
                  background: '#0b1220cc',
                  opacity: o,
                  translate: `${(1 - o) * 60}px 0`,
                }}
              >
                {r}
              </div>
            );
          })}
        </div>
      </div>
      <Vignette />
    </AbsoluteFill>
  );
};
