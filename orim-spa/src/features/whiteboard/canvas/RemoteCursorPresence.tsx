import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Label, Line, Rect, Tag, Text } from 'react-konva';
import { useBoardStore } from '../store/boardStore';

const CURSOR_SMOOTHING_MS = 70;
const POSITION_EPSILON = 0.25;

interface RemoteCursorPresenceProps {
  localPresenceClientId?: string | null;
  zoom: number;
}

interface VisibleRemoteCursor {
  clientId: string;
  displayName: string;
  colorHex: string;
  targetX: number;
  targetY: number;
  selectedElementIds?: string[];
}

interface AnimatedRemoteCursor extends VisibleRemoteCursor {
  renderedX: number;
  renderedY: number;
}

function RemoteCursorPresenceInner({ localPresenceClientId = null, zoom }: RemoteCursorPresenceProps) {
  const remoteCursors = useBoardStore((state) => state.remoteCursors);
  const getElementById = useBoardStore((state) => state.getElementById);
  const [animatedCursors, setAnimatedCursors] = useState<AnimatedRemoteCursor[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const animatedCursorsRef = useRef<AnimatedRemoteCursor[]>([]);

  const cursorPointerPoints = useMemo(
    () => [0, 0, 0, 24 / zoom, 5 / zoom, 18 / zoom, 8 / zoom, 28 / zoom, 12 / zoom, 26 / zoom, 9 / zoom, 16 / zoom, 18 / zoom, 16 / zoom],
    [zoom],
  );

  const visibleRemoteCursors = useMemo<VisibleRemoteCursor[]>(
    () => remoteCursors
      .filter((cursor) => cursor.clientId !== localPresenceClientId && cursor.worldX != null && cursor.worldY != null)
      .map((cursor) => ({
        clientId: cursor.clientId,
        displayName: cursor.displayName,
        colorHex: cursor.colorHex,
        targetX: cursor.worldX ?? 0,
        targetY: cursor.worldY ?? 0,
        selectedElementIds: cursor.selectedElementIds,
      })),
    [localPresenceClientId, remoteCursors],
  );

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameAtRef.current = null;
  }, []);

  const stepAnimation = useCallback(function stepAnimation(timestamp: number) {
    const lastFrameAt = lastFrameAtRef.current ?? timestamp;
    const deltaMs = Math.min(Math.max(timestamp - lastFrameAt, 1), 64);
    lastFrameAtRef.current = timestamp;

    const smoothing = 1 - Math.exp(-deltaMs / CURSOR_SMOOTHING_MS);
    let hasMovement = false;

    setAnimatedCursors((current) => current.map((cursor) => {
      const dx = cursor.targetX - cursor.renderedX;
      const dy = cursor.targetY - cursor.renderedY;

      if (Math.abs(dx) <= POSITION_EPSILON && Math.abs(dy) <= POSITION_EPSILON) {
        if (cursor.renderedX === cursor.targetX && cursor.renderedY === cursor.targetY) {
          return cursor;
        }

        return {
          ...cursor,
          renderedX: cursor.targetX,
          renderedY: cursor.targetY,
        };
      }

      hasMovement = true;
      return {
        ...cursor,
        renderedX: cursor.renderedX + dx * smoothing,
        renderedY: cursor.renderedY + dy * smoothing,
      };
    }));

    if (hasMovement) {
      animationFrameRef.current = window.requestAnimationFrame(stepAnimation);
      return;
    }

    animationFrameRef.current = null;
    lastFrameAtRef.current = null;
  }, []);

  const ensureAnimationLoop = useCallback(() => {
    if (animationFrameRef.current != null) {
      return;
    }

    lastFrameAtRef.current = null;
    animationFrameRef.current = window.requestAnimationFrame(stepAnimation);
  }, [stepAnimation]);

  useEffect(() => {
    animatedCursorsRef.current = animatedCursors;
  }, [animatedCursors]);

  useEffect(() => {
    if (visibleRemoteCursors.length === 0) {
      stopAnimationLoop();
      setAnimatedCursors([]);
      return;
    }

    const currentCursors = animatedCursorsRef.current;
    const currentByClientId = new Map(currentCursors.map((cursor) => [cursor.clientId, cursor]));
    const shouldAnimate = visibleRemoteCursors.some((cursor) => {
      const existing = currentByClientId.get(cursor.clientId);
      return existing != null && (existing.targetX !== cursor.targetX || existing.targetY !== cursor.targetY);
    });

    setAnimatedCursors((current) => {
      const nextByClientId = new Map(current.map((cursor) => [cursor.clientId, cursor]));
      const next = visibleRemoteCursors.map((cursor) => {
        const existing = nextByClientId.get(cursor.clientId);
        if (!existing) {
          return {
            ...cursor,
            renderedX: cursor.targetX,
            renderedY: cursor.targetY,
          };
        }

        if (
          existing.displayName === cursor.displayName
          && existing.colorHex === cursor.colorHex
          && existing.targetX === cursor.targetX
          && existing.targetY === cursor.targetY
          && existing.selectedElementIds === cursor.selectedElementIds
        ) {
          return existing;
        }

        return {
          ...existing,
          displayName: cursor.displayName,
          colorHex: cursor.colorHex,
          targetX: cursor.targetX,
          targetY: cursor.targetY,
          selectedElementIds: cursor.selectedElementIds,
        };
      });

      if (current.length !== next.length) {
        return next;
      }

      const changed = next.some((cursor, index) => cursor !== current[index]);
      return changed ? next : current;
    });

    if (shouldAnimate) {
      ensureAnimationLoop();
      return;
    }

    const hasSettledCursor = currentCursors.some((cursor) => (
      Math.abs(cursor.targetX - cursor.renderedX) > POSITION_EPSILON
      || Math.abs(cursor.targetY - cursor.renderedY) > POSITION_EPSILON
    ));

    if (hasSettledCursor) {
      ensureAnimationLoop();
    }
  }, [ensureAnimationLoop, stopAnimationLoop, visibleRemoteCursors]);

  useEffect(() => stopAnimationLoop, [stopAnimationLoop]);

  // Collect remote element selections for rendering outlines
  const remoteElementSelections = useMemo(() => {
    const selections: { elementId: string; colorHex: string; displayName: string }[] = [];
    for (const cursor of remoteCursors) {
      if (cursor.clientId === localPresenceClientId) continue;
      for (const elementId of cursor.selectedElementIds ?? []) {
        selections.push({ elementId, colorHex: cursor.colorHex, displayName: cursor.displayName });
      }
    }
    return selections;
  }, [remoteCursors, localPresenceClientId]);

  return (
    <>
      {/* Element-level editing indicators */}
      {remoteElementSelections.map(({ elementId, colorHex, displayName }) => {
        const element = getElementById(elementId);
        // Arrows don't have meaningful x/y/width/height bounds; skip them to avoid floating rectangles.
        if (!element || element.$type === 'arrow' || element.x == null || element.y == null) return null;
        const w = element.width ?? 100;
        const h = element.height ?? 40;
        return (
          <Group key={`sel-${elementId}-${colorHex}`} listening={false}>
            <Rect
              x={element.x - 3 / zoom}
              y={element.y - 3 / zoom}
              width={w + 6 / zoom}
              height={h + 6 / zoom}
              stroke={colorHex}
              strokeWidth={2 / zoom}
              cornerRadius={4 / zoom}
              dash={[6 / zoom, 3 / zoom]}
              fillEnabled={false}
            />
            <Label x={element.x} y={element.y - 18 / zoom}>
              <Tag fill={colorHex} cornerRadius={3 / zoom} opacity={0.85} />
              <Text text={displayName} fontSize={10 / zoom} fill="#ffffff" padding={3 / zoom} />
            </Label>
          </Group>
        );
      })}
      {/* Remote cursors */}
      {animatedCursors.map((cursor) => (
        <Group key={cursor.clientId} x={cursor.renderedX} y={cursor.renderedY} listening={false}>
          <Line
            points={cursorPointerPoints}
            closed
            fill="#111827"
            opacity={0.22}
            strokeEnabled={false}
            x={1.5 / zoom}
            y={2 / zoom}
          />
          <Line
            points={cursorPointerPoints}
            closed
            fill="#FFFFFF"
            stroke="#111827"
            strokeWidth={1.6 / zoom}
            lineJoin="round"
          />
          <Circle x={13 / zoom} y={24 / zoom} radius={4 / zoom} fill={cursor.colorHex} stroke="#FFFFFF" strokeWidth={1 / zoom} />
          <Label x={20 / zoom} y={10 / zoom}>
            <Tag
              fill={cursor.colorHex}
              cornerRadius={6 / zoom}
              opacity={0.92}
            />
            <Text
              text={cursor.displayName}
              fontSize={12 / zoom}
              fill="#ffffff"
              padding={5 / zoom}
            />
          </Label>
        </Group>
      ))}
    </>
  );
}

export const RemoteCursorPresence = memo(RemoteCursorPresenceInner);
