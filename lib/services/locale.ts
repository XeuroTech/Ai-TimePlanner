/**
 * Language display helpers for the Language settings screen.
 *
 * `expo-localization` reports every locale actually configured on the
 * device/OS (not just one) — that is the full list the Language screen shows,
 * matching how iOS/Android's own "Preferred Languages" picker works.
 *
 * NOTE: this only lets the user *record* which language they want; it does
 * not yet translate the app's UI text. See app/language.tsx for the banner
 * that says so.
 */
import * as Localization from 'expo-localization';

export type LanguageOption = { code: string; label: string; nativeLabel: string };

/** English + native name for languages we can label nicely; unlisted codes fall back to the raw tag. */
const KNOWN: Record<string, { label: string; native: string }> = {
  en: { label: 'English', native: 'English' },
  ur: { label: 'Urdu', native: 'اردو' },
  hi: { label: 'Hindi', native: 'हिन्दी' },
  ar: { label: 'Arabic', native: 'العربية' },
  fa: { label: 'Persian', native: 'فارسی' },
  ps: { label: 'Pashto', native: 'پښتو' },
  bn: { label: 'Bengali', native: 'বাংলা' },
  pa: { label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  ta: { label: 'Tamil', native: 'தமிழ்' },
  te: { label: 'Telugu', native: 'తెలుగు' },
  ml: { label: 'Malayalam', native: 'മലയാളം' },
  gu: { label: 'Gujarati', native: 'ગુજરાતી' },
  mr: { label: 'Marathi', native: 'मराठी' },
  es: { label: 'Spanish', native: 'Español' },
  fr: { label: 'French', native: 'Français' },
  de: { label: 'German', native: 'Deutsch' },
  it: { label: 'Italian', native: 'Italiano' },
  pt: { label: 'Portuguese', native: 'Português' },
  ru: { label: 'Russian', native: 'Русский' },
  tr: { label: 'Turkish', native: 'Türkçe' },
  zh: { label: 'Chinese', native: '中文' },
  ja: { label: 'Japanese', native: '日本語' },
  ko: { label: 'Korean', native: '한국어' },
  id: { label: 'Indonesian', native: 'Bahasa Indonesia' },
  ms: { label: 'Malay', native: 'Bahasa Melayu' },
  vi: { label: 'Vietnamese', native: 'Tiếng Việt' },
  th: { label: 'Thai', native: 'ไทย' },
  nl: { label: 'Dutch', native: 'Nederlands' },
  pl: { label: 'Polish', native: 'Polski' },
  sw: { label: 'Swahili', native: 'Kiswahili' },
};

/** Human-readable label for a saved language code (or the "not set yet" fallback). */
export function languageLabel(code?: string): string {
  if (!code) return 'System default';
  return KNOWN[code]?.label ?? code.toUpperCase();
}

/**
 * Languages configured on this device, most-preferred first, deduplicated by
 * language code (a device can list `en-US` and `en-GB` — those collapse to one `en` row).
 */
export function deviceLanguages(): LanguageOption[] {
  const seen = new Set<string>();
  const out: LanguageOption[] = [];
  for (const locale of Localization.getLocales()) {
    const code = locale.languageCode;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const known = KNOWN[code];
    out.push({
      code,
      label: known?.label ?? locale.languageTag,
      nativeLabel: known?.native ?? locale.languageTag,
    });
  }
  return out;
}
