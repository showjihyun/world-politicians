import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, Rise, Vignette } from '../components/Kit';
import { type Lang } from '../data';
import { copyFor } from '../copy';
import { BAR, BEAT, C, MONO, SANS, clamp } from '../theme';
import { Mark } from './Title';

/** 엔드 카드 (5마디). 마지막 1마디에서 화면과 음악이 함께 꺼진다 */
export const End: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const t = copyFor(lang);
  const o = (at: number) => interpolate(frame, [at, at + 16], [0, 1], clamp);
  const fade = interpolate(frame, [BAR * 4, BAR * 5 - 6], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ opacity: fade }}>
        <Backdrop warm={0.8} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <Rise text={t.endLine} at={4} size={110} weight={700} color={C.sub} stagger={3} style={{ textAlign: 'center' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 70, marginTop: 110, opacity: o(BEAT * 3) }}>
            <Mark size={250} draw={interpolate(frame, [BEAT * 3, BEAT * 4], [0, 1], clamp)} />
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 300, letterSpacing: '0.12em', color: C.ink }}>POLARIS</div>
          </div>
          <div
            style={{
              marginTop: 80,
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 110,
              color: C.gold,
              padding: '30px 80px',
              border: `5px solid ${C.gold}`,
              borderRadius: 30,
              opacity: o(BEAT * 5),
            }}
          >
            {t.endUrl}
          </div>
          <div style={{ marginTop: 70, fontFamily: SANS, fontSize: 64, fontWeight: 500, color: C.sub, opacity: o(BEAT * 7) }}>{t.endMeta}</div>
          <div style={{ marginTop: 26, fontFamily: MONO, fontSize: 48, color: C.dim, opacity: o(BEAT * 7) }}>github.com/showjihyun/world-politicians</div>
        </AbsoluteFill>
        <div style={{ position: 'absolute', bottom: 110, width: '100%', textAlign: 'center', fontFamily: MONO, fontSize: 38, color: C.dim, opacity: o(BEAT * 8) }}>
          {t.credit}
        </div>
        <Vignette />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
