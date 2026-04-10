import { describe, expect, it } from 'vitest';
import { ShapeType } from '../../../types/models';
import {
  getShapeToolLabelKey,
  getShapeTypeForTool,
  isShapeTool,
  SHAPE_TOOLS,
} from '../shapeTools';

describe('shapeTools', () => {
  it('recognizes every configured shape tool', () => {
    for (const tool of SHAPE_TOOLS) {
      expect(isShapeTool(tool)).toBe(true);
    }

    expect(isShapeTool('frame')).toBe(false);
  });

  it('maps new flowchart tools to shape types', () => {
    expect(getShapeTypeForTool('terminator')).toBe(ShapeType.Terminator);
    expect(getShapeTypeForTool('parallelogram')).toBe(ShapeType.Parallelogram);
    expect(getShapeTypeForTool('hexagon')).toBe(ShapeType.Hexagon);
    expect(getShapeTypeForTool('cylinder')).toBe(ShapeType.Cylinder);
    expect(getShapeTypeForTool('cross')).toBe(ShapeType.Cross);
  });

  it('returns the translation key for each new flowchart shape type', () => {
    expect(getShapeToolLabelKey(ShapeType.Terminator)).toBe('tools.terminator');
    expect(getShapeToolLabelKey(ShapeType.Parallelogram)).toBe('tools.parallelogram');
    expect(getShapeToolLabelKey(ShapeType.Hexagon)).toBe('tools.hexagon');
    expect(getShapeToolLabelKey(ShapeType.Cylinder)).toBe('tools.cylinder');
    expect(getShapeToolLabelKey(ShapeType.Cross)).toBe('tools.cross');
  });
});
