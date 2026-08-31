import { describe, expect, it } from 'vitest';
import { centerOnClear, clearArea, frameToArea, type Panel, type Rect } from './viewport';

const CANVAS: Rect = { left: 0, top: 0, right: 1280, bottom: 900 };

// 실제 레이아웃: 사이드바 12~336, 드로어 888~1268, 헤더 0~83
const SIDEBAR: Panel = { side: 'left', rect: { left: 12, top: 72, right: 336, bottom: 888 } };
const DRAWER: Panel = { side: 'right', rect: { left: 888, top: 72, right: 1268, bottom: 888 } };
const HEADER: Panel = { side: 'top', rect: { left: 0, top: 0, right: 1280, bottom: 83 } };

describe('clearArea', () => {
  it('패널이 없으면 캔버스 그대로', () => {
    expect(clearArea(CANVAS, [])).toEqual(CANVAS);
  });

  it('좌우 패널만큼 좁힌다', () => {
    const r = clearArea(CANVAS, [SIDEBAR, DRAWER]);
    expect(r.left).toBe(336);
    expect(r.right).toBe(888);
  });

  it('헤더만큼 위를 내린다', () => {
    expect(clearArea(CANVAS, [HEADER]).top).toBe(83);
  });

  // 사이드바는 닫히면 -translate-x-[110%] 로 화면 밖에 있다.
  // 세면 패널을 닫아도 그래프가 그만큼 좁게 남는다.
  it('닫혀서 화면 밖에 있는 패널은 세지 않는다', () => {
    const closed: Panel = { side: 'left', rect: { left: -368, top: 72, right: -44, bottom: 888 } };
    expect(clearArea(CANVAS, [closed]).left).toBe(0);
  });

  it('폭이 0 인 패널은 무시한다', () => {
    const empty: Panel = { side: 'left', rect: { left: 100, top: 72, right: 100, bottom: 888 } };
    expect(clearArea(CANVAS, [empty]).left).toBe(0);
  });

  // 뒤집힌 사각형에 맞추려다 그래프가 사라지는 것보다 가려지는 편이 낫다.
  it('남는 영역이 너무 좁으면 캔버스를 그대로 돌려준다', () => {
    const narrow: Rect = { left: 0, top: 0, right: 400, bottom: 900 };
    const wide: Panel = { side: 'right', rect: { left: 20, top: 0, right: 400, bottom: 900 } };
    expect(clearArea(narrow, [wide])).toEqual(narrow);
  });
});

describe('frameToArea', () => {
  const BBOX = { minX: -100, maxX: 100, minY: -50, maxY: 50 };

  it('가려진 영역이 없으면 캔버스 기준과 같다', () => {
    const f = frameToArea(BBOX, CANVAS, CANVAS, 0);
    expect(f.zoom).toBeCloseTo(Math.min(1280 / 200, 900 / 100), 6);
    expect(f.centerX).toBeCloseTo(0, 6);
    expect(f.centerY).toBeCloseTo(0, 6);
  });

  it('좁아진 만큼 배율이 작아진다', () => {
    const clear = clearArea(CANVAS, [SIDEBAR, DRAWER, HEADER]);
    const tight = frameToArea(BBOX, CANVAS, clear, 0);
    const full = frameToArea(BBOX, CANVAS, CANVAS, 0);
    expect(tight.zoom).toBeLessThan(full.zoom);
  });

  /**
   * 이 계산의 핵심. 배율만 맞추고 중심을 안 옮기면 덩어리가 여전히 패널 뒤에 있다.
   * 덩어리 중심을 화면으로 되돌렸을 때 비어 있는 영역의 한가운데여야 한다.
   */
  it('덩어리 중심이 비어 있는 영역의 한가운데로 온다', () => {
    const clear = clearArea(CANVAS, [SIDEBAR, DRAWER, HEADER]);
    const f = frameToArea(BBOX, CANVAS, clear, 40);

    const bboxCx = (BBOX.minX + BBOX.maxX) / 2;
    const bboxCy = (BBOX.minY + BBOX.maxY) / 2;
    // 화면 좌표 = 캔버스중앙 + (그래프좌표 - centerAt) * zoom
    const screenX = (CANVAS.left + CANVAS.right) / 2 + (bboxCx - f.centerX) * f.zoom;
    const screenY = (CANVAS.top + CANVAS.bottom) / 2 + (bboxCy - f.centerY) * f.zoom;

    expect(screenX).toBeCloseTo((clear.left + clear.right) / 2, 6);
    expect(screenY).toBeCloseTo((clear.top + clear.bottom) / 2, 6);
  });

  it('덩어리 전체가 비어 있는 영역 안에 들어온다', () => {
    const clear = clearArea(CANVAS, [SIDEBAR, DRAWER, HEADER]);
    const PAD = 40;
    const f = frameToArea(BBOX, CANVAS, clear, PAD);
    const toScreen = (gx: number, gy: number) => ({
      x: (CANVAS.left + CANVAS.right) / 2 + (gx - f.centerX) * f.zoom,
      y: (CANVAS.top + CANVAS.bottom) / 2 + (gy - f.centerY) * f.zoom,
    });
    const a = toScreen(BBOX.minX, BBOX.minY);
    const b = toScreen(BBOX.maxX, BBOX.maxY);
    expect(a.x).toBeGreaterThanOrEqual(clear.left + PAD - 0.001);
    expect(b.x).toBeLessThanOrEqual(clear.right - PAD + 0.001);
    expect(a.y).toBeGreaterThanOrEqual(clear.top + PAD - 0.001);
    expect(b.y).toBeLessThanOrEqual(clear.bottom - PAD + 0.001);
  });

  it('점 하나(폭 0)여도 0 으로 나누지 않는다', () => {
    const f = frameToArea({ minX: 5, maxX: 5, minY: 5, maxY: 5 }, CANVAS, CANVAS, 40);
    expect(Number.isFinite(f.zoom)).toBe(true);
    expect(Number.isFinite(f.centerX)).toBe(true);
  });

  it('여백이 영역보다 커도 배율이 유한하다', () => {
    const f = frameToArea(BBOX, CANVAS, { left: 0, top: 0, right: 100, bottom: 100 }, 500);
    expect(Number.isFinite(f.zoom)).toBe(true);
    expect(f.zoom).toBeGreaterThan(0);
  });
});

describe('centerOnClear', () => {
  it('고른 점이 비어 있는 영역의 한가운데로 온다', () => {
    const clear = clearArea(CANVAS, [SIDEBAR, DRAWER, HEADER]);
    const zoom = 2.4;
    const { centerX, centerY } = centerOnClear(30, -70, CANVAS, clear, zoom);
    const screenX = (CANVAS.left + CANVAS.right) / 2 + (30 - centerX) * zoom;
    const screenY = (CANVAS.top + CANVAS.bottom) / 2 + (-70 - centerY) * zoom;
    expect(screenX).toBeCloseTo((clear.left + clear.right) / 2, 6);
    expect(screenY).toBeCloseTo((clear.top + clear.bottom) / 2, 6);
  });

  it('가려진 것이 없으면 그 점 그대로', () => {
    expect(centerOnClear(30, -70, CANVAS, CANVAS, 2.4)).toEqual({ centerX: 30, centerY: -70 });
  });
});
