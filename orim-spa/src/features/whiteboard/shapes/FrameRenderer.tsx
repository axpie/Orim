import { Group, Line, Rect, Text } from 'react-konva';
import type { FrameElement } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { formatColorValue, parseColorValue } from '../../../utils/colorValue';
import { resolveFontFamily } from '../../../utils/textLayout';

const DEFAULT_FRAME_FILL_COLOR = 'rgba(37, 99, 235, 0.08)';
const DEFAULT_FRAME_STROKE_COLOR = 'rgba(37, 99, 235, 0.48)';
const FRAME_CORNER_RADIUS = 10;
const FRAME_TITLE_HORIZONTAL_PADDING = 14;

interface FrameRendererProps {
  element: FrameElement;
}

export function getFrameHeaderHeight(height: number): number {
  return Math.min(40, Math.max(24, height * 0.2), Math.max(height - 16, 14));
}

export function FrameRenderer({ element: el }: FrameRendererProps) {
  const fillColor = el.fillColor ?? DEFAULT_FRAME_FILL_COLOR;
  const strokeColor = el.strokeColor ?? DEFAULT_FRAME_STROKE_COLOR;
  const headerHeight = Math.min(el.height, getFrameHeaderHeight(el.height));
  const parsedFill = parseColorValue(fillColor);
  const headerFill = formatColorValue({
    ...parsedFill,
    alpha: Math.min(1, Math.max(parsedFill.alpha + 0.08, 0.16)),
  });
  const titleColor = el.labelColor ?? contrastingTextColor(headerFill);
  const titleFontSize = typeof el.labelFontSize === 'number'
    ? Math.max(1, el.labelFontSize)
    : Math.min(22, Math.max(12, headerHeight * 0.48));
  const fontStyle = [(el.isBold ? 'bold' : ''), (el.isItalic ? 'italic' : '')]
    .filter(Boolean)
    .join(' ');
  const textDecoration = [el.isUnderline ? 'underline' : '', el.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Group listening={false}>
      <Rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={el.strokeWidth ?? 2}
        cornerRadius={FRAME_CORNER_RADIUS}
      />
      <Rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={headerHeight}
        fill={headerFill}
        cornerRadius={FRAME_CORNER_RADIUS}
      />
      {el.height > headerHeight && (
        <Line
          points={[el.x, el.y + headerHeight, el.x + el.width, el.y + headerHeight]}
          stroke={strokeColor}
          strokeWidth={Math.max(1, (el.strokeWidth ?? 2) * 0.75)}
        />
      )}
      {el.label.trim().length > 0 && (
        <Text
          x={el.x + FRAME_TITLE_HORIZONTAL_PADDING}
          y={el.y + Math.max(4, (headerHeight - titleFontSize * 1.15) / 2)}
          width={Math.max(1, el.width - FRAME_TITLE_HORIZONTAL_PADDING * 2)}
          height={Math.max(1, headerHeight - 8)}
          text={el.label}
          fontSize={titleFontSize}
          fontFamily={resolveFontFamily(el.fontFamily)}
          fill={titleColor}
          fontStyle={fontStyle || 'normal'}
          textDecoration={textDecoration || undefined}
          verticalAlign="middle"
          ellipsis
        />
      )}
    </Group>
  );
}
