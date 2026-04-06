import { describe, expect, it } from 'vitest';
import {
  BorderLineStyle,
  HorizontalLabelAlignment,
  ShapeType,
  VerticalLabelAlignment,
  type BoardElement,
  type ShapeElement,
} from '../../types/models';
import { snapToAlignmentGuides } from '../geometry';

function createShape(id: string, overrides: Partial<ShapeElement> = {}): ShapeElement {
  return {
    $type: 'shape',
    id,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
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

describe('snapToAlignmentGuides', () => {
  it('snaps to the center line of a containing element', () => {
    const container = createShape('container', {
      width: 200,
      height: 120,
    });

    const result = snapToAlignmentGuides(
      {
        x: 89,
        y: 20,
        width: 20,
        height: 20,
      },
      [container] as BoardElement[],
      1,
    );

    expect(result.dx).toBe(1);
    expect(result.dy).toBe(0);
  });

  it('snaps to equal horizontal spacing on the outer side of an existing pair', () => {
    const left = createShape('left', { x: 0 });
    const middle = createShape('middle', { x: 100 });

    const result = snapToAlignmentGuides(
      {
        x: 197,
        y: 0,
        width: 40,
        height: 40,
      },
      [left, middle] as BoardElement[],
      1,
    );

    expect(result.dx).toBe(3);
    expect(result.dy).toBe(0);
  });

  it('snaps to equal horizontal spacing between two existing elements', () => {
    const left = createShape('left', { x: 0 });
    const right = createShape('right', { x: 200 });

    const result = snapToAlignmentGuides(
      {
        x: 97,
        y: 0,
        width: 40,
        height: 40,
      },
      [left, right] as BoardElement[],
      1,
    );

    expect(result.dx).toBe(3);
    expect(result.dy).toBe(0);
  });

  it('snaps to equal vertical spacing between two existing elements', () => {
    const top = createShape('top', { y: 0 });
    const bottom = createShape('bottom', { y: 120 });

    const result = snapToAlignmentGuides(
      {
        x: 0,
        y: 62,
        width: 40,
        height: 40,
      },
      [top, bottom] as BoardElement[],
      1,
    );

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(-2);
  });
});
