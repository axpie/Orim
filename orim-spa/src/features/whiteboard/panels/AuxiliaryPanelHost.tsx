import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type ReactNode,
} from 'react';
import { Box, Drawer } from '@mui/material';

export interface AuxiliaryPanelDragHandleProps {
  draggable: boolean;
  onDragHandlePointerDown?: PointerEventHandler<HTMLDivElement>;
}

interface AuxiliaryPanelHostProps {
  open: boolean;
  mobile: boolean;
  width: number;
  onClose: () => void;
  children: (props: AuxiliaryPanelDragHandleProps) => ReactNode;
}

export function AuxiliaryPanelHost({
  open,
  mobile,
  width,
  onClose,
  children,
}: AuxiliaryPanelHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
    maxLeft: number;
    maxTop: number;
  } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dragging = dragState != null;

  const clampPosition = useCallback((left: number, top: number, maxLeft: number, maxTop: number) => ({
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
  }), []);

  const handleDragHandlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobile || event.button !== 0) {
      return;
    }

    const container = event.currentTarget.closest('[data-auxiliary-panel-container="true"]');
    const parent = container?.parentElement;
    if (!container || !parent) {
      return;
    }

    const panelRect = container.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const nextDragState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: panelRect.left - parentRect.left,
      startTop: panelRect.top - parentRect.top,
      maxLeft: Math.max(0, parentRect.width - panelRect.width),
      maxTop: Math.max(0, parentRect.height - panelRect.height),
    };

    setDragState(nextDragState);
    setPosition(clampPosition(nextDragState.startLeft, nextDragState.startTop, nextDragState.maxLeft, nextDragState.maxTop));
    event.preventDefault();
  }, [clampPosition, mobile]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      const nextLeft = dragState.startLeft + (event.clientX - dragState.startClientX);
      const nextTop = dragState.startTop + (event.clientY - dragState.startClientY);
      setPosition(clampPosition(nextLeft, nextTop, dragState.maxLeft, dragState.maxTop));
    };

    const stopDragging = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [clampPosition, dragState]);

  useEffect(() => {
    if (mobile || !position) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      const parent = container?.parentElement;
      if (!container || !parent) {
        return;
      }

      const panelRect = container.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const next = clampPosition(
        position.left,
        position.top,
        Math.max(0, parentRect.width - panelRect.width),
        Math.max(0, parentRect.height - panelRect.height),
      );

      if (next.left !== position.left || next.top !== position.top) {
        setPosition(next);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [clampPosition, mobile, position, width]);

  if (!open) {
    return null;
  }

  if (mobile) {
    return (
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: '100vw',
            maxWidth: '100vw',
          },
        }}
      >
        {children({ draggable: false })}
      </Drawer>
    );
  }

  return (
    <Box
      ref={containerRef}
      data-auxiliary-panel-container="true"
      sx={{
        position: 'absolute',
        top: position?.top ?? 16,
        right: position ? undefined : 16,
        left: position?.left,
        width: `min(${width}px, calc(100% - 32px))`,
        height: 'min(72vh, calc(100% - 32px))',
        maxHeight: 'calc(100% - 32px)',
        zIndex: 5,
        pointerEvents: 'auto',
        cursor: dragging ? 'grabbing' : undefined,
      }}
    >
      <Box sx={{ width: '100%', height: '100%' }}>
        {children({
          draggable: true,
          onDragHandlePointerDown: handleDragHandlePointerDown,
        })}
      </Box>
    </Box>
  );
}
