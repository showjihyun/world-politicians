import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/uiStore';
import { useI18n } from '../i18n';
import { FACTION_MAP } from '../data/factions';
import { PARTY_COLOR, COLORS } from '../lib/colors';
import { REL_META } from '../types';
import { useVisibleGraph } from '../hooks/useVisibleGraph';
import NodeTooltip from './NodeTooltip';
import type { GraphLink, GraphNode } from '../lib/graph';

type FG = {
  centerAt: (x: number, y: number, ms?: number) => void;
  zoom: (k: number, ms?: number) => void;
  zoomToFit: (ms?: number, px?: number) => void;
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
    const t = setTimeout(() => fgRef.current?.zoomToFit(900, 70), 1500);
    return () => {
      clearTimeout(t);
      document.body.style.cursor = 'default';
    };
  }, []);

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
      const fs = (isHover ? 12 : 10.5) / globalScale + 2 / globalScale;
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
        ctx.font = `700 ${7 / globalScale + 1}px "Fira Code", monospace`;
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
        cooldownTime={3600}
        d3VelocityDecay={0.32}
        warmupTicks={60}
      />
    </div>
  );
}
