import type React from 'react';
import { C, H, SANS, W } from '../theme';

export type DrawNode = { id: string; x: number; y: number; r: number; party: string; opacity: number; ring?: string; ringWidth?: number };
export type DrawEdge = { key: string; x1: number; y1: number; x2: number; y2: number; color: string; width: number; opacity: number; dash?: string; arrow?: boolean };
export type DrawLabel = { key: string; x: number; y: number; text: string; opacity: number; size?: number; color?: string; weight?: number };

const GRAD: Record<string, [string, string, string]> = {
  R: ['#ffb3ba', C.R, '#8f1d2a'],
  D: ['#b9d3ff', C.D, '#1d3f8f'],
  I: ['#e1d5ff', C.I, '#4b3a8f'],
  X: ['#ffffff', C.X, '#5b6578'],
};

/**
 * 고정 좌표 그래프. 카메라는 (cx, cy) 를 화면 중앙에 두고 zoom 배로 본다.
 * 물리 시뮬레이션은 준비 단계에서 끝났다 — 프레임마다 같은 그림이 나와야 한다.
 */
export const Graph: React.FC<{
  nodes: DrawNode[];
  edges: DrawEdge[];
  labels?: DrawLabel[];
  camera?: { cx: number; cy: number; zoom: number };
  opacity?: number;
}> = ({ nodes, edges, labels = [], camera = { cx: W / 2, cy: H / 2, zoom: 1 }, opacity = 1 }) => {
  const { cx, cy, zoom } = camera;
  const tf = `translate(${W / 2} ${H / 2}) scale(${zoom}) translate(${-cx} ${-cy})`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, opacity }}>
      <defs>
        {Object.entries(GRAD).map(([k, [hi, mid, lo]]) => (
          <radialGradient key={k} id={`g-${k}`} cx="0.36" cy="0.3" r="0.75">
            <stop offset="0" stopColor={hi} />
            <stop offset="0.45" stopColor={mid} />
            <stop offset="1" stopColor={lo} />
          </radialGradient>
        ))}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.cosponsor} />
        </marker>
      </defs>
      <g transform={tf}>
        {edges.map((e) =>
          e.opacity <= 0.001 ? null : (
            <line
              key={e.key}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={e.color}
              strokeWidth={e.width}
              strokeOpacity={e.opacity}
              strokeDasharray={e.dash}
              strokeLinecap="round"
              markerEnd={e.arrow ? 'url(#arrow)' : undefined}
            />
          )
        )}
        {nodes.map((n) =>
          n.opacity <= 0.001 || n.r <= 0.1 ? null : (
            <g key={n.id} opacity={n.opacity}>
              {n.ring ? (
                <circle cx={n.x} cy={n.y} r={n.r + 14} fill="none" stroke={n.ring} strokeWidth={n.ringWidth ?? 6} filter="url(#glow)" />
              ) : null}
              <circle cx={n.x} cy={n.y} r={n.r} fill={`url(#g-${n.party in GRAD ? n.party : 'X'})`} />
            </g>
          )
        )}
        {labels.map((l) =>
          l.opacity <= 0.001 ? null : (
            <text
              key={l.key}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fontFamily={SANS}
              fontWeight={l.weight ?? 700}
              fontSize={(l.size ?? 34) / zoom}
              fill={l.color ?? C.ink}
              opacity={l.opacity}
              stroke="#05080f"
              strokeWidth={10 / zoom}
              paintOrder="stroke"
            >
              {l.text}
            </text>
          )
        )}
      </g>
    </svg>
  );
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 결정적 의사난수 — 같은 id 는 항상 같은 값 */
export const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

export const DASH: Record<string, string | undefined> = {
  feud: '16 12',
  family: '4 10',
  mentor: '8 16',
  cosponsor: '18 14',
};
