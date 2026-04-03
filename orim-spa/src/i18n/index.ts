import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';

const SUPPORTED_LANGS = ['de', 'en'];

function detectLanguage(): string {
  const saved = localStorage.getItem('orim_lang');
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const browser = navigator.language?.split('-')[0]?.toLowerCase();
  if (browser && SUPPORTED_LANGS.includes(browser)) return browser;
  return 'en';
}

const savedLang = detectLanguage();

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('orim_lang', lng);
});

export default i18n;
