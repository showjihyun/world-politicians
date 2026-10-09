import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Count, Vignette } from '../components/Kit';
import { type Lang } from '../data';
import { copyFor } from '../copy';
import { BEAT, C, MONO, SANS, clamp } from '../theme';

/** 앱 로고(삼각형으로 이어진 세 점)를 크게 그린다 */
export const Mark: React.FC<{ size: number; draw?: number }> = ({ size, draw = 1 }) => {
  const pts = [
    [50, 16],
    [18, 80],
    [82, 80],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {[
        [0, 1],
        [0, 2],
        [1, 2],
      ].map(([a, b], i) => (
        <line
          key={i}
          x1={pts[a][0]}
          y1={pts[a][1]}
          x2={pts[a][0] + (pts[b][0] - pts[a][0]) * draw}
          y2={pts[a][1] + (pts[b][1] - pts[a][1]) * draw}
          stroke={C.gold}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={11 * Math.min(1, draw * 1.5)} fill={C.bg} stroke={C.gold} strokeWidth={5} />
      ))}
    </svg>
  );
};

export const Title: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  const letters = 'POLARIS'.split('');
  const draw = interpolate(frame, [0, 30], [0, 1], clamp);
  const tag = interpolate(frame, [BEAT * 3, BEAT * 3 + 18], [0, 1], clamp);
  const sweep = interpolate(frame, [0, 60], [-0.3, 1.3], clamp);

  return (
    <AbsoluteFill>
      <Backdrop warm={0.7} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 90 }}>
          <Mark size={330} draw={draw} />
          <div style={{ display: 'flex', fontFamily: SANS, fontWeight: 900, fontSize: 400, color: C.ink, letterSpacing: '0.12em', position: 'relative' }}>
            {letters.map((l, i) => {
              const s = spring({ frame: frame - 4 - i * 5, fps, config: { damping: 15, mass: 0.5 } });
              return (
                <span key={i} style={{ display: 'inline-block', scale: String(0.6 + 0.4 * s), opacity: s, translate: `0 ${(1 - s) * 80}px` }}>
                  {l}
                </span>
              );
            })}
            {/* 금빛 하이라이트가 글자를 훑고 지나간다 */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(100deg, transparent ${sweep * 100 - 12}%, rgba(245,196,81,0.55) ${sweep * 100}%, transparent ${sweep * 100 + 12}%)`,
                mixBlendMode: 'overlay',
              }}
            />
          </div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 76, letterSpacing: '0.3em', color: C.sub, opacity: tag, marginTop: 40, textTransform: 'uppercase' }}>
          {t.tagline}
        </div>
        <div style={{ display: 'flex', gap: 120, marginTop: 170 }}>
          {t.stats.map(([n, label], i) => {
            const at = BEAT * (5 + i);
            const o = interpolate(frame, [at, at + 12], [0, 1], clamp);
            return (
              <div key={label} style={{ textAlign: 'center', opacity: o, translate: `0 ${(1 - o) * 40}px` }}>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 210, color: [C.ink, C.ally, C.cosponsor, C.feud][i], lineHeight: 1 }}>
                  <Count value={n} at={at} dur={36} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 52, letterSpacing: '0.14em', color: C.sub, marginTop: 24, textTransform: 'uppercase' }}>{label}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <Vignette />
    </AbsoluteFill>
  );
};
