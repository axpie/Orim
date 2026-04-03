import { memo, useMemo } from 'react';
import { Layer } from 'react-konva';
import { ShapeRenderer } from '../shapes/ShapeRenderer';
import { TextRenderer } from '../shapes/TextRenderer';
import { StickyNoteRenderer } from '../shapes/StickyNoteRenderer';
import { FrameRenderer } from '../shapes/FrameRenderer';
import { ArrowRenderer } from '../shapes/ArrowRenderer';
import { IconRenderer } from '../shapes/IconRenderer';
import { ImageRenderer } from '../shapes/ImageRenderer';
import type { BoardElement, ImageElement } from '../../../types/models';

interface CanvasElementLayerProps {
  elements: BoardElement[];
}

export const CanvasElementLayer = memo(function CanvasElementLayer({
  elements,
}: CanvasElementLayerProps) {
  const sorted = useMemo(
    () => [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [elements],
  );

  return (
    <Layer>
      {sorted.map((el) => {
        switch (el.$type) {
          case 'shape':
            return <ShapeRenderer key={el.id} element={el} />;
          case 'text':
            return <TextRenderer key={el.id} element={el} />;
          case 'sticky':
            return <StickyNoteRenderer key={el.id} element={el} />;
          case 'frame':
            return <FrameRenderer key={el.id} element={el} />;
          case 'arrow':
            return <ArrowRenderer key={el.id} element={el} elements={elements} />;
          case 'icon':
            return <IconRenderer key={el.id} element={el} />;
          case 'image':
            return <ImageRenderer key={el.id} element={el as ImageElement} />;
          default:
            return null;
        }
      })}
    </Layer>
  );
});
