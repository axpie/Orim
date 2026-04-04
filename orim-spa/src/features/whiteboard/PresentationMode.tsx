import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Fade, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useBoardStore } from './store/boardStore';
import type { Board, FrameElement } from '../../types/models';

interface PresentationModeProps {
  board: Board;
  onExit: () => void;
}

function getFrameSlides(board: Board): FrameElement[] {
  return (board.elements.filter((el) => el.$type === 'frame') as FrameElement[])
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function navigateToFrame(frame: FrameElement, viewportWidth: number, viewportHeight: number) {
  const paddingFraction = 0.05;
  const frameWidth = frame.width * (1 + 2 * paddingFraction);
  const frameHeight = frame.height * (1 + 2 * paddingFraction);
  const zoomX = viewportWidth / frameWidth;
  const zoomY = viewportHeight / frameHeight;
  const fitZoom = Math.min(zoomX, zoomY);

  const cameraX =
    frame.x -
    paddingFraction * frame.width -
    (viewportWidth / fitZoom - frame.width * (1 + 2 * paddingFraction)) / 2;
  const cameraY =
    frame.y -
    paddingFraction * frame.height -
    (viewportHeight / fitZoom - frame.height * (1 + 2 * paddingFraction)) / 2;

  useBoardStore.getState().setZoom(fitZoom);
  useBoardStore.getState().setCamera(-cameraX * fitZoom, -cameraY * fitZoom);
}

export function PresentationMode({ board, onExit }: PresentationModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const viewportWidth = useBoardStore((s) => s.viewportWidth);
  const viewportHeight = useBoardStore((s) => s.viewportHeight);

  const frames = useMemo(() => getFrameSlides(board), [board]);
  const totalSlides = frames.length;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides) return;
      setCurrentIndex(index);
      navigateToFrame(frames[index], viewportWidth, viewportHeight);
    },
    [frames, totalSlides, viewportWidth, viewportHeight],
  );

  const goToNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const goToPrevious = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  // Navigate to the first frame on mount
  useEffect(() => {
    if (frames.length > 0) {
      navigateToFrame(frames[0], viewportWidth, viewportHeight);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goToNext, goToPrevious, onExit]);

  if (totalSlides === 0) return null;

  return (
    <Fade in>
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Semi-transparent backdrop — lets the canvas show through */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'rgba(0,0,0,0.3)',
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        />

        {/* Exit button */}
        <IconButton
          onClick={onExit}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1,
            pointerEvents: 'auto',
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.45)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
          }}
        >
          <CloseIcon />
        </IconButton>

        {/* Previous arrow */}
        <IconButton
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          sx={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
            pointerEvents: 'auto',
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.35)',
            width: 48,
            height: 48,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' },
            '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(0,0,0,0.15)' },
          }}
        >
          <ChevronLeftIcon fontSize="large" />
        </IconButton>

        {/* Next arrow */}
        <IconButton
          onClick={goToNext}
          disabled={currentIndex === totalSlides - 1}
          sx={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1,
            pointerEvents: 'auto',
            color: '#fff',
            bgcolor: 'rgba(0,0,0,0.35)',
            width: 48,
            height: 48,
            '&:hover': { bgcolor: 'rgba(0,0,0,0.55)' },
            '&.Mui-disabled': { color: 'rgba(255,255,255,0.25)', bgcolor: 'rgba(0,0,0,0.15)' },
          }}
        >
          <ChevronRightIcon fontSize="large" />
        </IconButton>

        {/* Slide counter pill */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            pointerEvents: 'auto',
            bgcolor: 'rgba(0,0,0,0.55)',
            borderRadius: 999,
            px: 2.5,
            py: 0.75,
          }}
        >
          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 500, userSelect: 'none' }}>
            {currentIndex + 1} / {totalSlides}
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
}
