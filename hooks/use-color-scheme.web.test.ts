import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ scheme: 'dark' as 'light' | 'dark' | null }));
vi.mock('react-native', () => ({ useColorScheme: () => mocks.scheme }));

import { useColorScheme } from './use-color-scheme.web';

describe('useColorScheme (web)', () => {
  it('resolves to the underlying OS color scheme once mounted/hydrated', () => {
    mocks.scheme = 'dark';
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe('dark');
  });

  it('reflects a null OS scheme once hydrated (no forced fallback here)', () => {
    mocks.scheme = null;
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBeNull();
  });

  it('reflects "light" the same way', () => {
    mocks.scheme = 'light';
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe('light');
  });
});
