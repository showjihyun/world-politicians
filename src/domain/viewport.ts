/**
 * 그래프를 화면 어디에 맞출 것인가 — 순수 함수만 둔다.
 *
 * 그래프 캔버스는 화면 전체를 쓰는데 그 위에 패널이 떠 있다. 그런데 프레이밍은
 * **캔버스 전체**를 기준으로 잡고 있었다. 그래서 그려진 그래프의 상당 부분이
 * 패널 뒤로 들어가 볼 수 없었다 — 1280px 에서 36%, 1440px 에서 21%.
 * 화면이 넓으면(1920px, 2%) 티가 안 나서 오래 남아 있었다.
 *
 * 규칙: 이 파일은 런타임 import 를 갖지 않는다. DOM 측정은 컴포넌트의 몫이고
 * 여기는 잰 값을 받아 계산만 한다.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type InsetSide = 'left' | 'right' | 'top' | 'bottom';

export interface Panel {
  side: InsetSide;
  rect: Rect;
}

const width = (r: Rect) => r.right - r.left;
const height = (r: Rect) => r.bottom - r.top;

/**
 * 패널이 비워 준 영역.
 *
 * 닫힌 패널은 화면 밖으로 밀려나 있으므로(사이드바는 -translate-x-[110%]) 캔버스와
 * 겹치지 않는 것은 세지 않는다. 안 그러면 패널을 닫아도 그래프가 그만큼 좁게 남는다.
 *
 * 남는 영역이 없어질 만큼 패널이 크면(좁은 화면) 캔버스를 그대로 돌려준다 —
 * 뒤집힌 사각형에 맞추려다 그래프가 사라지는 것보다 가려지는 편이 낫다.
 */
export function clearArea(canvas: Rect, panels: Panel[]): Rect {
  const out = { ...canvas };
  for (const { side, rect } of panels) {
    if (width(rect) <= 0 || height(rect) <= 0) continue;
    // 캔버스 밖에 있는 패널 = 닫혀 있다
    if (rect.right <= canvas.left || rect.left >= canvas.right) continue;
    if (rect.bottom <= canvas.top || rect.top >= canvas.bottom) continue;

    if (side === 'left') out.left = Math.max(out.left, Math.min(rect.right, canvas.right));
    else if (side === 'right') out.right = Math.min(out.right, Math.max(rect.left, canvas.left));
    else if (side === 'top') out.top = Math.max(out.top, Math.min(rect.bottom, canvas.bottom));
    else out.bottom = Math.min(out.bottom, Math.max(rect.top, canvas.top));
  }
  const MIN = 120;
  if (width(out) < MIN || height(out) < MIN) return { ...canvas };
  return out;
}

export interface BBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Framing {
  /** 그래프 1 단위가 화면 몇 px 인가 */
  zoom: number;
  /** centerAt 에 넘길 그래프 좌표 — 이 점이 **캔버스** 중앙에 온다 */
  centerX: number;
  centerY: number;
}

/**
 * 노드 덩어리를 비어 있는 영역에 채운다.
 *
 * centerAt 은 넘긴 좌표를 **캔버스 중앙**에 놓는다. 우리가 원하는 것은 덩어리가
 * 비어 있는 영역의 중앙에 오는 것이고, 그 둘은 패널만큼 어긋나 있다. 그래서
 * 어긋난 만큼(화면 px)을 줌으로 나눠 그래프 좌표로 바꾼 뒤 빼 준다 —
 * 이걸 빼먹으면 배율만 맞고 덩어리는 여전히 패널 뒤에 있다.
 */
export function frameToArea(bbox: BBox, canvas: Rect, clear: Rect, padding: number): Framing {
  const spanX = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const spanY = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const availX = Math.max(width(clear) - padding * 2, 1);
  const availY = Math.max(height(clear) - padding * 2, 1);
  const zoom = Math.min(availX / spanX, availY / spanY);

  const offsetX = (clear.left + clear.right) / 2 - (canvas.left + canvas.right) / 2;
  const offsetY = (clear.top + clear.bottom) / 2 - (canvas.top + canvas.bottom) / 2;

  return {
    zoom,
    centerX: (bbox.minX + bbox.maxX) / 2 - offsetX / zoom,
    centerY: (bbox.minY + bbox.maxY) / 2 - offsetY / zoom,
  };
}

/**
 * 한 점을 비어 있는 영역의 중앙에 놓으려면 centerAt 에 무엇을 넘겨야 하는가.
 * 인물을 선택했을 때 쓴다 — 그냥 그 좌표를 넘기면 패널 뒤에 놓인다.
 */
export function centerOnClear(
  x: number,
  y: number,
  canvas: Rect,
  clear: Rect,
  zoom: number
): { centerX: number; centerY: number } {
  const offsetX = (clear.left + clear.right) / 2 - (canvas.left + canvas.right) / 2;
  const offsetY = (clear.top + clear.bottom) / 2 - (canvas.top + canvas.bottom) / 2;
  return { centerX: x - offsetX / zoom, centerY: y - offsetY / zoom };
}
