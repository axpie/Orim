import { useMemo } from 'react';
import { Avatar, Box, Typography } from '@mui/material';
import NavigationIcon from '@mui/icons-material/Navigation';
import type { CursorPresence } from '../../../types/models';
import { projectWorldToViewport } from '../cameraUtils';

const EDGE_INSET = 28;
const OFFSCREEN_MARGIN = 8;

interface RemoteCursorEdgeIndicatorsProps {
  cursors: CursorPresence[];
  localConnectionId?: string | null;
  zoom: number;
  cameraX: number;
  cameraY: number;
  viewportWidth: number;
  viewportHeight: number;
  followingClientId?: string | null;
  onJumpToCursor?: (cursor: CursorPresence) => void;
}

interface IndicatorCursor {
  cursor: CursorPresence;
  left: number;
  top: number;
  angle: number;
}

function createIndicatorCursor(
  cursor: CursorPresence,
  zoom: number,
  cameraX: number,
  cameraY: number,
  viewportWidth: number,
  viewportHeight: number,
): IndicatorCursor | null {
  if (cursor.worldX == null || cursor.worldY == null) {
    return null;
  }

  const { x, y } = projectWorldToViewport(cursor.worldX, cursor.worldY, zoom, cameraX, cameraY);
  const isVisible = (
    x >= -OFFSCREEN_MARGIN
    && x <= viewportWidth + OFFSCREEN_MARGIN
    && y >= -OFFSCREEN_MARGIN
    && y <= viewportHeight + OFFSCREEN_MARGIN
  );

  if (isVisible) {
    return null;
  }

  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const relativeX = x - centerX;
  const relativeY = y - centerY;
  const safeHalfWidth = Math.max(1, centerX - EDGE_INSET);
  const safeHalfHeight = Math.max(1, centerY - EDGE_INSET);
  const scale = Math.max(
    Math.abs(relativeX) / safeHalfWidth,
    Math.abs(relativeY) / safeHalfHeight,
  );

  if (!Number.isFinite(scale) || scale <= 1) {
    return null;
  }

  return {
    cursor,
    left: centerX + relativeX / scale,
    top: centerY + relativeY / scale,
    angle: Math.atan2(relativeY, relativeX) * (180 / Math.PI) + 90,
  };
}

export function RemoteCursorEdgeIndicators({
  cursors,
  localConnectionId = null,
  zoom,
  cameraX,
  cameraY,
  viewportWidth,
  viewportHeight,
  followingClientId = null,
  onJumpToCursor,
}: RemoteCursorEdgeIndicatorsProps) {
  const indicators = useMemo(
    () => cursors
      .filter((cursor) => cursor.clientId !== localConnectionId)
      .map((cursor) => createIndicatorCursor(cursor, zoom, cameraX, cameraY, viewportWidth, viewportHeight))
      .filter((cursor): cursor is IndicatorCursor => cursor != null),
    [cameraX, cameraY, cursors, localConnectionId, viewportHeight, viewportWidth, zoom],
  );

  if (indicators.length === 0) {
    return null;
  }

  return (
    <Box data-whiteboard-export-hidden="true" sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11 }}>
      {indicators.map(({ cursor, left, top, angle }) => {
        const isFollowing = followingClientId === cursor.clientId;
        return (
          <Box
            key={cursor.clientId}
            component="button"
            type="button"
            onClick={() => onJumpToCursor?.(cursor)}
            sx={{
              position: 'absolute',
              left,
              top,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: 999,
              border: '1px solid',
              borderColor: isFollowing ? 'primary.main' : 'divider',
              backgroundColor: 'rgba(var(--mui-palette-background-paperChannel, 255 255 255) / 0.92)',
              boxShadow: isFollowing ? 4 : 2,
              color: 'text.primary',
              cursor: 'pointer',
              pointerEvents: 'auto',
              backdropFilter: 'blur(6px)',
            }}
            aria-label={`Jump to ${cursor.displayName}`}
          >
            <NavigationIcon
              sx={{
                fontSize: 18,
                color: cursor.colorHex,
                transform: `rotate(${angle}deg)`,
              }}
            />
            <Avatar
              sx={{
                width: 20,
                height: 20,
                fontSize: 11,
                bgcolor: cursor.colorHex,
              }}
            >
              {cursor.displayName.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="caption" fontWeight={700} sx={{ maxWidth: 120 }} noWrap>
              {cursor.displayName}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
