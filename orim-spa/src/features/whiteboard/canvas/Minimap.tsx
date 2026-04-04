import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { BoardElement } from '../../../types/models';

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
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

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
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

    case 'image':
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(x, y, w, h);
      break;

    case 'drawing': {
      const pts = el.points;
      if (pts.length < 4) break;
      ctx.strokeStyle = el.strokeColor || '#424242';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo((pts[0] + el.x - offsetX) * scale, (pts[1] + el.y - offsetY) * scale);
      for (let i = 2; i < pts.length; i += 2) {
        ctx.lineTo((pts[i] + el.x - offsetX) * scale, (pts[i + 1] + el.y - offsetY) * scale);
      }
      ctx.stroke();
      break;
    }
  }
}

export function Minimap({ elements, cameraX, cameraY, zoom, viewportWidth, viewportHeight, onNavigate, onClose }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport in world coordinates
  const vpWorldMinX = -cameraX / zoom;
  const vpWorldMinY = -cameraY / zoom;
  const vpWorldW = viewportWidth / zoom;
  const vpWorldH = viewportHeight / zoom;

  const bounds = useMemo(
    () => computeBoundingBox(elements, vpWorldMinX, vpWorldMinY, vpWorldMinX + vpWorldW, vpWorldMinY + vpWorldH),
    [elements, vpWorldMinX, vpWorldMinY, vpWorldW, vpWorldH],
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

    // Clear
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Scale to fit bounding box in minimap
    const scaleX = MINIMAP_WIDTH / bounds.width;
    const scaleY = MINIMAP_HEIGHT / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    const drawW = bounds.width * scale;
    const drawH = bounds.height * scale;
    const padX = (MINIMAP_WIDTH - drawW) / 2;
    const padY = (MINIMAP_HEIGHT - drawH) / 2;

    ctx.save();
    ctx.translate(padX, padY);

    // Draw elements
    for (const el of elements) {
      drawElement(ctx, el, scale, bounds.minX, bounds.minY);
    }

    // Draw viewport indicator
    const vx = (vpWorldMinX - bounds.minX) * scale;
    const vy = (vpWorldMinY - bounds.minY) * scale;
    const vw = vpWorldW * scale;
    const vh = vpWorldH * scale;

    ctx.fillStyle = 'rgba(33, 150, 243, 0.12)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);

    ctx.restore();
  }, [elements, cameraX, cameraY, zoom, viewportWidth, viewportHeight, bounds, vpWorldMinX, vpWorldMinY, vpWorldW, vpWorldH]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const scaleX = MINIMAP_WIDTH / bounds.width;
    const scaleY = MINIMAP_HEIGHT / bounds.height;
    const scale = Math.min(scaleX, scaleY);
    const drawW = bounds.width * scale;
    const drawH = bounds.height * scale;
    const padX = (MINIMAP_WIDTH - drawW) / 2;
    const padY = (MINIMAP_HEIGHT - drawH) / 2;

    const worldX = (clickX - padX) / scale + bounds.minX;
    const worldY = (clickY - padY) / scale + bounds.minY;

    onNavigate(worldX, worldY);
  }, [bounds, onNavigate]);

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
        style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT, display: 'block', cursor: 'pointer' }}
        onClick={handleClick}
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
