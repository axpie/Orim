import { describe, expect, it } from 'vitest';
import {
  ArrowHeadStyle,
  ArrowLineStyle,
  ArrowRouteStyle,
  DockPoint,
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type ArrowElement,
  type BoardElement,
} from '../../../types/models';
import { getBoundsForElements, getFitToScreenViewport } from '../cameraUtils';

function createShape(overrides: Partial<BoardElement> = {}): BoardElement {
  return {
    $type: 'shape',
    id: 'shape-1',
    x: 100,
    y: 120,
    width: 320,
    height: 180,
    zIndex: 0,
    rotation: 0,
    shapeType: 'Rectangle',
    fillColor: '#ffffff',
    strokeColor: '#111111',
    strokeWidth: 2,
    borderLineStyle: 'Solid',
    label: '',
    labelHorizontalAlignment: 'Center',
    labelVerticalAlignment: 'Middle',
    ...overrides,
  } as BoardElement;
}

function createArrow(overrides: Partial<ArrowElement> = {}): ArrowElement {
  return {
    $type: 'arrow',
    id: 'arrow-1',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    rotation: 0,
    label: '',
    labelColor: null,
    fontFamily: null,
    labelHorizontalAlignment: HorizontalLabelAlignment.Center,
    labelVerticalAlignment: VerticalLabelAlignment.Middle,
    sourceElementId: null,
    targetElementId: null,
    sourceX: 0,
    sourceY: 0,
    targetX: 120,
    targetY: 0,
    sourceDock: DockPoint.Right,
    targetDock: DockPoint.Left,
    strokeColor: '#111111',
    strokeWidth: 2,
    lineStyle: ArrowLineStyle.Solid,
    sourceHeadStyle: ArrowHeadStyle.None,
    targetHeadStyle: ArrowHeadStyle.FilledTriangle,
    routeStyle: ArrowRouteStyle.Arc,
    orthogonalMiddleCoordinate: null,
    arcMidX: 60,
    arcMidY: -48,
    ...overrides,
  };
}

describe('getFitToScreenViewport', () => {
  it('returns null when there is nothing to fit', () => {
    expect(getFitToScreenViewport({
      elementsToFit: [],
      viewportWidth: 1200,
      viewportHeight: 800,
      viewportInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    })).toBeNull();
  });

  it('fits content into the visible viewport while respecting insets and margins', () => {
    const element = createShape();
    const viewport = getFitToScreenViewport({
      elementsToFit: [element],
      viewportWidth: 1200,
      viewportHeight: 800,
      viewportInsets: { top: 72, right: 24, bottom: 16, left: 280 },
      margin: 64,
    });

    expect(viewport).not.toBeNull();
    const { zoom, cameraX, cameraY } = viewport!;
    const screenLeft = element.x * zoom + cameraX;
    const screenTop = element.y * zoom + cameraY;
    const screenRight = (element.x + element.width) * zoom + cameraX;
    const screenBottom = (element.y + element.height) * zoom + cameraY;

    expect(screenLeft).toBeGreaterThanOrEqual(280 + 64 - 0.001);
    expect(screenTop).toBeGreaterThanOrEqual(72 + 64 - 0.001);
    expect(screenRight).toBeLessThanOrEqual(1200 - 24 - 64 + 0.001);
    expect(screenBottom).toBeLessThanOrEqual(800 - 16 - 64 + 0.001);
  });

  it('includes curved arrow peaks in measured bounds', () => {
    const arrow = createArrow();
    const bounds = getBoundsForElements([arrow], [arrow]);

    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBe(0);
    expect(bounds!.y).toBeLessThan(-40);
    expect(bounds!.width).toBe(120);
    expect(bounds!.height).toBeGreaterThan(40);
  });
});
