import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

import { useThemeStore } from './theme-store';

beforeEach(() => {
  useThemeStore.setState({ darkMode: false, notificationsEnabled: true });
});

describe('useThemeStore', () => {
  it('starts with dark mode off and notifications on', () => {
    expect(useThemeStore.getState()).toMatchObject({ darkMode: false, notificationsEnabled: true });
  });

  it('setDarkMode toggles dark mode independently of notifications', () => {
    useThemeStore.getState().setDarkMode(true);
    expect(useThemeStore.getState().darkMode).toBe(true);
    expect(useThemeStore.getState().notificationsEnabled).toBe(true);
    useThemeStore.getState().setDarkMode(false);
    expect(useThemeStore.getState().darkMode).toBe(false);
  });

  it('setNotificationsEnabled toggles notifications independently of dark mode', () => {
    useThemeStore.getState().setNotificationsEnabled(false);
    expect(useThemeStore.getState().notificationsEnabled).toBe(false);
    expect(useThemeStore.getState().darkMode).toBe(false);
  });
});
