import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

import { useThemeStore } from '@/store/theme-store';
import { DarkPalette, DarkTint, LightPalette, LightTint } from '@/constants/palette';
import { useAppTheme } from './use-app-theme';

beforeEach(() => {
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('useAppTheme', () => {
  it('resolves the light palette/tint when dark mode is off', () => {
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.isDark).toBe(false);
    expect(result.current.Palette).toBe(LightPalette);
    expect(result.current.Tint).toBe(LightTint);
  });

  it('resolves the dark palette/tint when dark mode is on', () => {
    useThemeStore.setState({ darkMode: true });
    const { result } = renderHook(() => useAppTheme());
    expect(result.current.isDark).toBe(true);
    expect(result.current.Palette).toBe(DarkPalette);
    expect(result.current.Tint).toBe(DarkTint);
  });

  it('setDarkMode updates the store and the hook\'s next read', () => {
    const { result, rerender } = renderHook(() => useAppTheme());
    act(() => {
      result.current.setDarkMode(true);
    });
    rerender();
    expect(result.current.isDark).toBe(true);
    expect(useThemeStore.getState().darkMode).toBe(true);
  });
});
