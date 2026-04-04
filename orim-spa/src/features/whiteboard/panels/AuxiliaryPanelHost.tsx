import type { PropsWithChildren } from 'react';
import { Box, Drawer } from '@mui/material';

interface AuxiliaryPanelHostProps extends PropsWithChildren {
  open: boolean;
  mobile: boolean;
  width: number;
  onClose: () => void;
}

export function AuxiliaryPanelHost({
  open,
  mobile,
  width,
  onClose,
  children,
}: AuxiliaryPanelHostProps) {
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
        {children}
      </Drawer>
    );
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: `min(${width}px, calc(100% - 32px))`,
        height: 'min(72vh, calc(100% - 32px))',
        maxHeight: 'calc(100% - 32px)',
        zIndex: 5,
        pointerEvents: 'auto',
      }}
    >
      {children}
    </Box>
  );
}
