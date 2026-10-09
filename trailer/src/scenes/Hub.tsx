import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Count, Rise, Scrim, Vignette } from '../components/Kit';
import { DASH, Graph, lerp, type DrawEdge, type DrawLabel, type DrawNode } from '../components/Graph';
import { D, HUB_COMPONENTS, NODE, radius, type Lang } from '../data';
import { copyFor } from '../copy';
import { C, H, REL_COLOR, SANS, W, clamp } from '../theme';

/**
 * 드롭(840f)에서 시작. 허브가 터지고 네트워크가 실제로 몇 조각이 되는지 보여준다.
 * 조각 수는 data.ts 가 그래프에서 다시 세고, 준비 스크립트 값과 다르면 렌더를 멈춘다.
 */
const COMP_OF = new Map<string, number>();
HUB_COMPONENTS.forEach((c, i) => c.forEach((id) => COMP_OF.set(id, i)));

export const Hub: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = copyFor(lang);
  const hub = NODE.get(D.hub.id)!;

  const burst = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const spread = interpolate(frame, [6, 150], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
  const mark = interpolate(frame, [170, 230], [0, 1], clamp);
  // 인트로 끝 카메라(허브 1.55배)에서 전체로 빠진다
  const zoom = interpolate(frame, [0, 120], [1.6, 0.95], { ...clamp, easing: Easing.bezier(0.3, 0, 0.1, 1) });
  const cx = lerp(hub.x, W / 2, interpolate(frame, [0, 120], [0, 1], clamp));
  const cy = lerp(hub.y, H / 2 + 240, interpolate(frame, [0, 120], [0, 1], clamp));

  const pos = (id: string) => {
    const n = NODE.get(id)!;
    return { x: lerp(n.x, n.ax ?? n.x, spread), y: lerp(n.y, n.ay ?? n.y, spread) };
  };

  const nodes: DrawNode[] = D.nodes
    .filter((n) => n.id !== D.hub.id)
    .map((n) => {
      const frag = (COMP_OF.get(n.id) ?? 0) > 0;
      const p = pos(n.id);
      return {
        id: n.id,
        ...p,
        r: radius(n.id),
        party: n.party,
        opacity: frag ? 1 : 1 - 0.45 * mark,
        ring: frag && mark > 0 ? C.gold : undefined,
        ringWidth: 7 * mark,
      };
    });

  const edges: DrawEdge[] = D.links
    .filter((l) => l.a !== D.hub.id && l.b !== D.hub.id)
    .map((l) => {
      const a = pos(l.a);
      const b = pos(l.b);
      return { key: `${l.a}|${l.b}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: REL_COLOR[l.type], width: 2 + l.strength * 1.6, opacity: 0.5 * (1 - 0.4 * mark), dash: DASH[l.type] };
    });

  // 허브에 붙어 있던 선은 끊어지며 사라진다
  const cut: DrawEdge[] = D.links
    .filter((l) => l.a === D.hub.id || l.b === D.hub.id)
    .map((l) => {
      const other = pos(l.a === D.hub.id ? l.b : l.a);
      const k = 1 - burst;
      return { key: `cut-${l.a}|${l.b}`, x1: other.x, y1: other.y, x2: lerp(other.x, hub.x, k), y2: lerp(other.y, hub.y, k), color: C.gold, width: 5, opacity: 0.9 * k };
    });

  // 떨어져 나간 사람이 누구인지 이름으로 보여준다
  const labels: DrawLabel[] = HUB_COMPONENTS.slice(1)
    .flat()
    .map((id) => {
      const n = NODE.get(id)!;
      const p = pos(id);
      return { key: id, x: p.x, y: p.y + radius(id) + 56, text: lang === 'ko' ? n.ko : n.en, opacity: mark, size: 44, color: C.gold };
    });

  const flash = interpolate(frame, [0, 4, 22], [0, 0.55, 0], clamp);
  const ring = interpolate(frame, [0, 40], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill>
      <Backdrop warm={1.2} />
      <Graph nodes={nodes} edges={[...edges, ...cut]} labels={labels} camera={{ cx, cy, zoom }} />
      {/* 허브 자리의 충격파 */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <circle
          cx={W / 2 + (hub.x - cx) * zoom}
          cy={H / 2 + (hub.y - cy) * zoom}
          r={60 + ring * 1400}
          fill="none"
          stroke={C.gold}
          strokeWidth={30 * (1 - ring)}
          opacity={1 - ring}
        />
      </svg>
      <AbsoluteFill style={{ backgroundColor: '#fff6dc', opacity: flash }} />
      <Vignette />
      <Scrim />
      <AbsoluteFill style={{ padding: '0 260px 200px', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 80 }}>
          <div>
            <Rise text={t.removeHub} at={8} size={130} color={C.sub} weight={700} />
            <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 420, lineHeight: 0.9, color: C.gold, opacity: mark, letterSpacing: '-0.04em' }}>
              <Count value={HUB_COMPONENTS.length} at={170} dur={50} />
              <span style={{ fontSize: 150, fontWeight: 800, color: C.ink, marginLeft: 40, letterSpacing: '-0.02em' }}>{t.pieces}</span>
            </div>
          </div>
          <div style={{ paddingBottom: 40, maxWidth: 1500 }}>
            <Rise text={t.piecesSub} at={250} size={72} weight={600} color={C.sub} stagger={2} />
            <div style={{ height: 30 }} />
            <Rise text={t.notBlocs} at={350} size={84} weight={800} color={C.ink} stagger={3} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
