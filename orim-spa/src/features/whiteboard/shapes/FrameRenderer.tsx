import { memo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type { FrameElement, ThemeBoardDefaultsDefinition } from '../../../types/models';
import { contrastingTextColor } from '../../../utils/colorUtils';
import { resolveFontFamily } from '../../../utils/textLayout';
import {
  FRAME_HEADER_HORIZONTAL_PADDING,
  FRAME_HEADER_VERTICAL_PADDING,
  FRAME_TITLE_LINE_HEIGHT,
  getFrameHeaderHeight,
  resolveFrameTitleFontSize,
} from './frameLayout';
import { resolveFrameColors } from './frameStyle';

const FRAME_CORNER_RADIUS = 10;

interface FrameRendererProps {
  element: FrameElement;
  boardDefaults: Pick<ThemeBoardDefaultsDefinition, 'strokeColor' | 'surfaceColor'>;
}

function FrameRendererInner({ element: el, boardDefaults }: FrameRendererProps) {
  const { fillColor, headerFill, strokeColor } = resolveFrameColors(el, boardDefaults);
  const headerHeight = Math.min(el.height, getFrameHeaderHeight(el.height, el.width, el.label, el.labelFontSize ?? undefined));
  const titleColor = el.labelColor ?? contrastingTextColor(headerFill);
  const titleFontSize = resolveFrameTitleFontSize(el);
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
          x={el.x + FRAME_HEADER_HORIZONTAL_PADDING}
          y={el.y + FRAME_HEADER_VERTICAL_PADDING}
          width={Math.max(1, el.width - FRAME_HEADER_HORIZONTAL_PADDING * 2)}
          height={Math.max(1, headerHeight - FRAME_HEADER_VERTICAL_PADDING * 2)}
          text={el.label}
          fontSize={titleFontSize}
          fontFamily={resolveFontFamily(el.fontFamily)}
          fill={titleColor}
          fontStyle={fontStyle || 'normal'}
          textDecoration={textDecoration || undefined}
          lineHeight={FRAME_TITLE_LINE_HEIGHT}
          align={el.labelHorizontalAlignment?.toLowerCase() ?? 'left'}
          verticalAlign={el.labelVerticalAlignment?.toLowerCase() ?? 'middle'}
          wrap="word"
        />
      )}
    </Group>
  );
}

export const FrameRenderer = memo(FrameRendererInner);
