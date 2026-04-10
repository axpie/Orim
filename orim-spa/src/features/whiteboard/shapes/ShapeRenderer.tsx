import { memo } from 'react';
import { Group, Rect, Ellipse, Line, Text } from 'react-konva';
import { ShapeType, type ShapeElement } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { getLineDashArray } from '../../../utils/lineStyles';
import { resolveFontFamily, resolveLabelFontSize } from '../../../utils/textLayout';

interface ShapeRendererProps {
  element: ShapeElement;
}

function ShapeRendererInner({ element: el }: ShapeRendererProps) {
  const dash = getLineDashArray(el.borderLineStyle, el.strokeWidth ?? 2);
  const textColor = el.labelColor ?? (el.fillColor ? contrastingTextColor(el.fillColor) : '#000000');
  const fontStyle = [(el.isBold ? 'bold' : ''), (el.isItalic ? 'italic' : '')]
    .filter(Boolean)
    .join(' ');
  const textDecoration = [el.isUnderline ? 'underline' : '', el.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');

  const x = el.x;
  const y = el.y;
  const w = el.width;
  const h = el.height;
  const fill = el.fillColor ?? '#ffffff';
  const stroke = el.strokeColor ?? '#333333';
  const strokeWidth = el.strokeWidth ?? 2;

  // Parallelogram skew offset (20% of width)
  const skew = w * 0.2;

  // Hexagon points (flat-top)
  const hexPoints = [
    x + w * 0.25, y,
    x + w * 0.75, y,
    x + w,        y + h / 2,
    x + w * 0.75, y + h,
    x + w * 0.25, y + h,
    x,            y + h / 2,
  ];

  // Cross/Plus points (arms = 1/3 of each dimension)
  const cw = w / 3;
  const ch = h / 3;
  const crossPoints = [
    x + cw,     y,
    x + 2 * cw, y,
    x + 2 * cw, y + ch,
    x + w,      y + ch,
    x + w,      y + 2 * ch,
    x + 2 * cw, y + 2 * ch,
    x + 2 * cw, y + h,
    x + cw,     y + h,
    x + cw,     y + 2 * ch,
    x,          y + 2 * ch,
    x,          y + ch,
    x + cw,     y + ch,
  ];

  // Cylinder ellipse radii
  const cylRx = w / 2;
  const cylRy = Math.max(h * 0.12, 8);

  return (
    <Group data-element-id={el.id}>
      {el.shapeType === ShapeType.Ellipse ? (
        <Ellipse
          x={x + w / 2}
          y={y + h / 2}
          radiusX={w / 2}
          radiusY={h / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Triangle ? (
        <Line
          points={[x + w / 2, y, x + w, y + h, x, y + h]}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Rhombus ? (
        <Line
          points={[x + w / 2, y, x + w, y + h / 2, x + w / 2, y + h, x, y + h / 2]}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Terminator ? (
        <Rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={h / 2}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Parallelogram ? (
        <Line
          points={[x + skew, y, x + w, y, x + w - skew, y + h, x, y + h]}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Hexagon ? (
        <Line
          points={hexPoints}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Cylinder ? (
        <>
          {/* Body: rect from top-ellipse center to bottom */}
          <Rect
            x={x}
            y={y + cylRy}
            width={w}
            height={h - cylRy}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            data-element-id={el.id}
          />
          {/* Bottom ellipse cap */}
          <Ellipse
            x={x + cylRx}
            y={y + h}
            radiusX={cylRx}
            radiusY={cylRy}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            dash={dash}
          />
          {/* Top ellipse (visible lid) */}
          <Ellipse
            x={x + cylRx}
            y={y + cylRy}
            radiusX={cylRx}
            radiusY={cylRy}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            dash={dash}
          />
          {/* Left and right side lines to cover rect border */}
          <Line points={[x, y + cylRy, x, y + h]} stroke={stroke} strokeWidth={strokeWidth} listening={false} />
          <Line points={[x + w, y + cylRy, x + w, y + h]} stroke={stroke} strokeWidth={strokeWidth} listening={false} />
        </>
      ) : el.shapeType === ShapeType.Cross ? (
        <Line
          points={crossPoints}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          data-element-id={el.id}
        />
      ) : (
        <Rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={4}
          dash={dash}
          data-element-id={el.id}
        />
      )}

      {/* Label */}
      {el.label && (
        <Text
          x={el.x + 4}
          y={el.y + 4}
          width={el.width - 8}
          height={el.height - 8}
          text={el.label}
          fontSize={resolveLabelFontSize(el)}
          fontFamily={resolveFontFamily(el.fontFamily)}
          fill={textColor}
          fontStyle={fontStyle || 'normal'}
          textDecoration={textDecoration || undefined}
          align={el.labelHorizontalAlignment?.toLowerCase() ?? 'center'}
          verticalAlign={el.labelVerticalAlignment?.toLowerCase() ?? 'middle'}
          lineHeight={1.15}
          listening={false}
        />
      )}
    </Group>
  );
}

export const ShapeRenderer = memo(ShapeRendererInner);
