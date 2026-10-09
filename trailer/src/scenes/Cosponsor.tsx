import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop, Kicker, Rise, Scrim, Vignette } from '../components/Kit';
import { DASH, Graph, lerp, type DrawEdge, type DrawLabel, type DrawNode } from '../components/Graph';
import { D, NODE, radius, type Lang } from '../data';
import { copyFor } from '../copy';
import { BAR, C, H, MONO, SANS, W, clamp } from '../theme';

/**
 * 공동발의 레이어 (5마디). 큐레이션 선은 희미하게 깔고, 측정 엣지를 점선으로 긋는다.
 * 그다음 가장 큰 쌍으로 들어가 방향(누가 누구 법안에 서명했나)을 보여준다.
 */
const TOP = D.cosponsor.reduce((m, e) => (e.bills > m.bills ? e : m));

export const Cosponsor: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const t = copyFor(lang);
  const a = NODE.get(TOP.a)!;
  const b = NODE.get(TOP.b)!;
  const focus = interpolate(frame, [BAR * 2.5, BAR * 3.3], [0, 1], { ...clamp, easing: Easing.bezier(0.6, 0, 0.2, 1) });
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const camera = { cx: lerp(W / 2, mx, focus), cy: lerp(H / 2 + 120, my + 60, focus), zoom: lerp(0.9, 2.6, focus) };

  const nodes: DrawNode[] = D.nodes.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
    r: radius(n.id),
    party: n.party,
    opacity: n.id === TOP.a || n.id === TOP.b ? 1 : 1 - 0.7 * focus,
  }));

  const curated: DrawEdge[] = D.links.map((l) => {
    const p = NODE.get(l.a)!;
    const q = NODE.get(l.b)!;
    return { key: `${l.a}|${l.b}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y, color: '#64748b', width: 2.5, opacity: 0.18 * (1 - focus) };
  });

  const measured: DrawEdge[] = D.cosponsor.map((e, i) => {
    // 서명한 쪽(initiator)에서 상대 쪽으로 긋는다 — 방향이 없으면 a 에서
    const [s, d] = e.initiator === 'b' ? [NODE.get(e.b)!, NODE.get(e.a)!] : [NODE.get(e.a)!, NODE.get(e.b)!];
    const p = interpolate(frame, [30 + i * 1.6, 30 + i * 1.6 + 30], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const isTop = e === TOP;
    return {
      key: `c-${e.a}|${e.b}`,
      x1: s.x,
      y1: s.y,
      x2: lerp(s.x, d.x, p),
      y2: lerp(s.y, d.y, p),
      color: e.crossParty ? C.bridge : C.cosponsor,
      width: (isTop ? 4 + 6 * focus : 2 + Math.min(e.bills, 40) / 10) / (isTop ? 1 : 1),
      opacity: p > 0 ? (isTop ? 0.9 : 0.75 * (1 - 0.85 * focus)) : 0,
      dash: DASH.cosponsor,
    };
  });

  // 확대 후 방향 화살표 — 실제 반지름만큼 끝을 당겨 노드 위에 얹히지 않게
  const arrow: DrawEdge[] = [];
  if (focus > 0.5 && TOP.initiator) {
    const [s, d] = TOP.initiator === 'b' ? [b, a] : [a, b];
    const len = Math.hypot(d.x - s.x, d.y - s.y);
    const ux = (d.x - s.x) / len;
    const uy = (d.y - s.y) / len;
    arrow.push({
      key: 'arrow',
      x1: s.x + ux * (radius(s.id) + 20),
      y1: s.y + uy * (radius(s.id) + 20),
      x2: d.x - ux * (radius(d.id) + 30),
      y2: d.y - uy * (radius(d.id) + 30),
      color: C.cosponsor,
      width: 4,
      opacity: interpolate(focus, [0.5, 1], [0, 1]),
      arrow: true,
    });
  }

  const labels: DrawLabel[] = [a, b].map((n) => ({
    key: n.id,
    x: n.x,
    y: n.y + radius(n.id) + 60 / camera.zoom + 10,
    text: lang === 'ko' ? n.ko : n.en,
    opacity: focus,
    size: 64,
  }));

  return (
    <AbsoluteFill>
      <Backdrop warm={0.5} />
      <Graph nodes={nodes} edges={[...curated, ...measured, ...arrow]} labels={labels} camera={camera} />
      <Vignette />
      <Scrim from="top" strength={0.95} />
      <AbsoluteFill style={{ padding: '190px 260px 0' }}>
        <Kicker text="CO-SPONSORSHIP · 119TH CONGRESS" at={0} />
        <div style={{ height: 30 }} />
        <Rise text={t.cosTitle} at={6} size={150} out={BAR * 2.5} />
        <div style={{ height: 16 }} />
        <Rise text={t.cosSub} at={28} size={66} weight={500} color={C.sub} stagger={2} out={BAR * 2.5} />
        <div style={{ height: 12 }} />
        <Rise text={t.cosDashed} at={90} size={58} weight={500} color={C.cosponsor} stagger={2} out={BAR * 2.5} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '0 260px 190px', justifyContent: 'flex-end' }}>
        <div style={{ opacity: interpolate(frame, [BAR * 3.2, BAR * 3.5], [0, 1], clamp) }}>
          <div style={{ fontFamily: MONO, fontSize: 56, color: C.cosponsor, letterSpacing: '0.1em' }}>{t.cosPair}</div>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 190, color: C.ink, letterSpacing: '-0.03em' }}>{t.cosBills}</div>
          <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 66, color: C.sub, marginTop: 10 }}>{t.cosDir}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
