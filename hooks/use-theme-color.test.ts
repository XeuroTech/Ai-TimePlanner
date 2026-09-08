import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ scheme: 'light' as 'light' | 'dark' | null }));
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mocks.scheme }));

import { useThemeColor } from './use-theme-color';

describe('useThemeColor', () => {
  it('falls back to the theme default when no prop override is given', () => {
    mocks.scheme = 'light';
    const { result } = renderHook(() => useThemeColor({}, 'text'));
    expect(result.current).toBe('#11181C');
  });

  it('uses the light prop override when the theme is light', () => {
    mocks.scheme = 'light';
    const { result } = renderHook(() => useThemeColor({ light: '#custom-light' }, 'text'));
    expect(result.current).toBe('#custom-light');
  });

  it('uses the dark prop override when the theme is dark', () => {
    mocks.scheme = 'dark';
    const { result } = renderHook(() => useThemeColor({ dark: '#custom-dark' }, 'text'));
    expect(result.current).toBe('#custom-dark');
  });

  it('ignores a light-only override while in dark mode and falls back to the dark default', () => {
    mocks.scheme = 'dark';
    const { result } = renderHook(() => useThemeColor({ light: '#custom-light' }, 'background'));
    expect(result.current).toBe('#151718');
  });

  it('treats a null OS scheme as light', () => {
    mocks.scheme = null;
    const { result } = renderHook(() => useThemeColor({}, 'tint'));
    expect(result.current).toBe('#0a7ea4');
  });
});
