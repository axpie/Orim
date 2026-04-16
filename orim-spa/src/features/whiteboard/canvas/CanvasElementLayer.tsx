import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Group, Layer } from 'react-konva';
import type Konva from 'konva';
import { ShapeRenderer } from '../shapes/ShapeRenderer';
import { TextRenderer } from '../shapes/TextRenderer';
import { RichTextRenderer } from '../shapes/RichTextRenderer';
import { MarkdownRenderer } from '../shapes/MarkdownRenderer';
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
  onFormattedTextViewportMount?: (elementId: string, node: HTMLDivElement | null) => void;
  formattedTextInteractable?: boolean;
  onFormattedTextNativeScroll?: (elementId: string, scrollLeft: number, scrollTop: number) => void;
  onFormattedTextHeightRequired?: (elementId: string, requiredHeight: number) => void;
}

const ZIndexedLayer = memo(function ZIndexedLayer({ domZIndex, children }: { domZIndex: number; children: ReactNode }) {
  const layerRef = useRef<Konva.Layer>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) {
      return;
    }

    const z = String(domZIndex);
    const sceneCanvas = layer.getCanvas()._canvas;
    const hitCanvas = layer.getHitCanvas()._canvas;
    sceneCanvas.style.zIndex = z;
    hitCanvas.style.zIndex = z;
  }, [domZIndex]);

  return <Layer ref={layerRef}>{children}</Layer>;
});

export const CanvasElementLayer = memo(function CanvasElementLayer({
  elements,
  boardDefaults,
  onFormattedTextViewportMount,
  formattedTextInteractable,
  onFormattedTextNativeScroll,
  onFormattedTextHeightRequired,
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
  const minZIndex = sorted.length > 0 ? (sorted[0].zIndex ?? 0) : 0;

  type RenderedElement = { key: string; domZIndex: number; isHtmlPortal: boolean; content: ReactNode };
  const rendered: RenderedElement[] = [];

  for (const el of sorted) {
    const smooth = smoothEntries[el.id];
    const elX = smooth ? smooth.renderedX : el.x;
    const elY = smooth ? smooth.renderedY : el.y;
    const effectiveEl = smooth ? { ...el, x: elX, y: elY } : el;
    const centerX = elX + el.width / 2;
    const centerY = elY + el.height / 2;
    // Keep element layers above the grid and below UI overlays while preserving
    // relative Z-order among all whiteboard elements, including Html-backed text.
    const domZIndex = ((el.zIndex ?? 0) - minZIndex) + 100;

    let content: ReactNode = null;
    let isHtmlPortal = false;
    switch (el.$type) {
      case 'shape':
        content = (
          <Group
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
        break;
      case 'text':
        content = (
          <Group
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
        break;
      case 'richtext':
        isHtmlPortal = true;
        content = (
          <Group
            x={centerX}
            y={centerY}
            offsetX={centerX}
            offsetY={centerY}
            rotation={el.rotation ?? 0}
            data-element-id={el.id}
          >
            <RichTextRenderer
              element={effectiveEl as typeof el}
              domZIndex={domZIndex}
              onViewportMount={onFormattedTextViewportMount}
              interactable={formattedTextInteractable}
              onNativeScroll={onFormattedTextNativeScroll}
              onHeightRequired={onFormattedTextHeightRequired}
            />
          </Group>
        );
        break;
      case 'markdown':
        isHtmlPortal = true;
        content = (
          <Group
            x={centerX}
            y={centerY}
            offsetX={centerX}
            offsetY={centerY}
            rotation={el.rotation ?? 0}
            data-element-id={el.id}
          >
            <MarkdownRenderer
              element={effectiveEl as typeof el}
              domZIndex={domZIndex}
              onViewportMount={onFormattedTextViewportMount}
              interactable={formattedTextInteractable}
              onNativeScroll={onFormattedTextNativeScroll}
              onHeightRequired={onFormattedTextHeightRequired}
            />
          </Group>
        );
        break;
      case 'sticky':
        content = (
          <Group
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
        break;
      case 'frame':
        content = (
          <Group
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
        break;
      case 'arrow':
        content = <ArrowRenderer element={el} elements={elements} />;
        break;
      case 'icon':
        content = (
          <Group
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
        break;
      case 'file':
        content = <FileRenderer element={effectiveEl as FileElement} />;
        break;
      case 'drawing':
        content = (
          <Group
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
        break;
      default:
        content = null;
        break;
    }

    if (!content) {
      continue;
    }

    rendered.push({ key: el.id, domZIndex, isHtmlPortal, content });
  }

  // Coalesce consecutive pure-Konva elements into shared layers to avoid the
  // "too many layers" warning on large boards. HTML-portal elements keep their
  // own layer so the portal DIV remains above its own canvas (preserving
  // pointer-event semantics for interactive text), and so their DOM z-index
  // can interleave with surrounding Konva canvases.
  type LayerRun = { key: string; domZIndex: number; children: ReactNode[] };
  const runs: LayerRun[] = [];
  let activeKonvaRun: LayerRun | null = null;
  for (const item of rendered) {
    if (item.isHtmlPortal) {
      runs.push({ key: item.key, domZIndex: item.domZIndex, children: [item.content] });
      activeKonvaRun = null;
    } else if (activeKonvaRun) {
      activeKonvaRun.children.push(<Fragment key={item.key}>{item.content}</Fragment>);
      activeKonvaRun.domZIndex = item.domZIndex;
    } else {
      activeKonvaRun = { key: item.key, domZIndex: item.domZIndex, children: [<Fragment key={item.key}>{item.content}</Fragment>] };
      runs.push(activeKonvaRun);
    }
  }

  return (
    <>
      {runs.map((run) => (
        <ZIndexedLayer key={run.key} domZIndex={run.domZIndex}>
          {run.children}
        </ZIndexedLayer>
      ))}
    </>
  );
});
