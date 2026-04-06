import { Box, MenuItem, SvgIcon, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  mdiArrangeBringForward,
  mdiArrangeBringToFront,
  mdiArrangeSendBackward,
  mdiArrangeSendToBack,
} from '@mdi/js';
import {
  getZOrderShortcutLabel,
  type ZOrderAction,
  type ZOrderAvailability,
} from './zOrder';

interface ZOrderMenuItemsProps {
  availability: ZOrderAvailability;
  onSelect: (action: ZOrderAction) => void;
}

const menuActions: Array<{ action: ZOrderAction; iconPath: string; labelKey: string }> = [
  { action: 'bring-to-front', iconPath: mdiArrangeBringToFront, labelKey: 'tools.bringToFront' },
  { action: 'bring-forward', iconPath: mdiArrangeBringForward, labelKey: 'tools.bringForward' },
  { action: 'send-backward', iconPath: mdiArrangeSendBackward, labelKey: 'tools.sendBackward' },
  { action: 'send-to-back', iconPath: mdiArrangeSendToBack, labelKey: 'tools.sendToBack' },
];

export function ZOrderMenuItems({ availability, onSelect }: ZOrderMenuItemsProps) {
  const { t } = useTranslation();

  return menuActions.map(({ action, iconPath, labelKey }) => (
    <MenuItem
      key={action}
      disabled={!availability[action]}
      onClick={() => onSelect(action)}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          minWidth: 240,
        }}
      >
        <SvgIcon fontSize="small" sx={{ color: 'text.secondary' }}>
          <path d={iconPath} />
        </SvgIcon>
        <Typography variant="body2" sx={{ flex: 1 }}>
          {t(labelKey)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {getZOrderShortcutLabel(action)}
        </Typography>
      </Box>
    </MenuItem>
  ));
}
