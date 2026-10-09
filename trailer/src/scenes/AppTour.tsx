import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { Kicker, Rise, Scrim, Shot } from '../components/Kit';
import { type Lang } from '../data';
import { copyFor } from '../copy';
import { BAR, C } from '../theme';

/**
 * 실제 앱 화면 (5마디). 2D → 3D → 범례 필터.
 * 좌표는 3840×2160 캡처 기준 — 범례 상자는 (720~1130, 1525~2135).
 */
export const AppTour: React.FC<{ lang: Lang }> = ({ lang }) => {
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  const ui = (name: string) => `ui/${lang}/${name}.png`;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Sequence name="2D" durationInFrames={BAR * 2} premountFor={fps}>
        <Shot src={ui('01-graph')} focus={[2150, 900]} zoom={[1.0, 1.35]} dur={BAR * 2} />
        <Scrim />
        <Caption title={t.uiGraph} sub={t.uiGraphSub} kicker="LIVE APP" />
      </Sequence>
      <Sequence name="3D" from={BAR * 2} durationInFrames={BAR} premountFor={fps}>
        <Shot src={ui('09-3d')} focus={[1960, 1130]} zoom={[1.5, 1.9]} dur={BAR} />
        <Scrim />
        <Caption title={t.ui3d} kicker="3D" />
      </Sequence>
      <Sequence name="Legend" from={BAR * 3} durationInFrames={BAR * 2} premountFor={fps}>
        <Shot src={ui('02-legend-feud')} focus={[1100, 1760]} zoom={[1.0, 2.2]} dur={BAR * 2} />
        <Scrim from="top" />
        <Caption title={t.uiLegend} sub={t.uiLegendSub} kicker="FILTER" top />
      </Sequence>
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ title: string; sub?: string; kicker: string; top?: boolean }> = ({ title, sub, kicker, top }) => (
  <AbsoluteFill style={{ padding: top ? '170px 260px 0' : '0 260px 190px', justifyContent: top ? 'flex-start' : 'flex-end', alignItems: top ? 'flex-end' : 'flex-start' }}>
    <div style={{ textAlign: top ? 'right' : 'left' }}>
      <Kicker text={kicker} at={4} />
      <div style={{ height: 26 }} />
      <Rise text={title} at={8} size={140} />
      {sub ? (
        <>
          <div style={{ height: 22 }} />
          <Rise text={sub} at={30} size={68} weight={500} color={C.sub} stagger={2} />
        </>
      ) : null}
    </div>
  </AbsoluteFill>
);
