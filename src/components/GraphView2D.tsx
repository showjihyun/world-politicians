import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/uiStore';
import { useI18n } from '../i18n';
import { centerOnClear, clearArea, frameToArea, type Panel } from '../domain/viewport';
import { placeLabels, type LabelBox } from '../domain/labels';
import { FACTION_MAP } from '../data/factions';
import { PARTY_COLOR, COLORS } from '../lib/colors';
import { REL_META } from '../types';
import { useVisibleGraph } from '../hooks/useVisibleGraph';
import { createCenteringForce, rotateNodes } from '../lib/graph';
import NodeTooltip from './NodeTooltip';
import type { GraphLink, GraphNode } from '../lib/graph';

type FG = {
  centerAt: (x: number, y: number, ms?: number) => void;
  zoom: (k: number, ms?: number) => void;
  zoomToFit: (ms?: number, px?: number, nodeFilter?: (n: unknown) => boolean) => void;
  d3Force: (name: string, force?: unknown) => unknown;
  graph2ScreenCoords: (x: number, y: number) => { x: number; y: number };
} | null;

function sid(n: unknown): string {
  return typeof n === 'string' ? n : ((n as { id: string }).id);
}

function lighten(hex: string, amt: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 255) + 255 * amt);
  const g = Math.min(255, ((num >> 8) & 255) + 255 * amt);
  const b = Math.min(255, (num & 255) + 255 * amt);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export default function GraphView2D() {
  const fgRef = useRef<FG>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const graph = useStore((s) => s.graph);
  const selectedId = useStore((s) => s.selectedId);
  const hoveredId = useStore((s) => s.hoveredId);
  const adjacency = useStore((s) => s.adjacency);
  const colorMode = useStore((s) => s.colorMode);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);
  const selectLink = useStore((s) => s.selectLink);
  const selectedLinkId = useStore((s) => s.selectedLinkId);

  const { locale } = useI18n();
  const langMode = useUIStore((s) => s.langMode);
  const { visibleNodes, visibleLinks, visibleLinkIds, linkedNodes, relFilterActive } =
    useVisibleGraph();

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  /**
   * 현재 줌 배율.
   *
   * 링크 폭과 입자 폭은 **그래프 단위**라 확대하면 화면에서 그대로 커진다. 배율 12쯤
   * 되면 선 하나가 화면을 덮고, 그걸 매 프레임 채우느라 한 프레임이 67ms 가 된다
   * (2560×1440 dpr2 실측 15fps). 노드를 안 그려도, 라벨을 안 그려도 그대로였고
   * 링크 폭만 줄이면 12ms 로 떨어졌다 — 선의 면적이 비용의 전부다.
   *
   * 그래서 확대할 때는 **화면 폭을 고정한다.** 축소는 건드리지 않는다(k<1 에서 선이
   * 더 얇아지면 오히려 안 보인다). ref 에 담아 React 리렌더를 일으키지 않는다.
   */
  const zoomRef = useRef(1);
  /** 확대 시 폭이 커지지 않게 나눌 값. 축소(k<1)에서는 1 이라 현재 동작 그대로다 */
  const widthScale = () => Math.max(1, zoomRef.current);

  const hoveredNode = useMemo(
    () => (hoveredId ? graph.find((g) => g.id === hoveredId) ?? null : null),
    [hoveredId, graph]
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // 엔진이 멈추지 않는 경우를 위한 안전망 — 정상 경로는 onEngineStop 의 fitVisible
    const t = setTimeout(() => fitVisible(900), 4200);
    return () => {
      clearTimeout(t);
      document.body.style.cursor = 'default';
    };
  }, []);

  // Ctrl(⌘) + 드래그로 그래프 회전.
  // force-graph 캔버스가 자체적으로 pan/drag 를 처리하므로 capture 단계에서 가로채
  // 수정키가 눌린 동안에는 캔버스로 이벤트가 내려가지 않게 한다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let lastAngle: number | null = null;
    // 드래그 시작에 한 번만 잡는다 — 회전은 중심점 기준이라 중심이 움직이지 않고,
    // pointermove 마다 전 노드를 순회하고 getBoundingClientRect 로 레이아웃을
    // 강제하면 드래그가 눈에 띄게 무거워진다.
    let origin = { left: 0, top: 0, px: 0, py: 0 };

    /** 회전 중심(노드 중심점)의 화면 좌표 — 구할 수 없으면 캔버스 중앙 */
    const measureOrigin = () => {
      const r = el.getBoundingClientRect();
      const withPos = graph.filter((n) => n.x != null && n.y != null);
      if (!withPos.length || !fgRef.current?.graph2ScreenCoords) {
        return { left: r.left, top: r.top, px: r.width / 2, py: r.height / 2 };
      }
      let cx = 0;
      let cy = 0;
      for (const n of withPos) {
        cx += n.x!;
        cy += n.y!;
      }
      const p = fgRef.current.graph2ScreenCoords(cx / withPos.length, cy / withPos.length);
      return { left: r.left, top: r.top, px: p.x, py: p.y };
    };

    const angleAt = (e: PointerEvent) =>
      Math.atan2(e.clientY - origin.top - origin.py, e.clientX - origin.left - origin.px);

    const rotating = (e: PointerEvent) => e.ctrlKey || e.metaKey;

    const onDown = (e: PointerEvent) => {
      if (!rotating(e)) return;
      e.stopPropagation();
      e.preventDefault();
      origin = measureOrigin();
      lastAngle = angleAt(e);
      el.setPointerCapture?.(e.pointerId);
      document.body.style.cursor = 'grabbing';
    };

    const onMove = (e: PointerEvent) => {
      if (lastAngle == null) return;
      e.stopPropagation();
      e.preventDefault();
      const a = angleAt(e);
      let d = a - lastAngle;
      // -π..π 로 정규화 — 안 하면 경계를 넘을 때 한 바퀴 튄다
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      rotateNodes(graph, (d * 180) / Math.PI);
      lastAngle = a;
    };

    const onUp = (e: PointerEvent) => {
      if (lastAngle == null) return;
      lastAngle = null;
      el.releasePointerCapture?.(e.pointerId);
      document.body.style.cursor = 'default';
    };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, true);
    el.addEventListener('pointerup', onUp, true);
    el.addEventListener('pointercancel', onUp, true);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove, true);
      el.removeEventListener('pointerup', onUp, true);
      el.removeEventListener('pointercancel', onUp, true);
    };
  }, [graph]);

  // 링크가 없는(또는 약한) 노드는 charge 반발만 받아 화면 밖으로 밀려난다.
  // 그 노드들이 bbox 를 부풀려 zoomToFit 이 군집을 화면 구석에 작게 배치하므로,
  // 원점으로 당기는 약한 힘을 걸어 레이아웃 자체를 모아둔다.
  useEffect(() => {
    fgRef.current?.d3Force?.('polarisCenter', createCenteringForce());
  }, []);

  // 숨겨진 노드를 bbox 에 넣으면 그래프가 한쪽 구석에 작게 남는다 → 보이는 것만.
  // 여기에 더해, 멀리 떨어진 소수의 노드까지 전부 담으려다 보면 정작 본 군집이
  // 화면 대비 작게 잡힌다(모니터가 클수록 심하다). 중심에서 먼 상위 몇 %는
  // 프레이밍 기준에서 빼고 본 덩어리를 화면에 채운다. 뺀 노드는 패닝으로 볼 수 있다.
