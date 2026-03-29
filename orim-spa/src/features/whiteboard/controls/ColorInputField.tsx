import { Box, Slider, TextField, Typography } from '@mui/material';
import { parseColorValue, toOpaqueHex, withUpdatedAlpha, withUpdatedRgb } from '../../../utils/colorValue';

interface ColorInputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorInputField({ label, value, onChange }: ColorInputFieldProps) {
  const parsed = parseColorValue(value);

  return (
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
  );
}