import { useCallback, useEffect, useRef } from 'react';
import type { CursorPresence } from '../../types/models';
import { useBoardStore } from './store/boardStore';
import { getCenteredCameraPosition } from './cameraUtils';

const FOLLOW_CAMERA_SETTLE_DISTANCE = 0.5;
const FOLLOW_CAMERA_SMOOTHING_MS = 140;

export function useFollowCamera(
  followingClientId: string | null,
  remoteCursors: CursorPresence[],
  setFollowingClientId: (clientId: string | null) => void,
) {
  const setCamera = useBoardStore((state) => state.setCamera);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const targetCameraRef = useRef<{ cameraX: number; cameraY: number } | null>(null);

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
      stopAnimation();
      return;
    }

    const followed = remoteCursors.find((cursor) => cursor.clientId === followingClientId);
    if (!followed) {
      targetCameraRef.current = null;
      stopAnimation();
      setFollowingClientId(null);
      return;
    }

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

    if (animationFrameRef.current != null) {
      return;
    }

    const tick = (timestamp: number) => {
      const targetCamera = targetCameraRef.current;
      if (!targetCamera || !useBoardStore.getState().followingClientId) {
        stopAnimation();
        return;
      }

      const { cameraX: currentCameraX, cameraY: currentCameraY } = useBoardStore.getState();
      const deltaTime = lastTimestampRef.current == null
        ? 16
        : Math.min(48, timestamp - lastTimestampRef.current);
      lastTimestampRef.current = timestamp;

      const smoothing = 1 - Math.exp(-deltaTime / FOLLOW_CAMERA_SMOOTHING_MS);
      const nextCameraX = currentCameraX + (targetCamera.cameraX - currentCameraX) * smoothing;
      const nextCameraY = currentCameraY + (targetCamera.cameraY - currentCameraY) * smoothing;

      if (
        Math.abs(targetCamera.cameraX - nextCameraX) <= FOLLOW_CAMERA_SETTLE_DISTANCE
        && Math.abs(targetCamera.cameraY - nextCameraY) <= FOLLOW_CAMERA_SETTLE_DISTANCE
      ) {
        setCamera(targetCamera.cameraX, targetCamera.cameraY);
        stopAnimation();
        return;
      }

      setCamera(nextCameraX, nextCameraY);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [followingClientId, remoteCursors, setCamera, setFollowingClientId, stopAnimation]);
}
