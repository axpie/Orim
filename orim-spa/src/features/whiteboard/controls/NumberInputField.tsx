import { Box, IconButton, TextField } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

interface NumberInputFieldProps {
  label?: string;
  ariaLabel?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  size?: 'small' | 'medium';
}

export function NumberInputField({
  label,
  ariaLabel,
  value,
  onChange,
  step = 1,
  min,
  max,
  size = 'small',
}: NumberInputFieldProps) {
  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', flex: 1 }}>
      <TextField
        label={label}
        aria-label={ariaLabel ?? label}
        size={size}
        type="number"
        value={value}
        fullWidth
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (!isNaN(parsed)) onChange(clamp(parsed));
        }}
        sx={{
          '& input[type=number]': { MozAppearance: 'textfield' },
          '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
          '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
          '& .MuiInputBase-input': { pr: '26px' },
        }}
      />
      <Box sx={{
        position: 'absolute',
        right: 2,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <IconButton
          size="small"
          tabIndex={-1}
          sx={{ p: 0, height: 14, width: 20, borderRadius: 0.5 }}
          onClick={() => onChange(clamp(value + step))}
        >
          <KeyboardArrowUpIcon sx={{ fontSize: 13 }} />
        </IconButton>
        <IconButton
          size="small"
          tabIndex={-1}
          sx={{ p: 0, height: 14, width: 20, borderRadius: 0.5 }}
          onClick={() => onChange(clamp(value - step))}
        >
          <KeyboardArrowDownIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Box>
    </Box>
  );
}
