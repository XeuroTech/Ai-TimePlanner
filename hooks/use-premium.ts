import { useCallback } from 'react';

import { useAuthStore } from '@/store/auth-store';

export type PlanTier = 'free' | 'premium';
export type BillingCycle = 'monthly' | 'yearly';

/**
 * Premium plan state, persisted in the local SQLite profile
 * (`profiles.preferences` JSON — see lib/db/profile-repository.ts), so it
 * survives restarts and is wiped with the account like every other setting.
 *
 * This is a MOCK upgrade: no store billing is involved. `upgrade()` just flips
 * the flag. When real billing is added (Play Billing / RevenueCat), keep this
 * hook's surface identical and only change the two writes below — every screen
 * that reads `isPremium` stays untouched.
 */
export function usePremium() {
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const plan: PlanTier = profile?.preferences.plan === 'premium' ? 'premium' : 'free';
  const isPremium = plan === 'premium';
  const billingCycle: BillingCycle = profile?.preferences.planCycle ?? 'monthly';
  const since = profile?.preferences.planSince;

  const upgrade = useCallback(
    async (cycle: BillingCycle) => {
      await updateProfile({
        preferences: { plan: 'premium', planCycle: cycle, planSince: new Date().toISOString() },
      });
    },
    [updateProfile],
  );

  const downgrade = useCallback(async () => {
    // `undefined` keys are dropped by JSON.stringify, so this clears them.
    await updateProfile({
      preferences: { plan: 'free', planCycle: undefined, planSince: undefined },
    });
  }, [updateProfile]);

  return { plan, isPremium, billingCycle, since, upgrade, downgrade };
}
