import { describe, expect, it } from 'vitest';
import {
  ArrowHeadStyle,
  ArrowLineStyle,
  ArrowRouteStyle,
  BorderLineStyle,
  DockPoint,
  HorizontalLabelAlignment,
  ShapeType,
  VerticalLabelAlignment,
  type ArrowElement,
  type ShapeElement,
} from '../../types/models';
import { computeArrowPolyline, getArrowArcMidpoint, getDockPosition, nearestDock } from '../arrowRouting';

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
    strokeColor: '#000000',
    strokeWidth: 2,
    lineStyle: ArrowLineStyle.Solid,
    sourceHeadStyle: ArrowHeadStyle.None,
    targetHeadStyle: ArrowHeadStyle.FilledTriangle,
    routeStyle: ArrowRouteStyle.Arc,
    orthogonalMiddleCoordinate: null,
    arcMidX: null,
    arcMidY: null,
    ...overrides,
  };
}

function createShape(overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    $type: 'shape',
    id: 'shape-1',
    x: 10,
    y: 20,
    width: 40,
    height: 20,
    zIndex: 0,
    rotation: 0,
    label: '',
    labelColor: null,
    fontFamily: null,
    labelHorizontalAlignment: HorizontalLabelAlignment.Center,
    labelVerticalAlignment: VerticalLabelAlignment.Middle,
    shapeType: ShapeType.Rectangle,
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 2,
    borderLineStyle: BorderLineStyle.Solid,
    ...overrides,
  };
}

describe('arrowRouting', () => {
  it('returns the stored arc midpoint handle position', () => {
    const midpoint = getArrowArcMidpoint(createArrow({ arcMidX: 60, arcMidY: -36 }), []);

    expect(midpoint).toEqual({ x: 60, y: -36 });
  });

  it('samples an arc through the stored midpoint', () => {
    const points = computeArrowPolyline(createArrow({ arcMidX: 60, arcMidY: -36 }), []);

    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 120, y: 0 });
    expect(points[12].x).toBeCloseTo(60, 5);
    expect(points[12].y).toBeCloseTo(-36, 5);
  });

  it('rotates dock positions together with the connected element', () => {
    const point = getDockPosition(createShape({ rotation: 90 }), DockPoint.Right);

    expect(point.x).toBeCloseTo(30);
    expect(point.y).toBeCloseTo(50);
  });

  it('selects the rotated dock that is nearest in world space', () => {
    const dock = nearestDock(createShape({ rotation: 90 }), { x: 31, y: 52 });

    expect(dock).toBe(DockPoint.Right);
  });

  it('uses the rotated dock position for connected arrow endpoints', () => {
    const shape = createShape({ rotation: 90 });
    const points = computeArrowPolyline(createArrow({
      routeStyle: ArrowRouteStyle.Straight,
      sourceElementId: shape.id,
      sourceDock: DockPoint.Right,
      targetX: 150,
      targetY: 50,
      targetElementId: null,
    }), [shape]);

    expect(points[0].x).toBeCloseTo(30);
    expect(points[0].y).toBeCloseTo(50);
  });

  it('starts orthogonal routes in the rotated outward dock direction', () => {
    const shape = createShape({ rotation: 90 });
    const points = computeArrowPolyline(createArrow({
      routeStyle: ArrowRouteStyle.Orthogonal,
      sourceElementId: shape.id,
      sourceDock: DockPoint.Right,
      targetX: 180,
      targetY: 50,
      targetElementId: null,
      targetDock: DockPoint.Left,
    }), [shape]);

    expect(points[0].x).toBeCloseTo(30);
    expect(points[0].y).toBeCloseTo(50);
    expect(points[1].x).toBeCloseTo(30);
    expect(points[1].y).toBeCloseTo(90);
  });
});
