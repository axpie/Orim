import { describe, expect, it } from 'vitest';
import {
  BorderLineStyle,
  HorizontalLabelAlignment,
  ShapeType,
  VerticalLabelAlignment,
  type DrawingElement,
  type ShapeElement,
} from '../../../../types/models';
import { rotateElementAroundPivot } from '../rotationGeometry';

describe('rotateElementAroundPivot', () => {
  it('rotates an element around a shared pivot instead of only changing its angle', () => {
    const element: ShapeElement = {
      $type: 'shape',
      id: 'shape-1',
      x: 100,
      y: 50,
      width: 40,
      height: 20,
      zIndex: 1,
      rotation: 10,
      label: '',
      labelHorizontalAlignment: HorizontalLabelAlignment.Center,
      labelVerticalAlignment: VerticalLabelAlignment.Middle,
      shapeType: ShapeType.Rectangle,
      fillColor: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2,
      borderLineStyle: BorderLineStyle.Solid,
    };

    const rotated = rotateElementAroundPivot(element, { x: 100, y: 100 }, 90) as ShapeElement;

    expect(rotated.x).toBeCloseTo(120);
    expect(rotated.y).toBeCloseTo(110);
    expect(rotated.rotation).toBe(100);
  });

  it('moves drawing points together with the drawing bounds during shared rotation', () => {
    const drawing: DrawingElement = {
      $type: 'drawing',
      id: 'drawing-1',
      x: 20,
      y: 30,
      width: 20,
      height: 10,
      zIndex: 1,
      rotation: 170,
      label: '',
      labelHorizontalAlignment: HorizontalLabelAlignment.Left,
      labelVerticalAlignment: VerticalLabelAlignment.Top,
      points: [20, 30, 40, 40],
      strokeColor: '#000000',
      strokeWidth: 3,
    };

    const rotated = rotateElementAroundPivot(drawing, { x: 10, y: 10 }, 180) as DrawingElement;

    expect(rotated.x).toBeCloseTo(-20);
    expect(rotated.y).toBeCloseTo(-20);
    expect(rotated.rotation).toBe(-10);
    expect(rotated.points).toEqual([-20, -20, 0, -10]);
  });
});
