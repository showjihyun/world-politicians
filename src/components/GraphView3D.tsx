import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import { FACTION_MAP } from '../data/factions';
import { PARTY_COLOR } from '../lib/colors';
import { REL_META } from '../types';
import { useVisibleGraph } from '../hooks/useVisibleGraph';
import { createCenteringForce } from '../lib/graph';
import { placeLabels, type LabelBox } from '../domain/labels';
import type { GraphLink, GraphNode } from '../lib/graph';

type Vec3 = { x: number; y: number; z: number };

type FG3 = {
  /** 인자 없이 부르면 현재 카메라 위치를 돌려준다 (궤도 회전에 필요) */
  cameraPosition: {
    (): Vec3;
    (pos: Vec3, lookAt?: Vec3, ms?: number): void;
  };
  /** 라벨을 화면으로 투영하려면 카메라가 필요하다 */
  camera: () => THREE.PerspectiveCamera;
  zoomToFit: (ms?: number, px?: number) => void;
  d3Force: (name: string, force?: unknown) => unknown;
} | null;

/**
 * 노드마다 SphereGeometry 를 새로 만들면 노드 수만큼 지오메트리가 쌓인다.
 * 단위 구를 하나 만들어 mesh.scale 로 크기만 바꿔 쓴다.
 */
const UNIT_SPHERE = new THREE.SphereGeometry(1, 16, 12);
const UNIT_HALO = new THREE.SphereGeometry(1, 10, 8);

const SELECTED_HALO = '#fbbf24';

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
  // 겹침은 스프라이트가 아니라 글자끼리 봐야 한다 — 캔버스에는 여백이 있다.
  sprite.userData.ink = { x: (canvas.width - 48) / canvas.width, y: 44 / canvas.height };
  const scale = 22;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  sprite.position.set(0, 15, 0);
  return sprite;
}

