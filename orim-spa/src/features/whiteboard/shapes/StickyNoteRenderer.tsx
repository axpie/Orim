import { memo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type { StickyNoteElement } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { resolveFontFamily, resolveTextFontSize } from '../../../utils/textLayout';

const STICKY_CORNER_RADIUS = 8;
const STICKY_PADDING = 12;
const STICKY_BORDER_COLOR = 'rgba(15, 23, 42, 0.14)';
const STICKY_FOLD_COLOR = 'rgba(255, 255, 255, 0.32)';
const DEFAULT_STICKY_FILL_COLOR = '#FDE68A';

interface StickyNoteRendererProps {
  element: StickyNoteElement;
}

function StickyNoteRendererInner({ element: el }: StickyNoteRendererProps) {
  const fillColor = el.fillColor ?? DEFAULT_STICKY_FILL_COLOR;
  const textColor = el.color ?? contrastingTextColor(fillColor);
  const foldSize = Math.max(14, Math.min(28, Math.min(el.width, el.height) * 0.22));
  const fontStyle = [(el.isBold ? 'bold' : ''), (el.isItalic ? 'italic' : '')]
    .filter(Boolean)
    .join(' ');
  const textDecoration = [el.isUnderline ? 'underline' : '', el.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Group data-element-id={el.id}>
      <Rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        fill={fillColor}
        stroke={STICKY_BORDER_COLOR}
        strokeWidth={1}
        cornerRadius={STICKY_CORNER_RADIUS}
        shadowColor="rgba(15, 23, 42, 0.18)"
        shadowBlur={12}
        shadowOffsetX={0}
        shadowOffsetY={6}
        shadowOpacity={0.22}
        data-element-id={el.id}
      />
      <Line
        points={[
          el.x + el.width - foldSize,
          el.y,
          el.x + el.width,
          el.y,
          el.x + el.width,
          el.y + foldSize,
        ]}
        closed
        fill={STICKY_FOLD_COLOR}
        stroke={STICKY_BORDER_COLOR}
        strokeWidth={1}
        listening={false}
      />
      <Line
        points={[
          el.x + el.width - foldSize,
          el.y,
          el.x + el.width - foldSize,
          el.y + foldSize,
          el.x + el.width,
          el.y + foldSize,
        ]}
        stroke={STICKY_BORDER_COLOR}
        strokeWidth={1}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      <Text
        x={el.x + STICKY_PADDING}
        y={el.y + STICKY_PADDING}
        width={Math.max(1, el.width - STICKY_PADDING * 2 - foldSize * 0.2)}
        height={Math.max(1, el.height - STICKY_PADDING * 2)}
        text={el.text || ' '}
        fontSize={resolveTextFontSize(el)}
        fontFamily={resolveFontFamily(el.fontFamily)}
        fill={textColor}
        fontStyle={fontStyle || 'normal'}
        textDecoration={textDecoration || undefined}
        align={el.labelHorizontalAlignment?.toLowerCase() ?? 'left'}
        verticalAlign={el.labelVerticalAlignment?.toLowerCase() ?? 'top'}
        lineHeight={1.15}
        listening={false}
      />
    </Group>
  );
}

export const StickyNoteRenderer = memo(StickyNoteRendererInner);
