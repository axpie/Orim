import { Box, Slider, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { parseColorValue, toOpaqueHex, withUpdatedAlpha, withUpdatedRgb } from '../../../utils/colorValue';
import { useWhiteboardColorPalette } from './useWhiteboardColorPalette';

interface ColorInputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorInputField({ label, value, onChange }: ColorInputFieldProps) {
  const { t } = useTranslation();
  const parsed = parseColorValue(value);
  const { themeColors, regularColors } = useWhiteboardColorPalette();

  const renderSwatchGroup = (groupLabel: string, colors: string[]) => {
    if (colors.length === 0) {
      return null;
    }

    return (
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          {groupLabel}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {colors.map((color) => (
            <Box
              key={`${groupLabel}-${color}`}
              component="button"
              type="button"
              onClick={() => onChange(color)}
              aria-label={`${groupLabel}: ${color}`}
              sx={{
                width: 24,
                height: 24,
                p: 0,
                borderRadius: 0.75,
                border: value === color ? '2px solid' : '1px solid',
                borderColor: value === color ? 'primary.main' : 'divider',
                bgcolor: color,
                cursor: 'pointer',
                appearance: 'none',
              }}
            />
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      {renderSwatchGroup(t('colors.themeColors', 'Theme-Farben'), themeColors)}
      {renderSwatchGroup(t('colors.regularColors', 'Weitere Farben'), regularColors)}
      <Box sx={{ display: 'grid', gridTemplateColumns: '64px 1fr 72px', gap: 1, alignItems: 'center' }}>
        <TextField
          aria-label={`${label} RGB`}
          type="color"
          size="small"
          value={toOpaqueHex(value)}
          onChange={(e) => onChange(withUpdatedRgb(value, e.target.value))}
          InputProps={{ sx: { height: 40, px: 0.5 } }}
        />
        <Box sx={{ px: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
            {label}
          </Typography>
          <Slider
            size="small"
            value={Math.round(parsed.alpha * 100)}
            min={0}
            max={100}
            onChange={(_, nextValue) => onChange(withUpdatedAlpha(value, Number(nextValue)))}
          />
        </Box>
        <TextField
          label="Alpha"
          size="small"
          type="number"
          value={Math.round(parsed.alpha * 100)}
          onChange={(e) => onChange(withUpdatedAlpha(value, Number(e.target.value)))}
          inputProps={{ min: 0, max: 100 }}
        />
      </Box>
    </Box>
  );
}
