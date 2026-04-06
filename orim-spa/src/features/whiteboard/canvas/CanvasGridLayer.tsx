import { memo, useMemo, type ReactNode } from 'react';
import { Layer, Rect, Line } from 'react-konva';
import { GRID_SIZE } from './canvasUtils';

interface CanvasGridLayerProps {
  zoom: number;
  cameraX: number;
  cameraY: number;
  viewportWidth: number;
  viewportHeight: number;
  gridColor: string;
  surfaceColor: string;
}

export const CanvasGridLayer = memo(function CanvasGridLayer({
  zoom,
  cameraX,
  cameraY,
  viewportWidth,
  viewportHeight,
  gridColor,
  surfaceColor,
}: CanvasGridLayerProps) {
  const worldLeft = -cameraX / zoom;
  const worldTop = -cameraY / zoom;
  const worldRight = worldLeft + viewportWidth / zoom;
  const worldBottom = worldTop + viewportHeight / zoom;

  const gridLines = useMemo(() => {
    const lines: ReactNode[] = [];

    if (zoom > 0.3) {
      const step = GRID_SIZE;
      const startX = Math.floor(worldLeft / step) * step;
      const startY = Math.floor(worldTop / step) * step;

      for (let x = startX; x <= worldRight; x += step) {
        lines.push(
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
        lines.push(
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

    return lines;
  }, [zoom, worldLeft, worldTop, worldRight, worldBottom, gridColor]);

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
      {gridLines}
    </Layer>
  );
});
