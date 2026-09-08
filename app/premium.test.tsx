import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  routerBack: vi.fn(),
  trackEvent: vi.fn(),
  premium: {
    plan: 'free' as 'free' | 'premium',
    isPremium: false,
    billingCycle: 'monthly' as 'monthly' | 'yearly',
    since: undefined as string | undefined,
    upgrade: vi.fn(async () => {}),
    downgrade: vi.fn(async () => {}),
  },
}));

vi.mock('@expo/vector-icons', async () => {
  const { Text } = await import('react-native');
  return { Ionicons: (props: any) => <Text>{`icon:${props.name}`}</Text> };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: mocks.routerBack }),
}));

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/lib/storage', () => ({
  zustandStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
}));

vi.mock('@/hooks/use-premium', () => ({ usePremium: () => mocks.premium }));

vi.mock('@/lib/services/observability', () => ({ trackEvent: mocks.trackEvent }));

import { useThemeStore } from '@/store/theme-store';
import PremiumScreen from './premium';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.premium, {
    plan: 'free',
    isPremium: false,
    billingCycle: 'monthly',
    since: undefined,
  });
  mocks.premium.upgrade.mockResolvedValue(undefined);
  mocks.premium.downgrade.mockResolvedValue(undefined);
  useThemeStore.setState({ darkMode: false });
});

