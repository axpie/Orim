import { memo } from 'react';
import { Group, Path, Text, Rect } from 'react-konva';
import { getIconDefinition, getIconDisplayName } from '../icons/iconCatalog';
import type { IconElement } from '../../../types/models';

interface IconRendererProps {
  element: IconElement;
}

function IconRendererInner({ element: el }: IconRendererProps) {
  const definition = getIconDefinition(el.iconName);
  const iconScale = Math.min(el.width, el.height) / 24;
  const scaledSize = 24 * iconScale;
  const iconX = el.x + (el.width - scaledSize) / 2;
  const iconY = el.y + (el.height - scaledSize) / 2;

  return (
    <Group data-element-id={el.id}>
      <Rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        fill="transparent"
        data-element-id={el.id}
      />
      {definition ? (
        <Path
          x={iconX}
          y={iconY}
          data={definition.path}
          scaleX={iconScale}
          scaleY={iconScale}
          fill={el.color ?? '#333333'}
          strokeEnabled={false}
          listening={false}
        />
      ) : (
        <Text
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          text={getIconDisplayName(el.iconName)}
          fontSize={Math.min(el.width, el.height) * 0.32}
          fill={el.color ?? '#333333'}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      )}
    </Group>
  );
}

export const IconRenderer = memo(IconRendererInner);
