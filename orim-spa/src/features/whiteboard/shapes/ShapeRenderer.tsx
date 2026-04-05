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

  return (
    <Group data-element-id={el.id}>
      {el.shapeType === ShapeType.Ellipse ? (
        <Ellipse
          x={el.x + el.width / 2}
          y={el.y + el.height / 2}
          radiusX={el.width / 2}
          radiusY={el.height / 2}
          fill={el.fillColor ?? '#ffffff'}
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={el.strokeWidth ?? 2}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Triangle ? (
        <Line
          points={[
            el.x + el.width / 2, el.y,
            el.x + el.width, el.y + el.height,
            el.x, el.y + el.height,
          ]}
          closed
          fill={el.fillColor ?? '#ffffff'}
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={el.strokeWidth ?? 2}
          dash={dash}
          data-element-id={el.id}
        />
      ) : el.shapeType === ShapeType.Rhombus ? (
        <Line
          points={[
            el.x + el.width / 2, el.y,
            el.x + el.width, el.y + el.height / 2,
            el.x + el.width / 2, el.y + el.height,
            el.x, el.y + el.height / 2,
          ]}
          closed
          fill={el.fillColor ?? '#ffffff'}
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={el.strokeWidth ?? 2}
          dash={dash}
          data-element-id={el.id}
        />
      ) : (
        <Rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          fill={el.fillColor ?? '#ffffff'}
          stroke={el.strokeColor ?? '#333333'}
          strokeWidth={el.strokeWidth ?? 2}
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
