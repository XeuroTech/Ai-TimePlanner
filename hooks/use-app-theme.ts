import { DarkPalette, DarkTint, LightPalette, LightTint } from '@/constants/palette';
import { useThemeStore } from '@/store/theme-store';

/**
 * Resolves the app's manual Dark Mode preference (not the OS setting) to a
 * concrete palette. Accent colors are identical in both variants — only
 * `Palette`/`Tint` change, so components read `Palette.xxx` exactly as
 * before, just sourced from here instead of the static import.
 */
export function useAppTheme() {
  const darkMode = useThemeStore((s) => s.darkMode);
  const setDarkMode = useThemeStore((s) => s.setDarkMode);

  return {
    isDark: darkMode,
    Palette: darkMode ? DarkPalette : LightPalette,
    Tint: darkMode ? DarkTint : LightTint,
    setDarkMode,
  };
}