/** 캐시된 노드 오브젝트를 버릴 때 GPU 자원까지 해제 (공유 지오메트리는 유지) */
function disposeNodeObject(group: THREE.Group): void {
  group.traverse((o) => {
    const any = o as THREE.Mesh & THREE.Sprite;
    const mat = any.material as THREE.Material & { map?: THREE.Texture };
    if (mat) {
      mat.map?.dispose();
      mat.dispose();
    }
    const geo = (o as THREE.Mesh).geometry;
    if (geo && geo !== UNIT_SPHERE && geo !== UNIT_HALO) geo.dispose();
  });
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
  const { visibleNodes, visibleLinks, visibleLinkIds, linkedNodes, relFilterActive } =
    useVisibleGraph();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 엔진이 멈출 때마다 맞추면 사용자가 돌려놓은 카메라가 그때마다 되감긴다.
  // (뒷면을 보려고 돌려도 원래 각도로 튕겨 돌아온다) 최초 한 번만 맞춘다.
  const didFitRef = useRef(false);

  const data = useMemo(
    () => ({
      nodes: graph,
      links: visibleLinks as never[],
    }),
    [graph, visibleLinks]
  );

  // 고정 타이머로 맞추면 아직 퍼지는 중인 좌표에 맞춰진다 — 엔진이 멈춘 뒤 맞춘다.
  // (타이머는 엔진이 멈추지 않는 경우의 안전망)
  useEffect(() => {
    const t = setTimeout(() => {
      if (didFitRef.current) return;
      didFitRef.current = true;
      fgRef.current?.zoomToFit(900, 90);
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Ctrl(⌘) + 좌클릭 드래그로 카메라 궤도 회전.
  // 기본 TrackballControls 만으로는 원하는 각도까지 돌리기 어려워 뒷면을 보기 힘들다.
  // 그래프 중심을 기준으로 방위각(azimuth)을 무제한으로 돌려 뒷면까지 닿게 하고,
  // 고도각(polar)은 극점 직전까지만 — 극을 넘기면 상하가 뒤집혀 방향 감각을 잃는다.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let last: { x: number; y: number } | null = null;

    const rotating = (e: PointerEvent) => e.ctrlKey || e.metaKey;

    const onDown = (e: PointerEvent) => {
      if (!rotating(e) || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
      document.body.style.cursor = 'grabbing';
    };

    const onMove = (e: PointerEvent) => {
      if (!last) return;
      e.stopPropagation();
      e.preventDefault();
      const fg = fgRef.current;
      if (!fg?.cameraPosition) return;

      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };

      const c = fg.cameraPosition();
      const radius = Math.hypot(c.x, c.y, c.z);
      if (!radius) return;

      // 현재 카메라를 구면 좌표로 → 델타 적용 → 다시 직교 좌표
      let azimuth = Math.atan2(c.z, c.x);
      let polar = Math.acos(Math.min(1, Math.max(-1, c.y / radius)));

      const K = 0.006;
      azimuth -= dx * K;
      polar -= dy * K;

      const EPS = 0.02;
      polar = Math.min(Math.PI - EPS, Math.max(EPS, polar));

      const sinP = Math.sin(polar);
      fg.cameraPosition({
        x: radius * sinP * Math.cos(azimuth),
        y: radius * Math.cos(polar),
        z: radius * sinP * Math.sin(azimuth),
      });
    };

    const onUp = (e: PointerEvent) => {
      if (!last) return;
      last = null;
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
  }, []);

  // 2D 와 같은 규칙으로 레이아웃을 모아둔다 (lib/graph 의 공용 힘)
  useEffect(() => {
    fgRef.current?.d3Force?.('polarisCenter', createCenteringForce());
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

  // 노드 3D 오브젝트는 한 번 만들어 캐시한다.
  // 예전에는 nodeThreeObject 가 selectedId 를 클로저로 잡는 인라인 함수라,
  // 노드를 클릭할 때마다 함수 정체성이 바뀌어 전 노드의 지오메트리·캔버스 텍스처가
  // 통째로 재생성됐다(클릭당 100ms+ 히칭 + 해제 안 된 GPU 자원 누적).
  // 선택 강조는 재생성 대신 캐시된 halo 머티리얼을 그 자리에서 수정한다.
  const cacheRef = useRef(new Map<string, THREE.Group>());
  const haloRef = useRef(new Map<string, THREE.Mesh>());
  const coreRef = useRef(new Map<string, THREE.Mesh>());
  const labelRef = useRef(new Map<string, { sprite: THREE.Sprite; always: boolean; prominence: number }>());
  const cacheTagRef = useRef('');

  const nodeThreeObject = useCallback(
    (nRaw: unknown) => {
      const n = nRaw as GraphNode;
      const tag = `${colorMode}|${locale}`;
      if (cacheTagRef.current !== tag) {
        cacheRef.current.forEach(disposeNodeObject);
        cacheRef.current.clear();
        haloRef.current.clear();
        coreRef.current.clear();
        labelRef.current.clear();
        cacheTagRef.current = tag;
      }
      const hit = cacheRef.current.get(n.id);
      if (hit) return hit;

      const color = nodeColorOf(n);
      const r = 3.2 + n.prominence * 0.75;
      const group = new THREE.Group();

      const core = new THREE.Mesh(
        UNIT_SPHERE,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: n.status === 'legacy' ? 0.55 : 0.92,
        })
      );
      core.scale.setScalar(r);
      core.userData.baseOpacity = n.status === 'legacy' ? 0.55 : 0.92;
      group.add(core);

      const halo = new THREE.Mesh(
        UNIT_HALO,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(n.id === selectedId ? SELECTED_HALO : color),
          transparent: true,
          opacity: n.id === selectedId ? 0.26 : 0.1,
        })
      );
      halo.scale.setScalar(r * 1.4);
      halo.userData.baseColor = color;
      group.add(halo);

      // 120개 라벨을 고정 크기로 상시 띄우면 어떤 거리에서도 못 읽는다
      // (멀면 뭉개지고, 가까우면 서로 겹친다). 주요 인물만 상시 표시하고
      // 선택된 노드는 아래 이펙트에서 그때그때 켠다.
      const label = makeLabelSprite(locale === 'ko' ? n.name.ko : n.name.en);
      label.visible = n.prominence >= 8;
      group.add(label);

      cacheRef.current.set(n.id, group);
      haloRef.current.set(n.id, halo);
      coreRef.current.set(n.id, core);
      labelRef.current.set(n.id, { sprite: label, always: n.prominence >= 8, prominence: n.prominence });
      return group;
    },
    // selectedId 는 의도적으로 제외 — 넣으면 클릭마다 전 노드가 재생성된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colorMode, locale]
  );

  // 접근자 prop 이 매 렌더 새 함수면 force-graph 가 노드·링크 전체를 다시 평가한다.
  const nodeVisibilityFn = useCallback(
    (nRaw: unknown) => visibleNodes.has((nRaw as GraphNode).id),
    [visibleNodes]
  );
  const linkVisibilityFn = useCallback(
    (lRaw: unknown) => visibleLinkIds.has((lRaw as unknown as GraphLink).id),
    [visibleLinkIds]
  );
  const linkColorFn = useCallback(
    (lRaw: unknown) => REL_META[(lRaw as unknown as GraphLink).rel.type].color + '99',
    []
  );
  const linkWidthFn = useCallback(
    (lRaw: unknown) => 0.4 + (lRaw as unknown as GraphLink).rel.strength * 0.6,
    []
  );
  // 2D 와 같은 규칙 — 모든 링크에 입자를 흘리면 프레임마다 메시가 그만큼 늘어나고,
  // 노드를 골랐을 때 전체가 흐르면 무엇이 선택됐는지 오히려 읽기 어렵다.
  const linkParticlesFn = useCallback(
    (lRaw: unknown) => {
      const l = lRaw as unknown as GraphLink;
      if (selectedId && l.rel.a !== selectedId && l.rel.b !== selectedId) return 0;
      return l.rel.type === 'feud' ? 2 : l.rel.strength >= 3 ? 1 : 0;
    },
    [selectedId]
  );
  const linkParticleWidthFn = useCallback(
    (lRaw: unknown) => 1.6 + (lRaw as unknown as GraphLink).rel.strength,
    []
  );
  const linkParticleSpeedFn = useCallback(() => 0.006, []);
  const nodeLabelFn = useCallback(
    (nRaw: unknown) => {
      const n = nRaw as GraphNode;
      return locale === 'ko' ? n.name.ko : n.name.en;
    },
    [locale]
  );
  const onNodeClickFn = useCallback(
    (nRaw: unknown) => select((nRaw as GraphNode).id),
    [select]
  );
  const onNodeHoverFn = useCallback(
    (nRaw: unknown) => {
      hover(nRaw ? (nRaw as GraphNode).id : null);
      document.body.style.cursor = nRaw ? 'pointer' : 'default';
    },
    [hover]
  );
  const onBackgroundClickFn = useCallback(() => select(null), [select]);
  const onEngineStopFn = useCallback(() => {
    if (didFitRef.current) return;
    didFitRef.current = true;
    fgRef.current?.zoomToFit(700, 90);
  }, []);

  // 선택 강조: 오브젝트를 다시 만들지 않고 머티리얼만 갱신
  useEffect(() => {
    haloRef.current.forEach((halo, id) => {
      const mat = halo.material as THREE.MeshBasicMaterial;
      const sel = id === selectedId;
      mat.color.set(sel ? SELECTED_HALO : (halo.userData.baseColor as string));
      mat.opacity = sel ? 0.26 : 0.1;
    });
    labelRef.current.forEach((l, id) => {
      l.sprite.visible = l.always || id === selectedId;
    });
    cullLabelsRef.current?.();
  }, [selectedId]);

  // 범례 필터로 걸러진 노드는 어둡게 — 2D 의 dim 과 같은 규칙
  useEffect(() => {
    coreRef.current.forEach((core, id) => {
      const mat = core.material as THREE.MeshBasicMaterial;
      const base = core.userData.baseOpacity as number;
      mat.opacity = relFilterActive && !linkedNodes.has(id) ? 0.12 : base;
    });
    haloRef.current.forEach((halo, id) => {
      if (id === selectedId) return;
      const mat = halo.material as THREE.MeshBasicMaterial;
      mat.opacity = relFilterActive && !linkedNodes.has(id) ? 0.02 : 0.1;
    });
  }, [relFilterActive, linkedNodes, selectedId]);

  // 언마운트 시 캐시된 GPU 자원 해제
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach(disposeNodeObject);
      cache.clear();
    };
  }, []);


  // 3D 라벨도 2D 와 같은 문제를 갖고 있었다 — prominence >= 8 이면 무조건 그려서
  // 이름이 서로를 덮었다. 스프라이트는 세계 좌표에 있으므로 화면으로 투영해야
  // 겹치는지 알 수 있고, 카메라가 움직이면 결과가 달라진다.
  //
  // 매 프레임 다시 하면 비싸다. 카메라가 움직이는 동안에만 의미가 있으므로
  // 120ms 로 묶는다 — 눈으로는 즉시로 보이고 계산은 초당 8번이다.
  const labelCountRef = useRef(-1);
  const cullLabelsRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const center = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const probe = new THREE.Vector3();

    const cull = () => {
      const fg = fgRef.current;
      const el = wrapRef.current;
      const cam = fg?.camera?.();
      if (!cam || !el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      cam.updateMatrixWorld();
      cam.matrixWorld.extractBasis(right, up, dir);

      const toScreen = (v: THREE.Vector3) => {
        probe.copy(v).project(cam);
        return { x: (probe.x * 0.5 + 0.5) * w, y: (-probe.y * 0.5 + 0.5) * h };
      };

      const cands = [...labelRef.current.entries()]
        .filter(([id, l]) => l.always || id === selectedId)
        .sort((a, b) =>
          (a[0] === selectedId ? 0 : 1) - (b[0] === selectedId ? 0 : 1) ||
          b[1].prominence - a[1].prominence ||
          a[0].localeCompare(b[0])
        );

      const boxes: LabelBox[] = [];
      const behind: string[] = [];
      for (const [id, l] of cands) {
        l.sprite.getWorldPosition(center);
        // 카메라 뒤로 넘어간 라벨은 투영이 뒤집힌다 — 그리지 않는다
        probe.copy(center).project(cam);
        if (probe.z > 1) { behind.push(id); continue; }
        const c = toScreen(center);
        const ink = (l.sprite.userData.ink as { x: number; y: number } | undefined) ?? { x: 1, y: 1 };
        const halfW = Math.abs(toScreen(probe.copy(center).addScaledVector(right, (l.sprite.scale.x * ink.x) / 2)).x - c.x);
        const halfH = Math.abs(toScreen(probe.copy(center).addScaledVector(up, (l.sprite.scale.y * ink.y) / 2)).y - c.y);
        boxes.push({ id, left: c.x - halfW, right: c.x + halfW, top: c.y - halfH, bottom: c.y + halfH });
      }

      const keep = placeLabels(boxes, 3);
      for (const [id, l] of cands) l.sprite.visible = keep.has(id);
      for (const id of behind) labelRef.current.get(id)!.sprite.visible = false;
      if (labelCountRef.current !== keep.size) {
        labelCountRef.current = keep.size;
        el.setAttribute('data-labels', String(keep.size));
        el.setAttribute('data-label-candidates', String(cands.length));
      }
    };

    cullLabelsRef.current = cull;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 120) return;
      last = t;
      cull();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      cullLabelsRef.current = null;
    };
  }, [selectedId, locale]);

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
        nodeLabel={nodeLabelFn}
        nodeVisibility={nodeVisibilityFn}
        nodeRelSize={5}
        nodeThreeObject={nodeThreeObject}
        linkColor={linkColorFn}
        linkWidth={linkWidthFn}
        linkVisibility={linkVisibilityFn}
        linkDirectionalParticles={linkParticlesFn}
        linkDirectionalParticleSpeed={linkParticleSpeedFn}
        linkDirectionalParticleWidth={linkParticleWidthFn}
        onNodeClick={onNodeClickFn}
        onNodeHover={onNodeHoverFn}
        onBackgroundClick={onBackgroundClickFn}
        onEngineStop={onEngineStopFn}
        warmupTicks={40}
      />
    </div>
  );
}
