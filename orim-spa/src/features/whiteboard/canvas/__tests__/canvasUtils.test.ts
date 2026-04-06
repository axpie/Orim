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
  type BoardElement,
  type ShapeElement,
} from '../../../../types/models';
import { getDraftRectFromDrag, translateArrowElement, translateElementsBySelection } from '../canvasUtils';

function createShape(id: string, overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    $type: 'shape',
    id,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    zIndex: 0,
    rotation: 0,
    label: '',
    labelHorizontalAlignment: HorizontalLabelAlignment.Center,
    labelVerticalAlignment: VerticalLabelAlignment.Middle,
    shapeType: ShapeType.Rectangle,
    fillColor: '#ffffff',
    strokeColor: '#111111',
    strokeWidth: 2,
    borderLineStyle: BorderLineStyle.Solid,
    ...overrides,
  };
}

function createArrow(overrides: Partial<ArrowElement> = {}): ArrowElement {
  return {
    $type: 'arrow',
    id: 'arrow-1',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 1,
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
    arcMidY: -36,
    ...overrides,
  };
}

describe('canvasUtils movement helpers', () => {
  it('translates free arrow geometry including route handles', () => {
    const translated = translateArrowElement(createArrow(), 24, 18);

    expect(translated.sourceX).toBe(24);
    expect(translated.sourceY).toBe(18);
    expect(translated.targetX).toBe(144);
    expect(translated.targetY).toBe(18);
    expect(translated.arcMidX).toBe(84);
    expect(translated.arcMidY).toBe(-18);
  });

  it('moves curved arrows with the selection when both connected endpoints move together', () => {
    const left = createShape('shape-left');
    const right = createShape('shape-right', { x: 240 });
    const arrow = createArrow({
      sourceElementId: left.id,
      targetElementId: right.id,
      sourceX: null,
      sourceY: null,
      targetX: null,
      targetY: null,
      arcMidX: 180,
      arcMidY: -48,
    });

    const { elements: movedElements, changedIds } = translateElementsBySelection(
      [left, right, arrow] as BoardElement[],
      [left.id, right.id],
      48,
      24,
    );

    const movedArrow = movedElements.find((element): element is ArrowElement => element.id === arrow.id);
    expect(changedIds).toEqual([left.id, right.id, arrow.id]);
    expect(movedArrow?.arcMidX).toBe(228);
    expect(movedArrow?.arcMidY).toBe(-24);
  });

  it('keeps a connected arrow control point fixed when only one endpoint moves without selecting the arrow', () => {
    const left = createShape('shape-left');
    const right = createShape('shape-right', { x: 240 });
    const arrow = createArrow({
      sourceElementId: left.id,
      targetElementId: right.id,
      sourceX: null,
      sourceY: null,
      targetX: null,
      targetY: null,
      arcMidX: 180,
      arcMidY: -48,
    });

    const { elements: movedElements, changedIds } = translateElementsBySelection(
      [left, right, arrow] as BoardElement[],
      [left.id],
      48,
      24,
    );

    const movedArrow = movedElements.find((element): element is ArrowElement => element.id === arrow.id);
    expect(changedIds).toEqual([left.id]);
    expect(movedArrow?.arcMidX).toBe(180);
    expect(movedArrow?.arcMidY).toBe(-48);
  });

  it('creates an unconstrained draft rectangle from the drag bounds', () => {
    expect(getDraftRectFromDrag({ x: 120, y: 80 }, { x: 200, y: 140 })).toEqual({
      x: 120,
      y: 80,
      w: 80,
      h: 60,
    });
  });

  it('locks draft shape proportions when aspect ratio is constrained', () => {
    expect(getDraftRectFromDrag({ x: 120, y: 80 }, { x: 60, y: 40 }, true)).toEqual({
      x: 60,
      y: 20,
      w: 60,
      h: 60,
    });
  });
});
