import { memo } from 'react';
import { Rect, Group, Circle, Line } from 'react-konva';
import type { BoardElement } from '../../../types/models';
import { computeArrowPolyline, flattenPoints } from '../../../utils/arrowRouting';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type InteractionHandle = ResizeHandle | 'rotate';

interface SelectionOverlayProps {
  elements: BoardElement[];
  selectedIds: string[];
  zoom: number;
  handleSurfaceColor?: string;
  selectionColor?: string;
  touchMode?: boolean;
}

function SelectionOverlayInner({
  elements,
  selectedIds,
  zoom,
  handleSurfaceColor = '#ffffff',
  selectionColor = '#1976d2',
  touchMode = false,
}: SelectionOverlayProps) {
  if (selectedIds.length === 0) return null;

  const selected = elements.filter((el) => selectedIds.includes(el.id));
  const borderWidth = 1.5 / zoom;
  const handleSize = (touchMode ? 16 : 8) / zoom;

  if (selected.length === 1) {
    const el = selected[0];
    if (el.$type === 'arrow') {
      const points = computeArrowPolyline(el, elements);
      const flat = flattenPoints(points);
      const handleRadius = (touchMode ? 11 : 7) / zoom;

      if (points.length < 2) {
        return null;
      }

      return (
        <Group>
          <Line
            points={flat}
            stroke={selectionColor}
            strokeWidth={Math.max(borderWidth, 4 / zoom)}
            opacity={0.22}
            listening={false}
          />
          <Circle
            x={points[0].x}
            y={points[0].y}
            radius={handleRadius}
            fill={handleSurfaceColor}
            stroke={selectionColor}
            strokeWidth={borderWidth}
            data-element-id={el.id}
            data-arrow-endpoint-handle="source"
          />
          <Circle
            x={points[points.length - 1].x}
            y={points[points.length - 1].y}
            radius={handleRadius}
            fill={handleSurfaceColor}
            stroke={selectionColor}
            strokeWidth={borderWidth}
            data-element-id={el.id}
            data-arrow-endpoint-handle="target"
          />
        </Group>
      );
    }

    const handles: Array<{ key: ResizeHandle; x: number; y: number }> = el.isLocked === true ? [] : [
      { key: 'nw', x: el.x, y: el.y },
      { key: 'n', x: el.x + el.width / 2, y: el.y },
      { key: 'ne', x: el.x + el.width, y: el.y },
      { key: 'e', x: el.x + el.width, y: el.y + el.height / 2 },
      { key: 'se', x: el.x + el.width, y: el.y + el.height },
      { key: 's', x: el.x + el.width / 2, y: el.y + el.height },
      { key: 'sw', x: el.x, y: el.y + el.height },
      { key: 'w', x: el.x, y: el.y + el.height / 2 },
    ];
    const rotationCenterX = el.x + el.width / 2;
    const rotationCenterY = el.y + el.height / 2;

    return (
      <Group
        x={rotationCenterX}
        y={rotationCenterY}
        offsetX={rotationCenterX}
        offsetY={rotationCenterY}
        rotation={el.rotation ?? 0}
      >
        <Rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          stroke={selectionColor}
          strokeWidth={borderWidth}
          dash={[4 / zoom, 4 / zoom]}
          fill="transparent"
          listening={false}
        />
        {handles.map((handle) => (
          <Rect
            key={handle.key}
            x={handle.x - handleSize / 2}
            y={handle.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill={handleSurfaceColor}
            stroke={selectionColor}
            strokeWidth={borderWidth}
            data-element-id={el.id}
            data-resize-handle={handle.key}
          />
        ))}
        {el.isLocked !== true && (
          <>
            <Line
              points={[
                el.x + el.width / 2, el.y,
                el.x + el.width / 2, el.y - 25 / zoom,
              ]}
              stroke={selectionColor}
              strokeWidth={borderWidth}
              listening={false}
            />
            <Circle
              x={el.x + el.width / 2}
              y={el.y - 25 / zoom}
              radius={5 / zoom}
              fill={handleSurfaceColor}
              stroke={selectionColor}
              strokeWidth={borderWidth}
              data-element-id={el.id}
              data-rotation-handle="true"
            />
          </>
        )}
      </Group>
    );
  }

  // Multi-selection — bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of selected) {
    if (el.$type === 'arrow') continue;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  if (!isFinite(minX)) return null;

  const midX = (minX + maxX) / 2;
  const canRotateSelection = selected.some((element) => element.$type !== 'arrow' && element.isLocked !== true);

  return (
    <Group>
      <Rect
        x={minX}
        y={minY}
        width={maxX - minX}
        height={maxY - minY}
        stroke={selectionColor}
        strokeWidth={borderWidth}
        dash={[4 / zoom, 4 / zoom]}
        fill="transparent"
        listening={false}
      />
      {canRotateSelection && (
        <>
          <Line
            points={[midX, minY, midX, minY - 25 / zoom]}
            stroke={selectionColor}
            strokeWidth={borderWidth}
            listening={false}
          />
          <Circle
            x={midX}
            y={minY - 25 / zoom}
            radius={5 / zoom}
            fill={handleSurfaceColor}
            stroke={selectionColor}
            strokeWidth={borderWidth}
            data-rotation-handle="true"
          />
        </>
      )}
    </Group>
  );
}

export const SelectionOverlay = memo(SelectionOverlayInner);