/**
 * 패널이 비워 준 영역을 잰다.
 *
 * 폭을 여기 옮겨 적지 않는다 — 클래스가 바뀌면 그 값이 조용히 낡는다.
 * 패널 쪽에 data-graph-inset 만 달아 두고 실제 사각형을 읽는다.
 */
function measurePanels(): Panel[] {
  const out: Panel[] = [];
  for (const el of document.querySelectorAll('[data-graph-inset]')) {
    const side = el.getAttribute('data-graph-inset');
    if (side !== 'left' && side !== 'right' && side !== 'top' && side !== 'bottom') continue;
    const b = el.getBoundingClientRect();
    out.push({ side, rect: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } });
  }
  return out;
}
  const CORE_RATIO = 0.97;

  /** 캔버스와, 패널이 비워 준 영역. 둘 다 화면 px. */
  const areas = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const canvas = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    return { canvas, clear: clearArea(canvas, measurePanels()) };
  }, []);

  const fitVisible = useCallback(
    (ms: number) => {
      const fg = fgRef.current;
      if (!fg) return;
      const pts = graph.filter(
        (n) => visibleNodes.has(n.id) && n.x != null && n.y != null
      );
      if (!pts.length) return;

      // 멀리 떨어진 소수까지 담으려다 본 군집이 화면 대비 작게 잡힌다.
      // 중심에서 먼 상위 몇 %는 프레이밍에서 빼고 본 덩어리를 채운다.
      const cx = pts.reduce((a, n) => a + n.x!, 0) / pts.length;
      const cy = pts.reduce((a, n) => a + n.y!, 0) / pts.length;
      const dists = pts.map((n) => Math.hypot(n.x! - cx, n.y! - cy)).sort((a, b) => a - b);
      const cutoff = dists[Math.floor((dists.length - 1) * CORE_RATIO)];
      const core = pts.length < 8 ? pts : pts.filter((n) => Math.hypot(n.x! - cx, n.y! - cy) <= cutoff);
      const use = core.length ? core : pts;

      const bbox = {
        minX: Math.min(...use.map((n) => n.x!)),
        maxX: Math.max(...use.map((n) => n.x!)),
        minY: Math.min(...use.map((n) => n.y!)),
        maxY: Math.max(...use.map((n) => n.y!)),
      };

      const a = areas();
      if (!a) return;
      // zoomToFit 은 캔버스 전체에 맞춘다. 그래서 절반 가까이가 패널 뒤로
      // 들어갔다 — 비어 있는 영역에 맞춰야 한다.
      const f = frameToArea(bbox, a.canvas, a.clear, 70);
      fg.centerAt(f.centerX, f.centerY, ms);
      fg.zoom(f.zoom, ms);
    },
    [graph, visibleNodes, areas]
  );

  // 시뮬레이션이 안정되면 노드를 고정(fx/fy) — 회전이 레이아웃을 흐트러뜨리지 않도록.
  // onEngineStop 은 ref 메서드가 아니라 prop 이므로 아래 ForceGraph2D 에 직접 전달한다.
  const pinNodes = useCallback(() => {
    for (const n of graph) {
      if (n.x != null && n.y != null) {
        n.fx = n.x;
        n.fy = n.y;
      }
    }
    // 레이아웃이 최종 확정된 이 시점에 맞춰야 그래프가 화면 중앙에 꽉 찬다.
    // (고정 타이머로 맞추면 아직 퍼지는 중인 좌표에 맞춰져 한쪽으로 쏠린 채 남는다)
    fitVisible(700);
  }, [graph, fitVisible]);

  useEffect(() => {
    if (!selectedId || !fgRef.current) return;
    const n = graph.find((g) => g.id === selectedId);
    if (!n || n.x == null || n.y == null || Number.isNaN(n.x) || Number.isNaN(n.y)) return;
    const ZOOM = 2.4;
    const a = areas();
    // 드로어가 열리면서 오른쪽 392px 가 덮인다. 그냥 좌표를 넘기면 고른 인물이
    // 그 뒤에 놓인다 — 정작 보라고 연 패널이 대상을 가린다.
    const c = a ? centerOnClear(n.x, n.y, a.canvas, a.clear, ZOOM) : { centerX: n.x, centerY: n.y };
    fgRef.current.centerAt(c.centerX, c.centerY, 700);
    fgRef.current.zoom(ZOOM, 700);
  }, [selectedId, graph, areas]);

  const neighborSet = useMemo(() => {
    const focus = hoveredId ?? selectedId;
    if (!focus) return new Set<string>();
    return adjacency.get(focus) ?? new Set<string>();
  }, [hoveredId, selectedId, adjacency]);

  const focusActive = hoveredId != null || selectedId != null;
  /** 링크가 지금 주목 중인 노드(hover/선택)에 붙어 있는가 */
  const touchesFocus = (l: GraphLink) =>
    sid(l.source) === hoveredId ||
    sid(l.source) === selectedId ||
    sid(l.target) === hoveredId ||
    sid(l.target) === selectedId;

  const nodeColorOf = (node: GraphNode): string =>
    colorMode === 'party'
      ? PARTY_COLOR[node.party]
      : (FACTION_MAP[node.faction]?.color ?? PARTY_COLOR[node.party]);

  const data = useMemo(
    () => ({
      nodes: graph,
      links: visibleLinks as never[],
    }),
    [graph, visibleLinks]
  );

  const paintNode = (
    node: GraphNode,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
    isHover: boolean
  ) => {
    const id = node.id;
    const dimmed =
      focusActive && !(id === hoveredId || id === selectedId || neighborSet.has(id));
    // 범례에서 관계 유형을 끄면 남은 관계가 없는 노드는 어둡게 — 무엇이 걸러졌는지 보이게
    const relDimmed = relFilterActive && !linkedNodes.has(id);
    const alpha = dimmed ? 0.08 : relDimmed ? 0.16 : node.status === 'legacy' ? 0.85 : 1;
    const r = 4 + node.prominence * 1.15;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const baseColor = nodeColorOf(node);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (isHover || id === selectedId) {
      const pulse = 2 + Math.sin(Date.now() / 300) * 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r + 6 + pulse, 0, 2 * Math.PI);
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 1.4 / globalScale + 0.8;
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.9, 0, 2 * Math.PI);
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.globalAlpha = alpha;
    }

    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    grad.addColorStop(0, lighten(baseColor, 0.45));
    grad.addColorStop(1, baseColor);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.fill();

    if (node.status === 'legacy') {
      ctx.setLineDash([3 / globalScale, 2 / globalScale]);
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(230,237,247,0.55)';
      ctx.lineWidth = 1 / globalScale + 0.3;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 라벨은 여기서 그리지 않는다 — paintLabels 가 프레임 끝에 한 번에 그린다.
    // 노드마다 그리면 서로를 몰라 반드시 겹친다.

    if (globalScale > 2.6 && node.prominence >= 6) {
      const f = FACTION_MAP[node.faction];
      if (f) {
        ctx.font = `700 ${8 / globalScale + 1}px "Fira Code", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(5,7,15,0.92)';
        ctx.fillText(f.short, x, y + 0.5);
      }
    }

    ctx.restore();
  };


  /** 노드 반지름 — paintNode 와 같은 식이어야 라벨이 노드에 붙는다 */
  const radiusOf = (n: GraphNode) => 4 + n.prominence * 1.15;

  // 몇 개를 놓았는지 밖에서 셀 수 있게 남긴다. 라벨은 캔버스에 그려져 DOM 으로
  // 볼 수 없고, 픽셀로 세면 위아래로 나란한 두 줄을 한 덩어리로 읽어 겹쳤다고
  // 잘못 판정한다. 프레임마다 쓰면 비싸므로 수가 바뀔 때만 쓴다.
  const labelCountRef = useRef(-1);

  /**
   * 라벨을 프레임 끝에 한 번에 그린다.
   *
   * 노드마다 그리면 서로를 몰라 반드시 겹친다 — 중앙 군집에서 이름이 서로를 덮어
   * 읽을 수 없었다. 여기서는 전체를 볼 수 있으니 중요한 것부터 놓고 자리가 없으면
   * 건너뛴다. 건너뛴 이름은 확대하거나 커서를 올리면 나온다.
   *
   * 주목 중인 노드가 있으면 그 노드와 이웃만 그린다. 나머지는 alpha 0.08 로 이미
   * 거의 안 보이는데, 그리면 자리만 차지해 정작 봐야 할 이름을 밀어낸다.
   */
  const paintLabels = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      const fontOf = (hover: boolean) => (hover ? 13.5 : 12) / globalScale + 2 / globalScale;
      const nameOf = (n: GraphNode) => (locale === 'ko' ? n.name.ko : n.name.en);

      const shown = graph.filter((n) => {
        if (!visibleNodes.has(n.id) || n.x == null || n.y == null) return false;
        if (relFilterActive && !linkedNodes.has(n.id)) return false;
        if (!focusActive) return true;
        return n.id === hoveredId || n.id === selectedId || neighborSet.has(n.id);
      });

      // 앞선 것이 자리를 이긴다. 커서를 올린 노드가 맨 앞이라 그 이름은 언제나 남는다.
      const rank = (n: GraphNode) =>
        n.id === hoveredId ? 0 : n.id === selectedId ? 1 : neighborSet.has(n.id) ? 2 : 3;
      const ordered = [...shown].sort(
        (a, b) => rank(a) - rank(b) || b.prominence - a.prominence || a.id.localeCompare(b.id)
      );

      const boxes: LabelBox[] = ordered.map((n) => {
        const fs = fontOf(n.id === hoveredId);
        ctx.font = `600 ${fs}px Pretendard, system-ui, sans-serif`;
        const tw = ctx.measureText(nameOf(n)).width;
        const left = n.x! - tw / 2 - 3 / globalScale;
        const top = n.y! + radiusOf(n) + 2;
        return { id: n.id, left, top, right: left + tw + 6 / globalScale, bottom: top + fs * 1.3 };
      });

      // 딱 붙으면 겹치지 않아도 두 이름이 한 덩어리로 보인다 — 화면상 3px 를 띄운다.
      const keep = placeLabels(boxes, 3 / globalScale);
      if (labelCountRef.current !== keep.size) {
        labelCountRef.current = keep.size;
        wrapRef.current?.setAttribute('data-labels', String(keep.size));
        wrapRef.current?.setAttribute('data-label-candidates', String(ordered.length));
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < ordered.length; i++) {
        const n = ordered[i];
        if (!keep.has(n.id)) continue;
        const b = boxes[i];
        const hover = n.id === hoveredId;
        const fs = fontOf(hover);
        ctx.save();
        ctx.globalAlpha = n.status === 'legacy' ? 0.85 : 1;
        ctx.font = `600 ${fs}px Pretendard, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(5,7,15,0.72)';
        ctx.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
        ctx.fillStyle = hover || n.id === selectedId ? '#ffffff' : '#cdd7e8';
        ctx.fillText(nameOf(n), n.x!, n.y! + radiusOf(n) + 3);
        ctx.restore();
      }
    },
    [
      graph,
      visibleNodes,
      hoveredId,
      selectedId,
      neighborSet,
      focusActive,
      relFilterActive,
      linkedNodes,
      locale,
    ]
  );
  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-mode={langMode}
      onMouseMove={(e) => {
        const r = wrapRef.current?.getBoundingClientRect();
        if (r) setMouse({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setMouse(null)}
    >
      {mouse && (
        <NodeTooltip node={hoveredNode} x={mouse.x} y={mouse.y} />
      )}
      <ForceGraph2D
        ref={fgRef as never}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel={() => ''}
        nodeVisibility={(nRaw) => visibleNodes.has((nRaw as unknown as GraphNode).id)}
        nodeRelSize={4}
        nodeCanvasObject={(nodeRaw, ctx, globalScale) => {
          const node = nodeRaw as unknown as GraphNode;
          paintNode(node, ctx, globalScale, node.id === hoveredId);
        }}
        onRenderFramePost={paintLabels}
        nodePointerAreaPaint={(node, color, ctx) => {
          const n = node as unknown as GraphNode;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, 6 + n.prominence * 1.3, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={(lRaw) => {
          const l = lRaw as unknown as GraphLink;
          if (l.id === selectedLinkId) return '#ffffff';
          if (focusActive && !touchesFocus(l)) return 'rgba(148,163,184,0.05)';
          return REL_META[l.rel.type].color + 'b3';
        }}
        onZoom={({ k }) => {
          zoomRef.current = k;
        }}
        linkWidth={(lRaw) => {
          const l = lRaw as unknown as GraphLink;
          const w = 0.5 + l.rel.strength * 0.75;
          // 확대해도 화면 폭을 유지한다 — 그래프 단위로 두면 선의 면적이 배율만큼
          // 커져서 확대할수록 프레임이 무거워진다
          return (l.id === selectedLinkId ? w + 1.6 : w) / widthScale();
        }}
        linkLineDash={(lRaw) => REL_META[(lRaw as unknown as GraphLink).rel.type].dash ?? null}
        linkVisibility={(lRaw) => visibleLinkIds.has((lRaw as unknown as GraphLink).id)}
        linkDirectionalParticles={(lRaw) => {
          const l = lRaw as unknown as GraphLink;
          // 노드를 고르면 그 노드에 붙은 엣지에만 입자를 흘린다.
          // 전체가 흐르면 무엇이 선택됐는지 오히려 읽기 어렵다.
          if (focusActive && !touchesFocus(l)) return 0;
          // **입자는 방향을 뜻한다.** 도메인이 `initiator` 로 흐르는 쪽을 정한다 —
          // feud 는 먼저 공격한 쪽, 공동발의는 더 많이 서명한 쪽이다.
          //
          // 방향을 모르는 엣지에 흘리면 없는 방향을 있다고 말하게 된다. 예전에는
          // 강도만 보고 흘려서, initiator 가 없는 동맹 113개와 공동발의 62개가
          // a→b 순서(= 데이터에 적힌 순서)로 흐르고 있었다. 그건 뜻이 아니라 우연이다.
          if (!l.rel.initiator) return 0;
          return l.rel.type === 'feud' ? 2 + l.rel.strength : l.rel.strength;
        }}
        linkDirectionalParticleSpeed={() => 0.006}
        linkDirectionalParticleWidth={(lRaw) =>
          (1.4 + (lRaw as unknown as GraphLink).rel.strength * 0.7) / widthScale()
        }
        linkDirectionalParticleColor={(lRaw) => REL_META[(lRaw as unknown as GraphLink).rel.type].color}
        linkCurvature={0.12}
        onNodeClick={(nRaw) => select((nRaw as unknown as GraphNode).id)}
        onNodeHover={(nRaw) => {
          hover(nRaw ? (nRaw as unknown as GraphNode).id : null);
          document.body.style.cursor = nRaw ? 'pointer' : 'default';
        }}
        onLinkClick={(lRaw) => {
          const l = lRaw as unknown as GraphLink;
          selectLink(l.id === selectedLinkId ? null : l.id);
        }}
        onBackgroundClick={() => select(null)}
        onEngineStop={pinNodes}
        cooldownTime={3600}
        d3VelocityDecay={0.32}
        warmupTicks={60}
      />
    </div>
  );
}
