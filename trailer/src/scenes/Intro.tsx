import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Count, Kicker, Rise, Scrim, Vignette } from '../components/Kit';
import { DASH, Graph, hash01, type DrawEdge, type DrawLabel, type DrawNode } from '../components/Graph';
import { D, NODE, radius, type Lang } from '../data';
import { copyFor } from '../copy';
import { C, H, REL_COLOR, W, clamp } from '../theme';

/**
 * 0 ~ 840f (드롭 직전까지).
 * 점이 떠오르고 → 선이 이어지고 → "동맹 / 갈등" → 카메라가 허브로 밀고 들어간다.
 */
const CX = W / 2;
const CY = H / 2;
// 노드는 중심에서 가까운 순서로 떠오른다 (약간의 흔들림을 섞어 물결처럼)
const ORDER = [...D.nodes]
  .map((n) => ({ id: n.id, k: Math.hypot(n.x - CX, n.y - CY) / 2200 + hash01(n.id) * 0.35 }))
  .sort((a, b) => a.k - b.k)
  .map((o, i) => [o.id, i] as const);
const RANK = new Map(ORDER);
const EDGE_ORDER = [...D.links].sort((a, b) => (RANK.get(a.a)! + RANK.get(a.b)!) - (RANK.get(b.a)! + RANK.get(b.b)!));

export const Intro: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  const hub = NODE.get(D.hub.id)!;

  // 마지막 3마디: 허브 강조
  const focus = interpolate(frame, [600, 780], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.2, 1) });
  const zoom = interpolate(frame, [0, 600, 800], [0.97, 1.04, 1.6], { ...clamp, easing: Easing.bezier(0.45, 0, 0.3, 1) });
  const camera = { cx: CX + (hub.x - CX) * focus, cy: CY + 90 + (hub.y - CY - 90) * focus, zoom };

  const nodes: DrawNode[] = D.nodes.map((n) => {
    const s = spring({ frame: frame - 70 - RANK.get(n.id)! * 2.6, fps, config: { damping: 14, mass: 0.6 } });
    const isHub = n.id === D.hub.id;
    return {
      id: n.id,
      x: n.x,
      y: n.y,
      r: radius(n.id) * s * (isHub ? 1 + 0.25 * focus : 1),
      party: n.party,
      opacity: isHub ? 1 : 1 - 0.55 * focus,
      ring: isHub && focus > 0 ? C.gold : undefined,
      ringWidth: 8 * focus,
    };
  });

  const edges: DrawEdge[] = EDGE_ORDER.map((l, i) => {
    const a = NODE.get(l.a)!;
    const b = NODE.get(l.b)!;
    const p = interpolate(frame, [250 + i * 1.3, 250 + i * 1.3 + 26], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const touchesHub = l.a === D.hub.id || l.b === D.hub.id;
    const [from, to] = l.b === D.hub.id ? [b, a] : [a, b];
    return {
      key: `${l.a}|${l.b}`,
      x1: from.x,
      y1: from.y,
      x2: from.x + (to.x - from.x) * p,
      y2: from.y + (to.y - from.y) * p,
      color: touchesHub && focus > 0 ? C.gold : REL_COLOR[l.type],
      width: (2 + l.strength * 1.6) * (touchesHub ? 1 + focus * 0.6 : 1),
      opacity: (p > 0 ? 0.55 : 0) * (touchesHub ? 1 + 0.6 * focus : 1 - 0.75 * focus),
      dash: DASH[l.type],
    };
  });

  const labels: DrawLabel[] = D.nodes
    .filter((n) => n.prominence >= 8)
    .map((n) => ({
      key: n.id,
      x: n.x,
      y: n.y + radius(n.id) + 46,
      text: lang === 'ko' ? n.ko : n.en,
      opacity: interpolate(frame, [330, 380], [0, 0.85], clamp) * (n.id === D.hub.id ? 1 : 1 - focus),
      size: n.id === D.hub.id ? 40 + 14 * focus : 34,
      color: n.id === D.hub.id && focus > 0.3 ? C.gold : C.ink,
    }));

  const bg = interpolate(frame, [0, 50], [0, 1], clamp);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: bg }}>
        <Backdrop />
      </AbsoluteFill>
      <Graph nodes={nodes} edges={edges} labels={labels} camera={camera} />
      <Vignette />
      <Scrim />
      <AbsoluteFill style={{ padding: '0 260px 200px', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', height: 420 }}>
          <div style={{ position: 'absolute', bottom: 0 }}>
            <Kicker text={t.introKicker} at={40} out={290} color={C.sub} />
          </div>
          <div style={{ position: 'absolute', bottom: 0, display: 'flex', gap: 60 }}>
            <Rise text={t.allied} at={300} size={190} color={C.ally} out={580} />
            <Rise text={t.feuding} at={420} size={190} color={C.feud} out={580} />
          </div>
          <div style={{ position: 'absolute', bottom: 0 }}>
            <Kicker text="HUB" at={600} color={C.gold} />
            <div style={{ height: 30 }} />
            <HubLine lang={lang} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const HubLine: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const t = copyFor(lang);
  // 숫자 자리에 카운터를 끼운다
  const [before, after] = t.hubLine(-1).split('-1');
  const o = interpolate(frame, [618, 640], [0, 1], clamp);
  return (
    <div style={{ fontFamily: 'Pretendard', fontWeight: 800, fontSize: 128, color: C.ink, letterSpacing: '-0.025em', opacity: o, translate: `0 ${(1 - o) * 40}px` }}>
      {before}
      <Count value={D.hub.hubDegree} at={630} dur={70} style={{ color: C.gold }} />
      {after}
    </div>
  );
};
