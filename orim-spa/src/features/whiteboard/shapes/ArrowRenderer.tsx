import { Group, Line, Circle } from 'react-konva';
import { ArrowHeadStyle, type ArrowElement, type BoardElement } from '../../../types/models';
import { computeArrowPolyline, flattenPoints, arrowheadPoints } from '../../../utils/arrowRouting';
import { getLineDashArray } from '../../../utils/lineStyles';

interface ArrowRendererProps {
  element: ArrowElement;
  elements: BoardElement[];
}

export function ArrowRenderer({ element: el, elements }: ArrowRendererProps) {
  const points = computeArrowPolyline(el, elements);
  const flat = flattenPoints(trimArrowLinePoints(points, el));
  const dash = getLineDashArray(el.lineStyle, el.strokeWidth ?? 2);

  const renderHead = (
    style: string | undefined,
    tip: { x: number; y: number },
    from: { x: number; y: number },
  ) => {
    if (!style || style === 'None') return null;
    const size = Math.max(10, (el.strokeWidth ?? 2) * 4);

    if (style === 'FilledTriangle') {
      const pts = arrowheadPoints(tip, from, size);
      return (
        <Line
          points={pts}
          closed
          fill={el.strokeColor ?? '#333333'}
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={1}
          listening={false}
        />
      );
    }
    if (style === 'OpenTriangle') {
      const pts = arrowheadPoints(tip, from, size);
      return (
        <Line
          points={pts}
          closed
          fill="transparent"
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={el.strokeWidth ?? 2}
          listening={false}
        />
      );
    }
    if (style === 'FilledCircle') {
      return (
        <Circle
          x={tip.x}
          y={tip.y}
          radius={size / 2}
          fill={el.strokeColor ?? '#333333'}
          listening={false}
        />
      );
    }
    if (style === 'OpenCircle') {
      return (
        <Circle
          x={tip.x}
          y={tip.y}
          radius={size / 2}
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={el.strokeWidth ?? 2}
          fill="transparent"
          listening={false}
        />
      );
    }
    return null;
  };

  return (
    <Group data-element-id={el.id}>
      <Line
        points={flat}
        stroke={el.strokeColor ?? '#333333'}
        strokeWidth={el.strokeWidth ?? 2}
        dash={dash}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={12}
        data-element-id={el.id}
      />

      {/* Source arrowhead */}
      {points.length >= 2 && renderHead(el.sourceHeadStyle, points[0], points[1])}

      {/* Target arrowhead */}
      {points.length >= 2 && renderHead(el.targetHeadStyle, points[points.length - 1], points[points.length - 2])}

    </Group>
  );
}

function trimArrowLinePoints(points: { x: number; y: number }[], arrow: ArrowElement) {
  if (points.length < 2) {
    return points;
  }

  const trimmed = [...points];
  const sourceTrim = getArrowEndpointTrimDistance(arrow.sourceHeadStyle, arrow.strokeWidth ?? 2, Boolean(arrow.sourceElementId));
  const targetTrim = getArrowEndpointTrimDistance(arrow.targetHeadStyle, arrow.strokeWidth ?? 2, Boolean(arrow.targetElementId));

  if (sourceTrim > 0) {
    trimmed[0] = movePointToward(points[0], points[1], sourceTrim);
  }

  if (targetTrim > 0) {
    trimmed[trimmed.length - 1] = movePointToward(points[points.length - 1], points[points.length - 2], targetTrim);
  }

  return trimmed;
}

function getArrowEndpointTrimDistance(style: ArrowHeadStyle | string | undefined, strokeWidth: number, isDocked: boolean) {
  const dockTrim = isDocked ? Math.max(0.75, strokeWidth / 2) : 0;
  const size = Math.max(10, strokeWidth * 4);
  const headTrim = style === ArrowHeadStyle.FilledTriangle || style === ArrowHeadStyle.OpenTriangle
    ? size * Math.cos(Math.PI / 6)
    : style === ArrowHeadStyle.OpenCircle || style === ArrowHeadStyle.FilledCircle
      ? size
      : 0;

  return Math.max(dockTrim, headTrim);
}

function movePointToward(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.0001) {
    return from;
  }

  return {
    x: from.x + (dx / length) * distance,
    y: from.y + (dy / length) * distance,
  };
}
