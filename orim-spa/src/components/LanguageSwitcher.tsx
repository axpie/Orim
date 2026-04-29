import { useTranslation } from 'react-i18next';
import { Box, Tooltip } from '@mui/material';

const FLAGS: Record<string, { svg: React.ReactNode; label: string }> = {
  de: {
    label: 'Deutsch',
    svg: (
      <svg viewBox="0 0 5 3" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
        <rect width="5" height="1" y="0" fill="#000000" />
        <rect width="5" height="1" y="1" fill="#DD0000" />
        <rect width="5" height="1" y="2" fill="#FFCE00" />
      </svg>
    ),
  },
  en: {
    label: 'English',
    svg: (
      <svg viewBox="0 0 60 30" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
        <clipPath id="ls-uk-clip">
          <path d="M0,0 v30 h60 v-30 z" />
        </clipPath>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" clipPath="url(#ls-uk-clip)" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    ),
  },
};

const LANGS = Object.keys(FLAGS);

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.split('-')[0] ?? 'en';

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      {LANGS.map((lang) => {
        const { svg, label } = FLAGS[lang];
        const active = current === lang;
        return (
          <Tooltip key={lang} title={label} placement="top">
            <Box
              component="button"
              onClick={() => i18n.changeLanguage(lang)}
              aria-label={label}
              aria-pressed={active}
              sx={{
                width: 36,
                height: 24,
                p: 0,
                border: active ? '2px solid' : '2px solid transparent',
                borderColor: active ? 'primary.main' : 'transparent',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: active ? 'default' : 'pointer',
                background: 'none',
                opacity: active ? 1 : 0.5,
                transition: 'opacity 0.15s, border-color 0.15s',
                '&:hover': { opacity: 1 },
                '& svg': { width: '100%', height: '100%' },
              }}
            >
              {svg}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
