import { useCallback, useEffect, useRef } from 'react';
import type { CursorPresence } from '../../types/models';
import { useBoardStore } from './store/boardStore';
import { getCenteredCameraPosition } from './cameraUtils';

const FOLLOW_CAMERA_SETTLE_DISTANCE = 0.5;
const FOLLOW_CAMERA_SMOOTHING_MS = 140;
const FOLLOW_ZOOM_SETTLE_THRESHOLD = 0.001;

export function useFollowCamera(
  followingClientId: string | null,
  remoteCursors: CursorPresence[],
  setFollowingClientId: (clientId: string | null) => void,
) {
  const setCamera = useBoardStore((state) => state.setCamera);
  const setZoom = useBoardStore((state) => state.setZoom);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const targetCameraRef = useRef<{ cameraX: number; cameraY: number } | null>(null);
  const targetZoomRef = useRef<number | null>(null);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastTimestampRef.current = null;
  }, []);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  useEffect(() => {
    if (!followingClientId) {
      targetCameraRef.current = null;
      targetZoomRef.current = null;
      stopAnimation();
      return;
    }

    const followed = remoteCursors.find((cursor) => cursor.clientId === followingClientId);
    if (!followed) {
      targetCameraRef.current = null;
      targetZoomRef.current = null;
      stopAnimation();
      setFollowingClientId(null);
      return;
    }

    const hasViewport =
      followed.viewportCameraX != null &&
      followed.viewportCameraY != null &&
      followed.viewportZoom != null;

    if (hasViewport) {
      targetCameraRef.current = {
        cameraX: followed.viewportCameraX!,
        cameraY: followed.viewportCameraY!,
      };
      targetZoomRef.current = followed.viewportZoom!;
    } else {
      if (followed.worldX == null || followed.worldY == null) {
        return;
      }

      const { zoom, viewportWidth, viewportHeight } = useBoardStore.getState();
      targetCameraRef.current = getCenteredCameraPosition(
        followed.worldX,
        followed.worldY,
        zoom,
        viewportWidth,
        viewportHeight,
      );
      targetZoomRef.current = null;
    }

    if (animationFrameRef.current != null) {
      return;
    }

    const tick = (timestamp: number) => {
      const targetCamera = targetCameraRef.current;
      if (!targetCamera || !useBoardStore.getState().followingClientId) {
        stopAnimation();
        return;
      }

      const { cameraX: currentCameraX, cameraY: currentCameraY, zoom: currentZoom } = useBoardStore.getState();
      const deltaTime = lastTimestampRef.current == null
        ? 16
        : Math.min(48, timestamp - lastTimestampRef.current);
      lastTimestampRef.current = timestamp;

      const smoothing = 1 - Math.exp(-deltaTime / FOLLOW_CAMERA_SMOOTHING_MS);
      const nextCameraX = currentCameraX + (targetCamera.cameraX - currentCameraX) * smoothing;
      const nextCameraY = currentCameraY + (targetCamera.cameraY - currentCameraY) * smoothing;

      const targetZoom = targetZoomRef.current;
      let nextZoom = currentZoom;
      let zoomSettled = true;

      if (targetZoom != null) {
        nextZoom = currentZoom + (targetZoom - currentZoom) * smoothing;
        zoomSettled = Math.abs(targetZoom - nextZoom) <= FOLLOW_ZOOM_SETTLE_THRESHOLD;
        if (!zoomSettled) {
          setZoom(nextZoom);
        } else {
          setZoom(targetZoom);
        }
      }

      const cameraSettled =
        Math.abs(targetCamera.cameraX - nextCameraX) <= FOLLOW_CAMERA_SETTLE_DISTANCE &&
        Math.abs(targetCamera.cameraY - nextCameraY) <= FOLLOW_CAMERA_SETTLE_DISTANCE;

      if (cameraSettled && zoomSettled) {
        setCamera(targetCamera.cameraX, targetCamera.cameraY);
        stopAnimation();
        return;
      }

      setCamera(nextCameraX, nextCameraY);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [followingClientId, remoteCursors, setCamera, setZoom, setFollowingClientId, stopAnimation]);
}
