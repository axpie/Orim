import { ShapeType } from '../../types/models';

export const SHAPE_TOOLS = [
  'rectangle',
  'ellipse',
  'triangle',
  'rhombus',
  'terminator',
  'parallelogram',
  'hexagon',
  'cylinder',
  'cross',
] as const;

export type ShapeTool = (typeof SHAPE_TOOLS)[number];

const shapeToolSet = new Set<string>(SHAPE_TOOLS);

export function isShapeTool(tool: string | null | undefined): tool is ShapeTool {
  return tool != null && shapeToolSet.has(tool);
}

export function getShapeTypeForTool(tool: string | null | undefined): ShapeType {
  switch (tool) {
    case 'ellipse':
      return ShapeType.Ellipse;
    case 'triangle':
      return ShapeType.Triangle;
    case 'rhombus':
      return ShapeType.Rhombus;
    case 'terminator':
      return ShapeType.Terminator;
    case 'parallelogram':
      return ShapeType.Parallelogram;
    case 'hexagon':
      return ShapeType.Hexagon;
    case 'cylinder':
      return ShapeType.Cylinder;
    case 'cross':
      return ShapeType.Cross;
    case 'rectangle':
    default:
      return ShapeType.Rectangle;
  }
}

export function getShapeToolLabelKey(shapeType: ShapeType): string {
  switch (shapeType) {
    case ShapeType.Ellipse:
      return 'tools.ellipse';
    case ShapeType.Triangle:
      return 'tools.triangle';
    case ShapeType.Rhombus:
      return 'tools.rhombus';
    case ShapeType.Terminator:
      return 'tools.terminator';
    case ShapeType.Parallelogram:
      return 'tools.parallelogram';
    case ShapeType.Hexagon:
      return 'tools.hexagon';
    case ShapeType.Cylinder:
      return 'tools.cylinder';
    case ShapeType.Cross:
      return 'tools.cross';
    case ShapeType.Rectangle:
    default:
      return 'tools.rectangle';
  }
}
