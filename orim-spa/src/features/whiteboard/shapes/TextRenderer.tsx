import { Group, Text } from 'react-konva';
import type { TextElement } from '../../../types/models';
import { resolveFontFamily, resolveTextFontSize } from '../../../utils/textLayout';

interface TextRendererProps {
  element: TextElement;
}

export function TextRenderer({ element: el }: TextRendererProps) {
  const fontStyle = [(el.isBold ? 'bold' : ''), (el.isItalic ? 'italic' : '')]
    .filter(Boolean)
    .join(' ');
  const textDecoration = [el.isUnderline ? 'underline' : '', el.isStrikethrough ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <Group data-element-id={el.id}>
      <Text
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        text={el.text || ' '}
        fontSize={resolveTextFontSize(el)}
        fontFamily={resolveFontFamily(el.fontFamily)}
        fill={el.color ?? '#333333'}
        fontStyle={fontStyle || 'normal'}
        textDecoration={textDecoration || undefined}
        align={el.labelHorizontalAlignment?.toLowerCase() ?? 'left'}
        verticalAlign={el.labelVerticalAlignment?.toLowerCase() ?? 'top'}
        padding={6}
        lineHeight={1.15}
        data-element-id={el.id}
      />
    </Group>
  );
}
