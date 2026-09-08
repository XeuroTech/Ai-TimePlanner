import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  authState: { profile: null as any, updateProfile: vi.fn(async () => {}) },
}));
vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mocks.authState) => unknown) => selector(mocks.authState), {
    getState: () => mocks.authState,
  }),
}));

import { usePremium } from './use-premium';

beforeEach(() => {
  mocks.authState.profile = null;
  mocks.authState.updateProfile = vi.fn(async () => {});
});

describe('usePremium', () => {
  it('reports "free" when there is no profile yet', () => {
    const { result } = renderHook(() => usePremium());
    expect(result.current.plan).toBe('free');
    expect(result.current.isPremium).toBe(false);
    expect(result.current.billingCycle).toBe('monthly');
    expect(result.current.since).toBeUndefined();
  });

  it('reports "free" for any preferences.plan other than "premium"', () => {
    mocks.authState.profile = { preferences: { plan: 'something-else' } };
    const { result } = renderHook(() => usePremium());
    expect(result.current.plan).toBe('free');
    expect(result.current.isPremium).toBe(false);
  });

  it('reports "premium" and reads the stored cycle/since when upgraded', () => {
    mocks.authState.profile = { preferences: { plan: 'premium', planCycle: 'yearly', planSince: '2026-01-01T00:00:00Z' } };
    const { result } = renderHook(() => usePremium());
    expect(result.current.plan).toBe('premium');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.billingCycle).toBe('yearly');
    expect(result.current.since).toBe('2026-01-01T00:00:00Z');
  });

  it('upgrade() writes plan/cycle/since to the profile', async () => {
    const { result } = renderHook(() => usePremium());
    await result.current.upgrade('yearly');
    expect(mocks.authState.updateProfile).toHaveBeenCalledWith({
      preferences: { plan: 'premium', planCycle: 'yearly', planSince: expect.any(String) },
    });
  });

  it('downgrade() clears plan/cycle/since back to free', async () => {
    const { result } = renderHook(() => usePremium());
    await result.current.downgrade();
    expect(mocks.authState.updateProfile).toHaveBeenCalledWith({
      preferences: { plan: 'free', planCycle: undefined, planSince: undefined },
    });
  });
});
