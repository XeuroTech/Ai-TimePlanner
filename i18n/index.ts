import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/**
 * English-only foundation. Imported once for its side effect from
 * `app/_layout.tsx` before anything renders, so every screen can call
 * `useTranslation()` without re-initializing i18next.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    // React already escapes rendered output.
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
