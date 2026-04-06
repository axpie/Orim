import { Box } from '@mui/material';

interface OrimLogoProps {
  compact?: boolean;
  textColor?: string;
}

export function OrimLogo({ compact = false, textColor = 'currentColor' }: OrimLogoProps) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 1 : 1.5 }} aria-label="ORIM">
      <Box component="svg" viewBox="0 0 72 72" sx={{ width: compact ? 32 : 40, height: compact ? 32 : 40, flexShrink: 0 }}>
        <defs>
          <linearGradient id="orim-spa-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B2C" />
            <stop offset="50%" stopColor="#FF3D7F" />
            <stop offset="100%" stopColor="#7B2FFF" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="68" height="68" rx="16" fill="none" stroke="url(#orim-spa-gradient)" strokeWidth="3" />
        <rect x="12" y="12" width="20" height="20" rx="5" fill="#FF6B2C" />
        <rect x="40" y="12" width="20" height="20" rx="5" fill="#FF3D7F" />
        <rect x="12" y="40" width="20" height="20" rx="5" fill="#7B2FFF" />
        <g transform="translate(42 40)">
          <path d="M0 0V20L5 15L8.5 22L11.5 20.5L8 14H14Z" fill="#FFF" stroke="#1A1A2E" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      </Box>
      {!compact && (
        <Box sx={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <Box component="span" sx={{ color: textColor, fontSize: 26, fontWeight: 800, letterSpacing: '-0.06em', textTransform: 'uppercase' }}>
            ORIM
          </Box>
          <Box sx={{ width: 18, height: 4, borderRadius: 99, background: 'linear-gradient(135deg, #FF6B2C 0%, #FF3D7F 50%, #7B2FFF 100%)' }} />
        </Box>
      )}
    </Box>
  );
}