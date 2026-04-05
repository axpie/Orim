import { describe, expect, it } from 'vitest';
import {
  ArrowHeadStyle,
  ArrowLineStyle,
  ArrowRouteStyle,
  DockPoint,
  HorizontalLabelAlignment,
  VerticalLabelAlignment,
  type ArrowElement,
} from '../../types/models';
import { computeArrowPolyline, getArrowArcMidpoint } from '../arrowRouting';

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
});
