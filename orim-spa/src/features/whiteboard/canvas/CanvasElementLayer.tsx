import { memo, useMemo } from 'react';
import { Group, Layer } from 'react-konva';
import { ShapeRenderer } from '../shapes/ShapeRenderer';
import { TextRenderer } from '../shapes/TextRenderer';
import { StickyNoteRenderer } from '../shapes/StickyNoteRenderer';
import { FrameRenderer } from '../shapes/FrameRenderer';
import { ArrowRenderer } from '../shapes/ArrowRenderer';
import { IconRenderer } from '../shapes/IconRenderer';
import { ImageRenderer } from '../shapes/ImageRenderer';
import { DrawingRenderer } from '../shapes/DrawingRenderer';
import type { BoardElement, ImageElement, ThemeBoardDefaultsDefinition } from '../../../types/models';

interface CanvasElementLayerProps {
  elements: BoardElement[];
  boardDefaults: Pick<ThemeBoardDefaultsDefinition, 'strokeColor' | 'surfaceColor'>;
}

export const CanvasElementLayer = memo(function CanvasElementLayer({
  elements,
  boardDefaults,
}: CanvasElementLayerProps) {
  const sorted = useMemo(
    () => [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [elements],
  );

  return (
    <Layer>
      {sorted.map((el) => {
        const centerX = el.x + el.width / 2;
        const centerY = el.y + el.height / 2;

        switch (el.$type) {
          case 'shape':
            return (
              <Group
                key={el.id}
                x={centerX}
                y={centerY}
                offsetX={centerX}
                offsetY={centerY}
                rotation={el.rotation ?? 0}
                data-element-id={el.id}
              >
                <ShapeRenderer element={el} />
              </Group>
            );
          case 'text':
            return (
              <Group
                key={el.id}
                x={centerX}
                y={centerY}
                offsetX={centerX}
                offsetY={centerY}
                rotation={el.rotation ?? 0}
                data-element-id={el.id}
              >
                <TextRenderer element={el} />
              </Group>
            );
          case 'sticky':
            return (
              <Group
                key={el.id}
                x={centerX}
                y={centerY}
                offsetX={centerX}
                offsetY={centerY}
                rotation={el.rotation ?? 0}
                data-element-id={el.id}
              >
                <StickyNoteRenderer element={el} />
              </Group>
            );
          case 'frame':
            return (
              <Group
                key={el.id}
                x={centerX}
                y={centerY}
                offsetX={centerX}
                offsetY={centerY}
                rotation={el.rotation ?? 0}
                data-element-id={el.id}
              >
                <FrameRenderer element={el} boardDefaults={boardDefaults} />
              </Group>
            );
          case 'arrow':
            return <ArrowRenderer key={el.id} element={el} elements={elements} />;
          case 'icon':
            return (
              <Group
                key={el.id}
                x={centerX}
                y={centerY}
                offsetX={centerX}
                offsetY={centerY}
                rotation={el.rotation ?? 0}
                data-element-id={el.id}
              >
                <IconRenderer element={el} />
              </Group>
            );
          case 'image':
            return <ImageRenderer key={el.id} element={el as ImageElement} />;
          case 'drawing':
            return (
              <Group
                key={el.id}
                x={centerX}
                y={centerY}
                offsetX={centerX}
                offsetY={centerY}
                rotation={el.rotation ?? 0}
                data-element-id={el.id}
              >
                <DrawingRenderer element={el} />
              </Group>
            );
          default:
            return null;
        }
      })}
    </Layer>
  );
});
