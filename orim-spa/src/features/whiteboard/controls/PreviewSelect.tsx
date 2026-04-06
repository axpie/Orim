import { useId, type ReactNode } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select } from '@mui/material';

export interface PreviewSelectOption {
  value: string;
  ariaLabel: string;
  preview: ReactNode;
}

interface PreviewSelectProps {
  label: string;
  value: string;
  options: PreviewSelectOption[];
  onChange: (value: string) => void;
}

export function PreviewSelect({ label, value, options, onChange }: PreviewSelectProps) {
  const labelId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <FormControl size="small" fullWidth>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        value={value}
        label={label}
        onChange={(event) => onChange(event.target.value)}
        renderValue={() => (
          <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 22, color: 'text.primary' }}>
            {selected.preview}
          </Box>
        )}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} aria-label={option.ariaLabel} title={option.ariaLabel}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 28, color: 'text.primary' }}>
              {option.preview}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}