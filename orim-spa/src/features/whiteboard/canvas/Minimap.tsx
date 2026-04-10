import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { BoardElement } from '../../../types/models';
import {
  type BoundingBox,
  type MinimapLayout,
  computeMinimapLayout,
  getViewportCenterFromMinimapPosition,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
} from './minimapLayout';

const PADDING = 50;

interface MinimapProps {
  elements: BoardElement[];
  cameraX: number;
  cameraY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  onNavigate: (worldX: number, worldY: number) => void;
  onClose: () => void;
}

interface CanvasPoint {
  x: number;
  y: number;
}

function computeBoundingBox(elements: BoardElement[], vpMinX: number, vpMinY: number, vpMaxX: number, vpMaxY: number): BoundingBox {
  let minX = vpMinX;
  let minY = vpMinY;
  let maxX = vpMaxX;
  let maxY = vpMaxY;

  for (const el of elements) {
    if (el.$type === 'arrow') {
      const sx = el.sourceX ?? el.x;
      const sy = el.sourceY ?? el.y;
      const tx = el.targetX ?? el.x + el.width;
      const ty = el.targetY ?? el.y + el.height;
      minX = Math.min(minX, sx, tx);
      minY = Math.min(minY, sy, ty);
      maxX = Math.max(maxX, sx, tx);
      maxY = Math.max(maxY, sy, ty);
    } else {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
  }

  minX -= PADDING;
  minY -= PADDING;
  maxX += PADDING;
  maxY += PADDING;

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function isPointInsideViewport(point: CanvasPoint, layout: MinimapLayout): boolean {
  return point.x >= layout.viewportLeft
    && point.x <= layout.viewportLeft + layout.viewportWidth
    && point.y >= layout.viewportTop
    && point.y <= layout.viewportTop + layout.viewportHeight;
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, scale: number, offsetX: number, offsetY: number) {
  const x = (el.x - offsetX) * scale;
  const y = (el.y - offsetY) * scale;
  const w = el.width * scale;
  const h = el.height * scale;

  switch (el.$type) {
    case 'shape':
      ctx.fillStyle = el.fillColor || '#90caf9';
      ctx.fillRect(x, y, w, h);
      break;

    case 'text':
    case 'richtext':
    case 'markdown':
      ctx.fillStyle = '#9e9e9e';
      ctx.fillRect(x, y, w, h);
      break;

    case 'sticky':
      ctx.fillStyle = el.fillColor || '#fff176';
      ctx.fillRect(x, y, w, h);
      break;

    case 'frame':
      ctx.strokeStyle = el.strokeColor || '#616161';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      break;

    case 'arrow': {
      const sx = ((el.sourceX ?? el.x) - offsetX) * scale;
      const sy = ((el.sourceY ?? el.y) - offsetY) * scale;
      const tx = ((el.targetX ?? el.x + el.width) - offsetX) * scale;
      const ty = ((el.targetY ?? el.y + el.height) - offsetY) * scale;
      ctx.strokeStyle = el.strokeColor || '#424242';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      break;
    }

    case 'icon':
      ctx.fillStyle = el.color || '#616161';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(1.5, Math.min(w, h) / 2), 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'file':
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(x, y, w, h);
      break;

    case 'drawing': {
      const pts = el.points;
      if (pts.length < 4) break;
      ctx.strokeStyle = el.strokeColor || '#424242';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i], py = pts[i + 1];
        if (isNaN(px) || isNaN(py)) {
          penDown = false;
          continue;
        }
        const sx = (px - offsetX) * scale;
        const sy = (py - offsetY) * scale;
        if (!penDown) {
          ctx.moveTo(sx, sy);
          penDown = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
      break;
    }
  }
}

export function Minimap({ elements, cameraX, cameraY, zoom, viewportWidth, viewportHeight, onNavigate, onClose }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [isDraggingViewport, setIsDraggingViewport] = useState(false);
  const [isHoveringViewport, setIsHoveringViewport] = useState(false);

  const vpWorldMinX = -cameraX / zoom;
  const vpWorldMinY = -cameraY / zoom;
  const vpWorldW = viewportWidth / zoom;
  const vpWorldH = viewportHeight / zoom;

  const bounds = useMemo(
    () => computeBoundingBox(elements, vpWorldMinX, vpWorldMinY, vpWorldMinX + vpWorldW, vpWorldMinY + vpWorldH),
    [elements, vpWorldMinX, vpWorldMinY, vpWorldW, vpWorldH],
  );

  const layout = useMemo(
    () => computeMinimapLayout(bounds, vpWorldMinX, vpWorldMinY, vpWorldW, vpWorldH),
    [bounds, vpWorldMinX, vpWorldMinY, vpWorldW, vpWorldH],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MINIMAP_WIDTH * dpr;
    canvas.height = MINIMAP_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    ctx.save();
    ctx.translate(layout.padX, layout.padY);

    for (const el of elements) {
      drawElement(ctx, el, layout.scale, bounds.minX, bounds.minY);
    }

    ctx.fillStyle = 'rgba(33, 150, 243, 0.12)';
    ctx.fillRect(
      layout.viewportLeft - layout.padX,
      layout.viewportTop - layout.padY,
      layout.viewportWidth,
      layout.viewportHeight,
    );
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      layout.viewportLeft - layout.padX,
      layout.viewportTop - layout.padY,
      layout.viewportWidth,
      layout.viewportHeight,
    );

    ctx.restore();
  }, [bounds.minX, bounds.minY, elements, layout]);

  const navigateToCanvasPoint = useCallback((point: CanvasPoint) => {
    const worldX = (point.x - layout.padX) / layout.scale + bounds.minX;
    const worldY = (point.y - layout.padY) / layout.scale + bounds.minY;
    onNavigate(worldX, worldY);
  }, [bounds.minX, bounds.minY, layout.padX, layout.padY, layout.scale, onNavigate]);

  const navigateToViewportPosition = useCallback((left: number, top: number) => {
    const nextCenter = getViewportCenterFromMinimapPosition(left, top, bounds, layout);
    onNavigate(nextCenter.worldX, nextCenter.worldY);
  }, [bounds, layout, onNavigate]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(canvas, event);
    if (isPointInsideViewport(point, layout)) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        offsetX: point.x - layout.viewportLeft,
        offsetY: point.y - layout.viewportTop,
      };
      setIsDraggingViewport(true);
      setIsHoveringViewport(true);
      return;
    }

    navigateToCanvasPoint(point);
  }, [layout, navigateToCanvasPoint]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(canvas, event);
    const dragState = dragStateRef.current;
    if (dragState?.pointerId === event.pointerId) {
      event.preventDefault();
      navigateToViewportPosition(point.x - dragState.offsetX, point.y - dragState.offsetY);
      return;
    }

    setIsHoveringViewport(isPointInsideViewport(point, layout));
  }, [layout, navigateToViewportPosition]);

  const stopDragging = useCallback((pointerId?: number) => {
    const canvas = canvasRef.current;
    if (pointerId != null && canvas?.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }

    dragStateRef.current = null;
    setIsDraggingViewport(false);
  }, []);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    stopDragging(event.pointerId);
  }, [stopDragging]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    stopDragging(event.pointerId);
    setIsHoveringViewport(false);
  }, [stopDragging]);

  const handlePointerLeave = useCallback(() => {
    if (!dragStateRef.current) {
      setIsHoveringViewport(false);
    }
  }, []);

  const cursor = isDraggingViewport ? 'grabbing' : isHoveringViewport ? 'grab' : 'pointer';

  return (
    <Box
      sx={{
        width: MINIMAP_WIDTH,
        height: MINIMAP_HEIGHT,
        position: 'relative',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: (theme) =>
          theme.palette.mode === 'dark'
            ? 'rgba(30, 30, 30, 0.85)'
            : 'rgba(255, 255, 255, 0.85)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        style={{
          width: MINIMAP_WIDTH,
          height: MINIMAP_HEIGHT,
          display: 'block',
          cursor,
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
      />
      <IconButton
        size="small"
        onClick={onClose}
        sx={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 20,
          height: 20,
          bgcolor: 'rgba(0,0,0,0.25)',
          color: '#fff',
          '&:hover': { bgcolor: 'rgba(0,0,0,0.45)' },
          p: 0,
        }}
      >
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  );
}
