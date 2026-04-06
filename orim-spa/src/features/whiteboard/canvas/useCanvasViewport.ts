import { useRef, useCallback, useEffect } from 'react';
import type Konva from 'konva';
import { MIN_ZOOM, MAX_ZOOM, isTrackpadPanWheelEvent, type SafariGestureEvent } from './canvasUtils';

export function useCanvasViewport(
  stageRef: React.RefObject<Konva.Stage | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  zoom: number,
  cameraX: number,
  cameraY: number,
  setZoom: (zoom: number) => void,
  setCamera: (x: number, y: number) => void,
) {
  const viewportStateRef = useRef({ zoom, cameraX, cameraY });
  const safariGestureRef = useRef<{ initialZoom: number; anchorWorldX: number; anchorWorldY: number } | null>(null);
  const lastSafariGestureAtRef = useRef(0);

  useEffect(() => {
    viewportStateRef.current = { zoom, cameraX, cameraY };
  }, [zoom, cameraX, cameraY]);

  // Safari trackpad gesture support
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const getGestureCenter = (event: SafariGestureEvent) => {
      const bounds = container.getBoundingClientRect();
      const centerX = typeof event.clientX === 'number' ? event.clientX - bounds.left : bounds.width / 2;
      const centerY = typeof event.clientY === 'number' ? event.clientY - bounds.top : bounds.height / 2;
      return { centerX, centerY };
    };

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;
      gestureEvent.preventDefault();
      lastSafariGestureAtRef.current = Date.now();
      const { zoom: currentZoom, cameraX: currentCameraX, cameraY: currentCameraY } = viewportStateRef.current;
      const { centerX, centerY } = getGestureCenter(gestureEvent);

      safariGestureRef.current = {
        initialZoom: currentZoom,
        anchorWorldX: (centerX - currentCameraX) / currentZoom,
        anchorWorldY: (centerY - currentCameraY) / currentZoom,
      };
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as SafariGestureEvent;
      const activeGesture = safariGestureRef.current;
      if (!activeGesture) {
        return;
      }

      gestureEvent.preventDefault();
      lastSafariGestureAtRef.current = Date.now();
      const { centerX, centerY } = getGestureCenter(gestureEvent);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, activeGesture.initialZoom * gestureEvent.scale));
      const nextCameraX = centerX - activeGesture.anchorWorldX * nextZoom;
      const nextCameraY = centerY - activeGesture.anchorWorldY * nextZoom;

      setZoom(nextZoom);
      setCamera(nextCameraX, nextCameraY);
    };

    const handleGestureEnd = (event: Event) => {
      (event as SafariGestureEvent).preventDefault();
      lastSafariGestureAtRef.current = Date.now();
      safariGestureRef.current = null;
    };

    container.addEventListener('gesturestart', handleGestureStart as EventListener, { passive: false });
    container.addEventListener('gesturechange', handleGestureChange as EventListener, { passive: false });
    container.addEventListener('gestureend', handleGestureEnd as EventListener, { passive: false });

    return () => {
      container.removeEventListener('gesturestart', handleGestureStart as EventListener);
      container.removeEventListener('gesturechange', handleGestureChange as EventListener);
      container.removeEventListener('gestureend', handleGestureEnd as EventListener);
    };
  }, [containerRef, setCamera, setZoom]);

  /** Convert stage pointer event position to world coords. */
  const getWorldPos = useCallback(
    (): { x: number; y: number } => {
      const stage = stageRef.current;
      if (!stage) return { x: 0, y: 0 };
      const pos = stage.getPointerPosition();
      if (!pos) return { x: 0, y: 0 };
      return {
        x: (pos.x - cameraX) / zoom,
        y: (pos.y - cameraY) / zoom,
      };
    },
    [stageRef, cameraX, cameraY, zoom],
  );

  const getScreenPos = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    return stage?.getPointerPosition() ?? null;
  }, [stageRef]);

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      if (safariGestureRef.current || Date.now() - lastSafariGestureAtRef.current < 80) {
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      if (isTrackpadPanWheelEvent(e.evt)) {
        setCamera(cameraX - e.evt.deltaX, cameraY - e.evt.deltaY);
        return;
      }

      const newZoom = e.evt.ctrlKey || e.evt.metaKey
        ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-e.evt.deltaY * 0.0025)))
        : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1)));

      // Anchor zoom at pointer position
      const newCameraX = pointer.x - ((pointer.x - cameraX) / zoom) * newZoom;
      const newCameraY = pointer.y - ((pointer.y - cameraY) / zoom) * newZoom;

      setZoom(newZoom);
      setCamera(newCameraX, newCameraY);
    },
    [stageRef, zoom, cameraX, cameraY, setZoom, setCamera],
  );

  return {
    getWorldPos,
    getScreenPos,
    handleWheel,
  };
}
