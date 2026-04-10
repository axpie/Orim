import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Group, Layer } from 'react-konva';
import { ShapeRenderer } from '../shapes/ShapeRenderer';
import { TextRenderer } from '../shapes/TextRenderer';
import { StickyNoteRenderer } from '../shapes/StickyNoteRenderer';
import { FrameRenderer } from '../shapes/FrameRenderer';
import { ArrowRenderer } from '../shapes/ArrowRenderer';
import { IconRenderer } from '../shapes/IconRenderer';
import { FileRenderer } from '../shapes/FileRenderer';
import { DrawingRenderer } from '../shapes/DrawingRenderer';
import type { BoardElement, FileElement, ThemeBoardDefaultsDefinition } from '../../../types/models';
import { useRemoteElementSmoothingStore } from '../store/remoteElementSmoothingStore';

interface CanvasElementLayerProps {
  elements: BoardElement[];
  boardDefaults: Pick<ThemeBoardDefaultsDefinition, 'strokeColor' | 'surfaceColor'>;
}

export const CanvasElementLayer = memo(function CanvasElementLayer({
  elements,
  boardDefaults,
}: CanvasElementLayerProps) {
  const smoothEntries = useRemoteElementSmoothingStore((s) => s.entries);
  const step = useRemoteElementSmoothingStore((s) => s.step);
  const hasEntries = Object.keys(smoothEntries).length > 0;
  const animFrameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);

  const runAnimation = useCallback(function runAnimation(timestamp: number) {
    const lastFrameAt = lastFrameAtRef.current ?? timestamp;
    const deltaMs = Math.min(Math.max(timestamp - lastFrameAt, 1), 64);
    lastFrameAtRef.current = timestamp;

    const hasMovement = step(deltaMs);

    if (hasMovement) {
      animFrameRef.current = window.requestAnimationFrame(runAnimation);
    } else {
      animFrameRef.current = null;
      lastFrameAtRef.current = null;
    }
  }, [step]);

  useEffect(() => {
    if (!hasEntries || animFrameRef.current != null) {
      return;
    }

    lastFrameAtRef.current = null;
    animFrameRef.current = window.requestAnimationFrame(runAnimation);
  }, [hasEntries, runAnimation]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current != null) {
        window.cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  const sorted = useMemo(
    () => [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [elements],
  );

  return (
    <Layer>
      {sorted.map((el) => {
        const smooth = smoothEntries[el.id];
        const elX = smooth ? smooth.renderedX : el.x;
        const elY = smooth ? smooth.renderedY : el.y;
        const effectiveEl = smooth ? { ...el, x: elX, y: elY } : el;
        const centerX = elX + el.width / 2;
        const centerY = elY + el.height / 2;

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
                <ShapeRenderer element={effectiveEl as typeof el} />
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
                <TextRenderer element={effectiveEl as typeof el} />
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
                <StickyNoteRenderer element={effectiveEl as typeof el} />
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
                <FrameRenderer element={effectiveEl as typeof el} boardDefaults={boardDefaults} />
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
                <IconRenderer element={effectiveEl as typeof el} />
              </Group>
            );
          case 'file':
            return <FileRenderer key={el.id} element={effectiveEl as FileElement} />;
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
                <DrawingRenderer element={effectiveEl as typeof el} />
              </Group>
            );
          default:
            return null;
        }
      })}
    </Layer>
  );
});
