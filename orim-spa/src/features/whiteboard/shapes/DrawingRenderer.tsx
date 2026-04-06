import { memo } from 'react';
import { Group, Line } from 'react-konva';
import type { DrawingElement } from '../../../types/models';
import { getDrawingHitStrokeWidth } from '../canvas/drawingGeometry';

interface DrawingRendererProps {
  element: DrawingElement;
}

function DrawingRendererInner({ element: el }: DrawingRendererProps) {
  return (
    <Group data-element-id={el.id}>
      <Line
        points={el.points}
        stroke={el.strokeColor}
        strokeWidth={el.strokeWidth}
        lineCap="round"
        lineJoin="round"
        tension={0.5}
        hitStrokeWidth={getDrawingHitStrokeWidth(el.strokeWidth)}
        data-element-id={el.id}
      />
    </Group>
  );
}

export const DrawingRenderer = memo(DrawingRendererInner);
