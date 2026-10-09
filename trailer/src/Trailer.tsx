import { Audio } from '@remotion/media';
import { AbsoluteFill, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { type Lang } from './data';
import { BAR, DROP, MUSIC_TRIM_SECONDS, clamp } from './theme';
import { Intro } from './scenes/Intro';
import { Hub } from './scenes/Hub';
import { Title } from './scenes/Title';
import { AppTour } from './scenes/AppTour';
import { Timeline } from './scenes/Timeline';
import { Wire } from './scenes/Wire';
import { Cosponsor } from './scenes/Cosponsor';
import { Influence } from './scenes/Influence';
import { Trust } from './scenes/Trust';
import { Bilingual } from './scenes/Bilingual';
import { End } from './scenes/End';

/**
 * 장면 길이는 마디(96f) 단위다. 첫 장면만 드롭(840f)에 맞춰 끝난다.
 * 합계는 TRAILER_FRAMES 로 Root 에 넘긴다 — 둘이 어긋나면 끝이 잘리거나 검은 화면이 붙는다.
 */
export const SCENES = [
  ['Intro', DROP],
  ['Hub', BAR * 6],
  ['Title', BAR * 4],
  ['AppTour', BAR * 5],
  ['Timeline', BAR * 6],
  ['Wire', BAR * 5],
  ['Cosponsor', BAR * 5],
  ['Influence', BAR * 6],
  ['Trust', BAR * 5],
  ['Bilingual', BAR * 4],
  ['End', BAR * 5],
] as const;
export const TRAILER_FRAMES = SCENES.reduce((s, [, d]) => s + d, 0);
const dur = Object.fromEntries(SCENES) as Record<(typeof SCENES)[number][0], number>;

export const Trailer: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const volume = interpolate(frame, [0, 20, durationInFrames - BAR, durationInFrames - 4], [0, 0.9, 0.9, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Audio name="Music" src={staticFile('music/Hitman.mp3')} trimBefore={MUSIC_TRIM_SECONDS * fps} volume={volume} />
      <Series>
        <Series.Sequence name="Intro" durationInFrames={dur.Intro} premountFor={fps}>
          <Intro lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Hub" durationInFrames={dur.Hub} premountFor={fps}>
          <Hub lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Title" durationInFrames={dur.Title} premountFor={fps}>
          <Title lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="AppTour" durationInFrames={dur.AppTour} premountFor={fps}>
          <AppTour lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Timeline" durationInFrames={dur.Timeline} premountFor={fps}>
          <Timeline lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Wire" durationInFrames={dur.Wire} premountFor={fps}>
          <Wire lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Cosponsor" durationInFrames={dur.Cosponsor} premountFor={fps}>
          <Cosponsor lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Influence" durationInFrames={dur.Influence} premountFor={fps}>
          <Influence lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Trust" durationInFrames={dur.Trust} premountFor={fps}>
          <Trust lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="Bilingual" durationInFrames={dur.Bilingual} premountFor={fps}>
          <Bilingual lang={lang} />
        </Series.Sequence>
        <Series.Sequence name="End" durationInFrames={dur.End} premountFor={fps}>
          <End lang={lang} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
