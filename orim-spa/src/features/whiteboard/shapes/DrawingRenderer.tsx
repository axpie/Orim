import { memo } from 'react';
import { Group, Line } from 'react-konva';
import type { DrawingElement } from '../../../types/models';
import { getDrawingHitStrokeWidth } from '../canvas/drawingGeometry';

interface DrawingRendererProps {
  element: DrawingElement;
}

/** Split a flat points array on NaN separator pairs into individual stroke segments. */
function splitStrokes(points: number[]): number[][] {
  const strokes: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    if (isNaN(points[i]) || isNaN(points[i + 1])) {
      if (current.length >= 4) strokes.push(current);
      current = [];
    } else {
      current.push(points[i], points[i + 1]);
    }
  }
  if (current.length >= 4) strokes.push(current);
  return strokes;
}

function DrawingRendererInner({ element: el }: DrawingRendererProps) {
  const hitWidth = getDrawingHitStrokeWidth(el.strokeWidth);
  const strokes = splitStrokes(el.points);

  if (strokes.length === 0) {
    return <Group data-element-id={el.id} />;
  }

  return (
    <Group data-element-id={el.id}>
      {strokes.map((pts, idx) => (
        <Line
          key={idx}
          points={pts}
          stroke={el.strokeColor}
          strokeWidth={el.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.5}
          hitStrokeWidth={hitWidth}
          data-element-id={el.id}
        />
      ))}
    </Group>
  );
}

export const DrawingRenderer = memo(DrawingRendererInner);
