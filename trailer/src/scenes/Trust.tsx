import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { Kicker, Rise, Shot } from '../components/Kit';
import { type Lang } from '../data';
import { copyFor } from '../copy';
import { BAR, C } from '../theme';

/**
 * 신뢰 (5마디). 근거 팝오버 → 매체 구성. 둘 다 실제 앱 캡처.
 * 근거 팝오버 중심 ≈ (2376, 1627), 매체 구성 블록 중심 ≈ (348, 1315).
 */
export const Trust: React.FC<{ lang: Lang }> = ({ lang }) => {
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Sequence name="Evidence" durationInFrames={BAR * 2.5} premountFor={fps}>
        <Shot src={`ui/${lang}/04-evidence.png`} focus={[2376, 1580]} zoom={[1.2, 2.3]} dur={BAR * 2.5} />
        <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(3,6,12,0.97) 0%, rgba(3,6,12,0.9) 30%, transparent 52%)' }} />
        <AbsoluteFill style={{ padding: '180px 260px 0' }}>
          <Kicker text="EVIDENCE" at={0} />
          <div style={{ height: 28 }} />
          <Rise text={t.trustTitle} at={6} size={130} />
          <Rise text={t.trustSub} at={30} size={130} color={C.cosponsor} />
        </AbsoluteFill>
      </Sequence>
      <Sequence name="SourceMix" from={BAR * 2.5} durationInFrames={BAR * 2.5} premountFor={fps}>
        <Shot src={`ui/${lang}/07-source-mix.png`} focus={[420, 1300]} zoom={[1.4, 2.4]} dur={BAR * 2.5} />
        <AbsoluteFill style={{ background: 'linear-gradient(to left, rgba(3,6,12,0.96) 0%, rgba(3,6,12,0.85) 40%, transparent 62%)' }} />
        <AbsoluteFill style={{ padding: '0 260px', justifyContent: 'center', alignItems: 'flex-end' }}>
          <div style={{ width: 1750, textAlign: 'right' }}>
            <Kicker text="SOURCE MIX" at={0} />
            <div style={{ height: 28 }} />
            <Rise text={t.mixTitle} at={6} size={120} />
            <div style={{ height: 30 }} />
            <Rise text={t.mixSub} at={30} size={64} weight={500} color={C.sub} stagger={2} />
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
