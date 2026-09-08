/**
 * Brand palette for the AI Smart Timetable Planner.
 * Single source of truth for colors used across the app screens.
 *
 * Accent colors (primary/blue/green/orange/pink) stay identical between
 * light and dark mode — they already read fine on both. Only the neutral
 * surface/text/border tokens flip.
 */
import { Platform } from 'react-native';

export const LightPalette = {
  primary: '#6C4DFF',
  primaryDark: '#5B3EEB',
  secondary: '#8B7DFF',
  blue: '#4DA3FF',
  green: '#4CD964',
  orange: '#FFB648',
  pink: '#FF6FAE',

  // Surfaces & text
  bg: '#F6F5FF',
  ink: '#1B1B2F',
  muted: '#6E6B8A',
  subtle: '#9AA0B4',
  hairline: '#ECE9FB',
  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(255,255,255,0.9)',
  card: '#FFFFFF',
} as const;

export const DarkPalette = {
  primary: '#6C4DFF',
  primaryDark: '#5B3EEB',
  secondary: '#8B7DFF',
  blue: '#4DA3FF',
  green: '#4CD964',
  orange: '#FFB648',
  pink: '#FF6FAE',

  // Surfaces & text
  bg: '#0F0E1A',
  ink: '#F3F1FF',
  muted: '#A9A5C7',
  subtle: '#766F99',
  hairline: '#2A2740',
  glass: 'rgba(28,26,44,0.72)',
  glassBorder: 'rgba(255,255,255,0.08)',
  card: '#1B1930',
} as const;

/** Tint variants (soft background chips) for each accent color. */
export const LightTint = {
  primary: '#EFEBFF',
  blue: '#E7F1FF',
  green: '#E4F9EA',
  orange: '#FFF3E1',
  pink: '#FFE9F2',
} as const;

export const DarkTint = {
  primary: '#241F45',
  blue: '#152436',
  green: '#173321',
  orange: '#382A16',
  pink: '#38202F',
} as const;

export type AppPalette = Record<keyof typeof LightPalette, string>;
export type AppTint = Record<keyof typeof LightTint, string>;

/** Default/light values — kept for any legacy static import. Prefer `useAppTheme()`. */
export const Palette = LightPalette;
export const Tint = LightTint;

/** SF Pro Display on iOS via the system font; sans-serif elsewhere. */
export const FontFamily = Platform.select({ ios: 'System', default: 'sans-serif' });
