import { Box, Dialog, DialogContent, DialogTitle, Divider, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { getZOrderShortcutLabel } from '../zOrder';

interface ShortcutHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps) {
  const { t } = useTranslation();

  const sections = [
    {
      title: t('shortcuts.sections.editing'),
      items: [
        { keys: 'Cmd/Ctrl + Z', label: t('tools.undo') },
        { keys: 'Cmd/Ctrl + Shift + Z', label: t('tools.redo') },
        { keys: 'Cmd/Ctrl + Y', label: t('tools.redo') },
        { keys: 'Cmd/Ctrl + A', label: t('shortcuts.selectAll') },
        { keys: 'Cmd/Ctrl + C', label: t('shortcuts.copySelection') },
        { keys: 'Cmd/Ctrl + X', label: t('shortcuts.cutSelection') },
        { keys: 'Cmd/Ctrl + V', label: t('shortcuts.pasteSelection') },
        { keys: 'Cmd/Ctrl + D', label: t('shortcuts.duplicateSelection') },
        { keys: 'Cmd/Ctrl + G', label: t('tools.group') },
        { keys: 'Cmd/Ctrl + Shift + G', label: t('tools.ungroup') },
        { keys: getZOrderShortcutLabel('bring-forward'), label: t('tools.bringForward') },
        { keys: getZOrderShortcutLabel('send-backward'), label: t('tools.sendBackward') },
        { keys: getZOrderShortcutLabel('bring-to-front'), label: t('tools.bringToFront') },
        { keys: getZOrderShortcutLabel('send-to-back'), label: t('tools.sendToBack') },
        { keys: 'Delete / Backspace', label: t('shortcuts.deleteSelection') },
      ],
    },
    {
      title: t('shortcuts.sections.tools'),
      items: [
        { keys: 'V', label: t('tools.select') },
        { keys: 'R', label: t('tools.rectangle') },
        { keys: 'T', label: t('tools.text') },
        { keys: 'H', label: t('tools.hand') },
        { keys: 'Enter', label: t('shortcuts.startInlineEdit') },
        { keys: 'Escape', label: t('shortcuts.clearSelection') },
      ],
    },
    {
      title: t('shortcuts.sections.navigation'),
      items: [
        { keys: 'Space + Drag', label: t('shortcuts.temporaryPan') },
        { keys: 'Two-finger Scroll', label: t('shortcuts.trackpadPan') },
        { keys: 'Pinch', label: t('shortcuts.trackpadZoom') },
        { keys: 'Arrow Keys', label: t('shortcuts.moveSelection') },
        { keys: 'Shift + Arrow Keys', label: t('shortcuts.moveSelectionFast') },
      ],
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('shortcuts.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {t('shortcuts.description')}
        </Typography>

        <Box sx={{ display: 'grid', gap: 2 }}>
          {sections.map((section, sectionIndex) => (
            <Box key={section.title}>
              {sectionIndex > 0 && <Divider sx={{ mb: 2 }} />}
              <Typography variant="subtitle2" sx={{ mb: 1.25, fontWeight: 700 }}>
                {section.title}
              </Typography>
              <Box sx={{ display: 'grid', gap: 1 }}>
                {section.items.map((item) => (
                  <Box
                    key={`${section.title}-${item.keys}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '170px 1fr' },
                      gap: 1,
                      alignItems: 'start',
                    }}
                  >
                    <Typography
                      variant="body2"
                      component="div"
                      sx={{
                        fontFamily: 'Consolas, Monaco, monospace',
                        fontSize: '0.8125rem',
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        width: 'fit-content',
                      }}
                    >
                      {item.keys}
                    </Typography>
                    <Typography variant="body2">{item.label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
