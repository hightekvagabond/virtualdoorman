/**
 * i18n bootstrap.
 *
 * Convention for the whole codebase: **every user-facing string the app itself
 * owns goes through `t()`**. Copy an admin can edit (screensaver text,
 * thank-you text, form labels) is *not* an i18n key — it arrives in
 * `config.json` and is modelled by `@virtualdoorman/types`.
 *
 * Import this module once, from `App.tsx`, before anything renders.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { findBestLanguageTag } from 'react-native-localize';

import en from './locales/en.json';
import es from './locales/es.json';

/** Locales we ship. EN is the fallback for anything else. */
export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

function isSupportedLanguage(tag: string): tag is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(tag);
}

/** Picks the best of our locales for the device, falling back to English. */
export function detectLanguage(): SupportedLanguage {
  const best = findBestLanguageTag([...SUPPORTED_LANGUAGES]);

  if (best !== undefined && isSupportedLanguage(best.languageTag)) {
    return best.languageTag;
  }

  return FALLBACK_LANGUAGE;
}

// Resources are bundled, so init resolves synchronously; the returned promise
// is intentionally not awaited.
i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'translation',
  interpolation: {
    // React already escapes rendered values.
    escapeValue: false,
  },
});

export default i18n;
