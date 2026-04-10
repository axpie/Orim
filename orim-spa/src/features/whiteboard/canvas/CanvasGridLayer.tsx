import { memo, useMemo, type ReactNode } from 'react';
import { Layer, Rect, Line, Circle } from 'react-konva';
import { GRID_SIZE } from './canvasUtils';
import type { GridStyle } from '../../../types/models';

interface CanvasGridLayerProps {
  zoom: number;
  cameraX: number;
  cameraY: number;
  viewportWidth: number;
  viewportHeight: number;
  gridColor: string;
  surfaceColor: string;
  gridStyle?: GridStyle | null;
}

export const CanvasGridLayer = memo(function CanvasGridLayer({
  zoom,
  cameraX,
  cameraY,
  viewportWidth,
  viewportHeight,
  gridColor,
  surfaceColor,
  gridStyle,
}: CanvasGridLayerProps) {
  const worldLeft = -cameraX / zoom;
  const worldTop = -cameraY / zoom;
  const worldRight = worldLeft + viewportWidth / zoom;
  const worldBottom = worldTop + viewportHeight / zoom;

  const resolvedGridStyle: GridStyle = gridStyle ?? 'lines';

  const gridElements = useMemo(() => {
    const nodes: ReactNode[] = [];

    if (zoom <= 0.3 || resolvedGridStyle === 'none') {
      return nodes;
    }

    const step = GRID_SIZE;
    const startX = Math.floor(worldLeft / step) * step;
    const startY = Math.floor(worldTop / step) * step;

    if (resolvedGridStyle === 'dots') {
      const dotRadius = 1.5 / zoom;
      for (let x = startX; x <= worldRight; x += step) {
        for (let y = startY; y <= worldBottom; y += step) {
          nodes.push(
            <Circle
              key={`gd${x}_${y}`}
              x={x}
              y={y}
              radius={dotRadius}
              fill={gridColor}
              listening={false}
            />,
          );
        }
      }
    } else {
      // lines (default)
      for (let x = startX; x <= worldRight; x += step) {
        nodes.push(
          <Line
            key={`gv${x}`}
            points={[x, worldTop, x, worldBottom]}
            stroke={gridColor}
            strokeWidth={0.5 / zoom}
            listening={false}
          />,
        );
      }
      for (let y = startY; y <= worldBottom; y += step) {
        nodes.push(
          <Line
            key={`gh${y}`}
            points={[worldLeft, y, worldRight, y]}
            stroke={gridColor}
            strokeWidth={0.5 / zoom}
            listening={false}
          />,
        );
      }
    }

    return nodes;
  }, [zoom, worldLeft, worldTop, worldRight, worldBottom, gridColor, resolvedGridStyle]);

  return (
    <Layer listening={false}>
      <Rect
        x={worldLeft}
        y={worldTop}
        width={worldRight - worldLeft}
        height={worldBottom - worldTop}
        fill={surfaceColor}
        listening={false}
      />
      {gridElements}
    </Layer>
  );
});
