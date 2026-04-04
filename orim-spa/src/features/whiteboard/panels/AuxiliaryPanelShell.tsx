import type { PropsWithChildren } from 'react';
import { Box, Divider, IconButton, Paper, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface AuxiliaryPanelShellProps extends PropsWithChildren {
  title: string;
  onClose: () => void;
  mobile?: boolean;
}

export function AuxiliaryPanelShell({
  title,
  onClose,
  mobile = false,
  children,
}: AuxiliaryPanelShellProps) {
  return (
    <Paper
      elevation={3}
      sx={{
        width: '100%',
        height: '100%',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: mobile ? 0 : 3,
        border: mobile ? 'none' : (theme) => `1px solid ${theme.palette.divider}`,
        pt: mobile ? 'env(safe-area-inset-top)' : 0,
        pb: mobile ? 'env(safe-area-inset-bottom)' : 0,
        bgcolor: 'background.paper',
        boxShadow: mobile ? undefined : 12,
        backdropFilter: mobile ? undefined : 'blur(8px)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, bgcolor: mobile ? undefined : 'background.default' }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Divider />
      {children}
    </Paper>
  );
}
