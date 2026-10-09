import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Kicker, Rise } from '../components/Kit';
import { D, type Lang } from '../data';
import { copyFor } from '../copy';
import { BAR, C, H, W, clamp } from '../theme';

/**
 * 이중 언어 (4마디). 같은 상태의 스토리 화면을 영어 ↔ 한국어로 사선 와이프한다.
 * 이 영상의 언어가 먼저, 다른 언어가 나중에 들어온다.
 */
const ZOOM = 1.42;
const FOCUS: [number, number] = [1000, 620]; // 스토리 목록 + 패널이 왼쪽에 오게

export const Bilingual: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const t = copyFor(lang);
  const other: Lang = lang === 'en' ? 'ko' : 'en';
  const wipe = interpolate(frame, [BAR * 0.75, BAR * 1.75], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.3, 1) });
  const back = interpolate(frame, [BAR * 2.5, BAR * 3.25], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.3, 1) });
  // 대각선 위치: 0 → 오른쪽 밖, 1 → 왼쪽 밖, 그리고 다시 반으로
  const edge = interpolate(wipe - back * 0.5, [0, 1], [W + 900, -900]);
  const z = ZOOM + frame * 0.0006;
  const halfW = W / 2 / z;
  const halfH = H / 2 / z;
  const cx = Math.min(Math.max(FOCUS[0], halfW), W - halfW);
  const cy = Math.min(Math.max(FOCUS[1], halfH), H - halfH);
  const img = (l: Lang) => (
    <Img
      src={staticFile(`ui/${l}/08-story.png`)}
      style={{ position: 'absolute', width: W, height: H, transformOrigin: '0 0', scale: String(z), translate: `${-(cx - halfW) * z}px ${-(cy - halfH) * z}px` }}
    />
  );
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden' }}>
      {img(lang)}
      <AbsoluteFill style={{ clipPath: `polygon(${edge}px 0, ${W + 2000}px 0, ${W + 2000}px ${H}px, ${edge - 700}px ${H}px)` }}>{img(other)}</AbsoluteFill>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <line x1={edge} y1={0} x2={edge - 700} y2={H} stroke={C.gold} strokeWidth={10} />
      </svg>
      <AbsoluteFill style={{ background: 'linear-gradient(to left, rgba(3,6,12,0.96) 0%, rgba(3,6,12,0.88) 34%, transparent 48%)' }} />
      <AbsoluteFill style={{ padding: '0 200px', justifyContent: 'center', alignItems: 'flex-end', textAlign: 'right' }}>
        <Kicker text={`BILINGUAL · ${D.counts.stories} GUIDED STORIES`} at={0} color={C.gold} />
        <div style={{ height: 28 }} />
        <Rise text={t.langTitle} at={6} size={150} />
        <div style={{ height: 16 }} />
        <div style={{ width: 1200 }}>
          <Rise text={t.langSub} at={30} size={66} weight={500} color={C.sub} stagger={2} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
