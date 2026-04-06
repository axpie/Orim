import { memo } from 'react';
import { Circle, Ellipse, Group, Path, Rect, Text } from 'react-konva';
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
        <Group x={iconX} y={iconY} scaleX={iconScale} scaleY={iconScale} listening={false}>
          {definition.nodes.map((node, index) => {
            switch (node.type) {
              case 'path':
                return (
                  <Path
                    key={`path-${index}`}
                    data={node.d}
                    fill={el.color ?? '#333333'}
                    opacity={node.opacity}
                    strokeEnabled={false}
                    listening={false}
                  />
                );
              case 'circle':
                return (
                  <Circle
                    key={`circle-${index}`}
                    x={node.cx}
                    y={node.cy}
                    radius={node.r}
                    fill={el.color ?? '#333333'}
                    opacity={node.opacity}
                    strokeEnabled={false}
                    listening={false}
                  />
                );
              case 'ellipse':
                return (
                  <Ellipse
                    key={`ellipse-${index}`}
                    x={node.cx}
                    y={node.cy}
                    radiusX={node.rx}
                    radiusY={node.ry}
                    fill={el.color ?? '#333333'}
                    opacity={node.opacity}
                    strokeEnabled={false}
                    listening={false}
                  />
                );
              default:
                return null;
            }
          })}
        </Group>
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
