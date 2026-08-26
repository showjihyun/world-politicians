import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { FACTION_MAP } from '../data/factions';
import { PARTY_COLOR } from '../lib/colors';
import { REL_META } from '../types';
import { useVisibleGraph } from '../hooks/useVisibleGraph';
import type { GraphLink, GraphNode } from '../lib/graph';

type FG3 = {
  cameraPosition: (
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number
  ) => void;
  zoomToFit: (ms?: number, px?: number) => void;
} | null;

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const font = '600 40px Pretendard, system-ui, sans-serif';
  const measureCtx = canvas.getContext('2d')!;
  measureCtx.font = font;
  const w = measureCtx.measureText(text).width;
  canvas.width = Math.ceil(w + 48);
  canvas.height = 76;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#eef3fb';
  ctx.fillText(text, 24, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  const scale = 26;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  sprite.position.set(0, 15, 0);
  return sprite;
}

export default function GraphView3D() {
  const fgRef = useRef<FG3>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });

  const graph = useStore((s) => s.graph);
  const selectedId = useStore((s) => s.selectedId);
  const colorMode = useStore((s) => s.colorMode);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);

  const { locale } = useI18n();
  const { visibleNodes, visibleLinks, visibleLinkIds } = useVisibleGraph();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(
    () => ({
      nodes: graph,
      links: visibleLinks as never[],
    }),
    [graph, visibleLinks]
  );

  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(900, 90), 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!selectedId || !fgRef.current) return;
    const n = graph.find((g) => g.id === selectedId);
    if (!n || n.x == null || Number.isNaN(n.x ?? NaN)) return;
    const dist = 190;
    fgRef.current.cameraPosition(
      { x: n.x + dist, y: (n.y ?? 0) + dist / 2.4, z: (n.z ?? 0) + dist },
      { x: n.x, y: n.y ?? 0, z: n.z ?? 0 },
      800
    );
  }, [selectedId, graph]);

  const nodeColorOf = (node: GraphNode): string =>
    colorMode === 'party'
      ? PARTY_COLOR[node.party]
      : (FACTION_MAP[node.faction]?.color ?? PARTY_COLOR[node.party]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <ForceGraph3D
        key={locale}
        ref={fgRef as never}
        width={size.w}
        height={size.h}
        graphData={data as never}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        nodeVisibility={(nRaw: unknown) =>
          visibleNodes.has((nRaw as GraphNode).id)
        }
        nodeRelSize={5}
        nodeThreeObject={(nRaw: unknown) => {
          const n = nRaw as GraphNode;
          const group = new THREE.Group();
          const r = 3.2 + n.prominence * 0.75;
          const isSel = n.id === selectedId;
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(nodeColorOf(n)),
            transparent: true,
            opacity: n.status === 'legacy' ? 0.55 : 0.92,
          });
          group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), mat));
          const haloMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(isSel ? '#fbbf24' : nodeColorOf(n)),
            transparent: true,
            opacity: isSel ? 0.26 : 0.1,
          });
          group.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 16, 16), haloMat));
          group.add(makeLabelSprite(locale === 'ko' ? n.name.ko : n.name.en));
          return group;
        }}
        linkColor={(lRaw: unknown) => REL_META[(lRaw as unknown as GraphLink).rel.type].color + '99'}
        linkWidth={(lRaw: unknown) => 0.4 + (lRaw as unknown as GraphLink).rel.strength * 0.6}
        linkVisibility={(lRaw: unknown) =>
          visibleLinkIds.has((lRaw as unknown as GraphLink).id)
        }
        linkDirectionalParticles={(lRaw: unknown) =>
          (lRaw as unknown as GraphLink).rel.type === 'feud' ? 3 : 1
        }
        linkDirectionalParticleSpeed={() => 0.006}
        linkDirectionalParticleWidth={(lRaw: unknown) =>
          1.6 + (lRaw as unknown as GraphLink).rel.strength
        }
        onNodeClick={(nRaw: unknown) => select((nRaw as GraphNode).id)}
        onNodeHover={(nRaw: unknown) => {
          hover(nRaw ? (nRaw as GraphNode).id : null);
          document.body.style.cursor = nRaw ? 'pointer' : 'default';
        }}
        onBackgroundClick={() => select(null)}
        warmupTicks={40}
      />
    </div>
  );
}
