import type { MenuProps } from '@mui/material/Menu';
import type { SxProps, Theme } from '@mui/material/styles';

const auxiliaryPanelMenuSx: SxProps<Theme> = {
  zIndex: (theme) => theme.zIndex.modal + 200,
};

export const auxiliaryPanelMenuProps: Partial<MenuProps> = {
  sx: auxiliaryPanelMenuSx,
  slotProps: {
    root: {
      sx: auxiliaryPanelMenuSx,
    },
  },
};
