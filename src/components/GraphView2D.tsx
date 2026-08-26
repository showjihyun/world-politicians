import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/uiStore';
import { useI18n } from '../i18n';
import { FACTION_MAP } from '../data/factions';
import { PARTY_COLOR, COLORS } from '../lib/colors';
import { REL_META } from '../types';
import { useVisibleGraph } from '../hooks/useVisibleGraph';
import { rotateNodes } from '../lib/graph';
import NodeTooltip from './NodeTooltip';
import type { GraphLink, GraphNode } from '../lib/graph';

type FG = {
  centerAt: (x: number, y: number, ms?: number) => void;
  zoom: (k: number, ms?: number) => void;
  zoomToFit: (ms?: number, px?: number, nodeFilter?: (n: unknown) => boolean) => void;
  d3Force: (name: string, force?: unknown) => unknown;
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
  const autoRotate2d = useUIStore((s) => s.autoRotate2d);
  const { visibleNodes, visibleLinks, visibleLinkIds } = useVisibleGraph();

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

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

  // 링크가 없는(또는 약한) 노드는 charge 반발만 받아 화면 밖으로 밀려난다.
  // 그 노드들이 bbox 를 부풀려 zoomToFit 이 군집을 화면 구석에 작게 배치하므로,
  // 원점으로 당기는 약한 힘을 걸어 레이아웃 자체를 모아둔다.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg?.d3Force) return;
    let simNodes: GraphNode[] = [];
    const pullToCenter = (alpha: number) => {
      for (const n of simNodes) {
        if (n.x == null || n.y == null) continue;
        n.vx = (n.vx ?? 0) - n.x * 0.06 * alpha;
        n.vy = (n.vy ?? 0) - n.y * 0.06 * alpha;
      }
    };
    (pullToCenter as unknown as { initialize: (n: GraphNode[]) => void }).initialize = (n) => {
      simNodes = n;
    };
    fg.d3Force('polarisCenter', pullToCenter);
  }, []);

  // 숨겨진·고립 노드까지 bbox 에 넣으면 그래프가 한쪽 구석에 작게 남는다.
  // zoomToFit 의 nodeFilter 로 실제 보이는 노드만 기준 삼는다.
  const fitVisible = useCallback(
    (ms: number) =>
      fgRef.current?.zoomToFit(ms, 80, (n) =>
        visibleNodes.has((n as GraphNode).id)
      ),
    [visibleNodes]
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

  // 자동 회전
  useEffect(() => {
    if (!autoRotate2d) return;
    const id = setInterval(() => rotateNodes(graph, 0.8), 50);
    return () => clearInterval(id);
  }, [autoRotate2d, graph]);

  useEffect(() => {
    if (!selectedId || !fgRef.current) return;
    const n = graph.find((g) => g.id === selectedId);
    if (!n || n.x == null || n.y == null || Number.isNaN(n.x) || Number.isNaN(n.y)) return;
    fgRef.current.centerAt(n.x, n.y, 700);
    fgRef.current.zoom(2.4, 700);
  }, [selectedId, graph]);

  const neighborSet = useMemo(() => {
    const focus = hoveredId ?? selectedId;
    if (!focus) return new Set<string>();
    return adjacency.get(focus) ?? new Set<string>();
  }, [hoveredId, selectedId, adjacency]);

  const focusActive = hoveredId != null || selectedId != null;

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
    const alpha = dimmed ? 0.08 : node.status === 'legacy' ? 0.85 : 1;
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

    if (globalScale > 1.35 || node.prominence >= 9 || isHover) {
      const fs = (isHover ? 13.5 : 12) / globalScale + 2 / globalScale;
      ctx.font = `600 ${fs}px Pretendard, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = locale === 'ko' ? node.name.ko : node.name.en;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(5,7,15,0.72)';
      ctx.fillRect(x - tw / 2 - 3 / globalScale, y + r + 2, tw + 6 / globalScale, fs * 1.3);
      ctx.fillStyle = isHover || id === selectedId ? '#ffffff' : '#cdd7e8';
      ctx.fillText(label, x, y + r + 3);
    }

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
        nodeVisibility={(nRaw) => visibleNodes.has((nRaw as unknown as GraphNode).id)}
        nodeRelSize={4}
        nodeCanvasObject={(nodeRaw, ctx, globalScale) => {
          const node = nodeRaw as unknown as GraphNode;
          paintNode(node, ctx, globalScale, node.id === hoveredId);
        }}
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
          if (focusActive) {
            const touch =
              sid(l.source) === hoveredId ||
              sid(l.source) === selectedId ||
              sid(l.target) === hoveredId ||
              sid(l.target) === selectedId;
            if (!touch) return 'rgba(148,163,184,0.05)';
          }
          return REL_META[l.rel.type].color + 'b3';
        }}
        linkWidth={(lRaw) => {
          const l = lRaw as unknown as GraphLink;
          const w = 0.5 + l.rel.strength * 0.75;
          return l.id === selectedLinkId ? w + 1.6 : w;
        }}
        linkLineDash={(lRaw) => REL_META[(lRaw as unknown as GraphLink).rel.type].dash ?? null}
        linkVisibility={(lRaw) => visibleLinkIds.has((lRaw as unknown as GraphLink).id)}
        linkDirectionalParticles={(lRaw) => {
          const l = lRaw as unknown as GraphLink;
          return l.rel.type === 'feud' ? 2 + l.rel.strength : l.rel.strength - 1;
        }}
        linkDirectionalParticleSpeed={() => 0.006}
        linkDirectionalParticleWidth={(lRaw) => 1.4 + (lRaw as unknown as GraphLink).rel.strength * 0.7}
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
