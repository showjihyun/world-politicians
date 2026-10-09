import { Composition, Folder } from 'remotion';
import { TRAILER_FRAMES, Trailer } from './Trailer';
import { FPS, H, W } from './theme';

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="POLARIS">
      <Composition id="Trailer-EN" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={W} height={H} defaultProps={{ lang: 'en' as const }} />
      <Composition id="Trailer-KO" component={Trailer} durationInFrames={TRAILER_FRAMES} fps={FPS} width={W} height={H} defaultProps={{ lang: 'ko' as const }} />
    </Folder>
  );
};