describe('PremiumScreen', () => {
  it('calls router.back() from the header chevron', () => {
    render(<PremiumScreen />);
    fireEvent.click(screen.getByText('icon:chevron-back'));
    expect(mocks.routerBack).toHaveBeenCalledTimes(1);
  });

  it('applies the pressed style to the header back button while held down', async () => {
    render(<PremiumScreen />);
    const backBtn = screen.getByText('icon:chevron-back').parentElement!;
    fireEvent.mouseDown(backBtn);
    await waitFor(() => {
      expect(getComputedStyle(backBtn).opacity).toBe('0.5');
    });
    fireEvent.mouseUp(backBtn);
  });

  describe('free plan', () => {
    it('shows the marketing hero, not the "active" pill', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('Smart Planner Premium')).toBeTruthy();
      expect(screen.queryByText('Premium active')).toBeNull();
    });

    it('shows the billing picker with both plans', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('Choose your plan')).toBeTruthy();
      expect(screen.getByText('Monthly')).toBeTruthy();
      expect(screen.getByText('Yearly')).toBeTruthy();
      expect(screen.getByText('Save 50%')).toBeTruthy();
    });

    it('defaults the selected plan to the current billingCycle and shows its price on the CTA', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('Upgrade — $4.99/month')).toBeTruthy();
    });

    it('defaults to yearly when billingCycle is already yearly', () => {
      mocks.premium.billingCycle = 'yearly';
      render(<PremiumScreen />);
      expect(screen.getByText('Upgrade — $29.99/year')).toBeTruthy();
    });

    it('switches the CTA price when a different plan card is selected', () => {
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Yearly'));
      expect(screen.getByText('Upgrade — $29.99/year')).toBeTruthy();
    });

    it('applies the pressed style to a plan card while held down', async () => {
      render(<PremiumScreen />);
      const yearlyCard = screen.getByText('Yearly').closest('div')!.parentElement!.parentElement!;
      fireEvent.mouseDown(yearlyCard);
      await waitFor(() => {
        expect(getComputedStyle(yearlyCard).opacity).toBe('0.5');
      });
      fireEvent.mouseUp(yearlyCard);
    });

    it('applies the pressed style to the upgrade CTA while held down and not busy', async () => {
      render(<PremiumScreen />);
      const cta = screen.getByText('Upgrade — $4.99/month').parentElement!;
      const initialBg = getComputedStyle(cta).backgroundColor;
      fireEvent.mouseDown(cta);
      await waitFor(() => {
        expect(getComputedStyle(cta).backgroundColor).not.toBe(initialBg);
      });
      expect(getComputedStyle(cta).backgroundColor).toBe('rgb(91, 62, 235)');
      fireEvent.mouseUp(cta);
    });

    it('shows a lock icon (not a checkmark) next to each perk', () => {
      render(<PremiumScreen />);
      expect(screen.getAllByText('icon:lock-closed').length).toBeGreaterThan(0);
      expect(screen.queryByText('icon:checkmark-circle')).toBeNull();
    });

    it('renders every perk title', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('Unlimited AI schedules')).toBeTruthy();
      expect(screen.getByText('Advanced analytics')).toBeTruthy();
      expect(screen.getByText('Unlimited habits & routines')).toBeTruthy();
      expect(screen.getByText('Backup & sync')).toBeTruthy();
      expect(screen.getByText('Custom themes')).toBeTruthy();
      expect(screen.getByText('Priority support')).toBeTruthy();
    });

    it('renders the free-vs-premium comparison rows', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('AI schedules')).toBeTruthy();
      expect(screen.getByText('3 / day')).toBeTruthy();
      expect(screen.getAllByText('Unlimited').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Cloud backup')).toBeTruthy();
      expect(screen.getByText('Included')).toBeTruthy();
    });

    it('upgrades to the selected cycle on CTA press (success path)', async () => {
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Yearly'));
      fireEvent.click(screen.getByText('Upgrade — $29.99/year'));
      await waitFor(() => expect(mocks.premium.upgrade).toHaveBeenCalledWith('yearly'));
      expect(mocks.trackEvent).toHaveBeenCalledWith('premium_upgraded', { cycle: 'yearly' });
    });

    it('upgrades with monthly when that stays selected', async () => {
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Upgrade — $4.99/month'));
      await waitFor(() => expect(mocks.premium.upgrade).toHaveBeenCalledWith('monthly'));
    });

    it('shows "Activating…" while the upgrade is in flight, and does not call upgrade twice', async () => {
      let resolveUpgrade!: () => void;
      mocks.premium.upgrade.mockImplementation(
        () => new Promise<void>((resolve) => { resolveUpgrade = resolve; }),
      );
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Upgrade — $4.99/month'));
      await waitFor(() => expect(screen.getByText('Activating…')).toBeTruthy());
      fireEvent.click(screen.getByText('Activating…'));
      expect(mocks.premium.upgrade).toHaveBeenCalledTimes(1);
      resolveUpgrade();
      await waitFor(() => expect(screen.getByText('Upgrade — $4.99/month')).toBeTruthy());
    });

    it('recovers from an upgrade failure without staying stuck busy', async () => {
      mocks.premium.upgrade.mockRejectedValue(new Error('network down'));
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Upgrade — $4.99/month'));
      await waitFor(() => expect(mocks.premium.upgrade).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText('Upgrade — $4.99/month')).toBeTruthy());
      expect(mocks.trackEvent).not.toHaveBeenCalledWith('premium_upgraded', expect.anything());
    });

    it('falls back to the first plan when the stored billing cycle matches none of the known plans', () => {
      mocks.premium.billingCycle = 'unknown-cycle' as any;
      render(<PremiumScreen />);
      expect(screen.getByText('Upgrade — $4.99/month')).toBeTruthy();
    });

    it('renders the dark-styled status bar when dark mode is enabled', () => {
      useThemeStore.setState({ darkMode: true });
      render(<PremiumScreen />);
      // StatusBar is mocked out, so this is a smoke check exercising the isDark ? 'light' : 'dark' branch.
      expect(screen.getByText('Smart Planner Premium')).toBeTruthy();
    });
  });

  describe('premium plan', () => {
    beforeEach(() => {
      mocks.premium.plan = 'premium';
      mocks.premium.isPremium = true;
    });

    it('shows the "active" pill and the all-set hero copy', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('Premium active')).toBeTruthy();
      expect(screen.getByText("You're all set")).toBeTruthy();
    });

    it('includes the since date in the hero sub-copy when present', () => {
      mocks.premium.since = '2026-01-15T00:00:00Z';
      render(<PremiumScreen />);
      expect(screen.getByText(/since Jan 15, 2026/)).toBeTruthy();
    });

    it('omits the since clause when there is no stored date', () => {
      render(<PremiumScreen />);
      expect(screen.queryByText(/since/)).toBeNull();
    });

    it('hides the billing picker while already premium', () => {
      render(<PremiumScreen />);
      expect(screen.queryByText('Choose your plan')).toBeNull();
    });

    it('shows a checkmark (not a lock) next to each perk', () => {
      render(<PremiumScreen />);
      expect(screen.getAllByText('icon:checkmark-circle').length).toBeGreaterThan(0);
      expect(screen.queryByText('icon:lock-closed')).toBeNull();
    });

    it('shows the footer "Premium is active" state and a downgrade link instead of the CTA', () => {
      render(<PremiumScreen />);
      expect(screen.getByText('Premium is active')).toBeTruthy();
      expect(screen.getByText('Switch back to Free plan')).toBeTruthy();
      expect(screen.queryByText(/^Upgrade —/)).toBeNull();
    });

    it('downgrades on link press (success path)', async () => {
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Switch back to Free plan'));
      await waitFor(() => expect(mocks.premium.downgrade).toHaveBeenCalledTimes(1));
      expect(mocks.trackEvent).toHaveBeenCalledWith('premium_cancelled');
    });

    it('recovers from a downgrade failure without throwing', async () => {
      mocks.premium.downgrade.mockRejectedValue(new Error('server error'));
      render(<PremiumScreen />);
      fireEvent.click(screen.getByText('Switch back to Free plan'));
      await waitFor(() => expect(mocks.premium.downgrade).toHaveBeenCalledTimes(1));
      expect(mocks.trackEvent).not.toHaveBeenCalledWith('premium_cancelled');
    });

    it('does not downgrade twice while busy', async () => {
      let resolveDowngrade!: () => void;
      mocks.premium.downgrade.mockImplementation(
        () => new Promise<void>((resolve) => { resolveDowngrade = resolve; }),
      );
      render(<PremiumScreen />);
      const link = screen.getByText('Switch back to Free plan');
      fireEvent.click(link);
      fireEvent.click(link);
      expect(mocks.premium.downgrade).toHaveBeenCalledTimes(1);
      resolveDowngrade();
    });

    it('applies the pressed style to the downgrade link while held down', async () => {
      render(<PremiumScreen />);
      const link = screen.getByText('Switch back to Free plan').parentElement!;
      fireEvent.mouseDown(link);
      await waitFor(() => {
        expect(getComputedStyle(link).opacity).toBe('0.5');
      }, { timeout: 3000 });
      fireEvent.mouseUp(link);
    });

    it('falls back to the first plan label in the hero when the stored billing cycle matches none of the known plans', () => {
      mocks.premium.billingCycle = 'unknown-cycle' as any;
      render(<PremiumScreen />);
      expect(screen.getByText(/Monthly plan/)).toBeTruthy();
    });
  });
});
