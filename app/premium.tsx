import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { BillingCycle, usePremium } from '@/hooks/use-premium';
import { trackEvent } from '@/lib/services/observability';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* -------------------------------------------------------------------------- */
/* Static content                                                             */
/* -------------------------------------------------------------------------- */

type Plan = {
  id: BillingCycle;
  label: string;
  price: string;
  per: string;
  caption: string;
  badge?: string;
};

const PLANS: Plan[] = [
  { id: 'monthly', label: 'Monthly', price: '$4.99', per: '/month', caption: 'Billed every month · cancel anytime' },
  { id: 'yearly', label: 'Yearly', price: '$29.99', per: '/year', caption: 'Just $2.50 a month · billed once', badge: 'Save 50%' },
];

type Perk = { id: string; icon: IoniconName; colorKey: 'primary' | 'blue' | 'green' | 'orange' | 'pink'; title: string; blurb: string };

const PERKS: Perk[] = [
  {
    id: 'ai',
    icon: 'sparkles',
    colorKey: 'primary',
    title: 'Unlimited AI schedules',
    blurb: 'Generate as many study plans as you want, with no daily cap.',
  },
  {
    id: 'analytics',
    icon: 'stats-chart',
    colorKey: 'blue',
    title: 'Advanced analytics',
    blurb: 'Weekly focus trends, subject breakdowns and streak insights.',
  },
  {
    id: 'habits',
    icon: 'flame',
    colorKey: 'pink',
    title: 'Unlimited habits & routines',
    blurb: 'Track every habit you care about instead of just the first three.',
  },
  {
    id: 'backup',
    icon: 'cloud-done',
    colorKey: 'green',
    title: 'Backup & sync',
    blurb: 'Keep your timetable safe and pick it up on any device.',
  },
  {
    id: 'themes',
    icon: 'color-palette',
    colorKey: 'orange',
    title: 'Custom themes',
    blurb: 'Extra colour sets and app icons to make the planner yours.',
  },
  {
    id: 'support',
    icon: 'headset',
    colorKey: 'primary',
    title: 'Priority support',
    blurb: 'Questions answered first, straight from the team.',
  },
];

type CompareRow = { id: string; label: string; free: string; premium: string };

const COMPARE: CompareRow[] = [
  { id: 'ai', label: 'AI schedules', free: '3 / day', premium: 'Unlimited' },
  { id: 'habits', label: 'Habits tracked', free: 'Up to 3', premium: 'Unlimited' },
  { id: 'analytics', label: 'Analytics', free: 'Basic', premium: 'Advanced' },
  { id: 'backup', label: 'Cloud backup', free: '—', premium: 'Included' },
  { id: 'themes', label: 'Themes', free: 'Light & dark', premium: 'All themes' },
];

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function PremiumScreen() {
  const router = useRouter();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const { isPremium, billingCycle, since, upgrade, downgrade } = usePremium();
  const [selected, setSelected] = useState<BillingCycle>(billingCycle);
  const [busy, setBusy] = useState(false);

  const plan = PLANS.find((p) => p.id === selected) ?? PLANS[0];
  const activePlan = PLANS.find((p) => p.id === billingCycle) ?? PLANS[0];

  const sinceLabel = since
    ? new Date(since).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const onUpgrade = async () => {
    // Belt-and-suspenders: the CTA already carries `disabled={busy}`, so a
    // disabled Pressable never re-fires onPress while busy — this guard's
    // true branch can't be reached through the rendered UI.
    /* v8 ignore start */
    if (busy) return;
    /* v8 ignore stop */
    setBusy(true);
    try {
      await upgrade(selected);
      trackEvent('premium_upgraded', { cycle: selected });
      toast.show("You're Premium now — everything is unlocked.", 'success');
    } catch {
      toast.show('Could not activate Premium. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDowngrade = async () => {
    // Same defensive guard as onUpgrade above — unreachable via the UI since
    // the downgrade link also carries `disabled={busy}`.
    /* v8 ignore start */
    if (busy) return;
    /* v8 ignore stop */
    setBusy(true);
    try {
      await downgrade();
      trackEvent('premium_cancelled');
      toast.show('Switched back to the Free plan.', 'info');
    } catch {
      toast.show('Could not change your plan. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Premium</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Hero */}
          <View style={styles.hero}>
            <View pointerEvents="none" style={styles.heroBlobTop} />
            <View pointerEvents="none" style={styles.heroBlobBottom} />

            <View style={styles.crown}>
              <Ionicons name={isPremium ? 'checkmark' : 'diamond'} size={30} color={Palette.primary} />
            </View>

            {isPremium ? (
              <>
                <View style={styles.activePill}>
                  <Ionicons name="checkmark-circle" size={13} color="#FFFFFF" />
                  <Text style={styles.activePillText}>Premium active</Text>
                </View>
                <Text style={styles.heroTitle}>You&apos;re all set</Text>
                <Text style={styles.heroSub}>
                  {activePlan.label} plan{sinceLabel ? ` · since ${sinceLabel}` : ''}. Every feature below is
                  unlocked.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>Smart Planner Premium</Text>
                <Text style={styles.heroSub}>
                  Unlimited AI planning, deeper analytics and cloud backup — built for students who are
                  serious about their time.
                </Text>
              </>
            )}
          </View>

          {/* Billing picker — only while on Free */}
          {!isPremium ? (
            <>
              <Text style={styles.sectionLabel}>Choose your plan</Text>
              <View style={styles.planRow}>
                {PLANS.map((p) => {
                  const active = p.id === selected;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelected(p.id)}
                      style={({ pressed }) => [
                        styles.planCard,
                        active && styles.planCardActive,
                        pressed && styles.pressed,
                      ]}>
                      {p.badge ? (
                        <View style={styles.saveChip}>
                          <Text style={styles.saveChipText}>{p.badge}</Text>
                        </View>
                      ) : null}

                      <View style={styles.planTop}>
                        <View style={[styles.radio, active && styles.radioActive]}>
                          {active ? <View style={styles.radioDot} /> : null}
                        </View>
                        <Text style={[styles.planLabel, active && styles.planLabelActive]}>{p.label}</Text>
                      </View>

                      <View style={styles.priceRow}>
                        <Text style={[styles.price, active && styles.priceActive]}>{p.price}</Text>
                        <Text style={styles.per}>{p.per}</Text>
                      </View>
                      <Text style={styles.planCaption}>{p.caption}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Perks */}
          <Text style={styles.sectionLabel}>What you get</Text>
          <View style={styles.card}>
            {PERKS.map((perk, i) => (
              <View key={perk.id}>
                <View style={styles.perkRow}>
                  <View style={[styles.perkIcon, { backgroundColor: Tint[perk.colorKey] }]}>
                    <Ionicons name={perk.icon} size={18} color={Palette[perk.colorKey]} />
                  </View>
                  <View style={styles.perkText}>
                    <Text style={styles.perkTitle}>{perk.title}</Text>
                    <Text style={styles.perkBlurb}>{perk.blurb}</Text>
                  </View>
                  {isPremium ? (
                    <Ionicons name="checkmark-circle" size={18} color={Palette.green} />
                  ) : (
                    <Ionicons name="lock-closed" size={15} color={Palette.subtle} />
                  )}
                </View>
                {i < PERKS.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>

          {/* Comparison */}
          <Text style={styles.sectionLabel}>Free vs Premium</Text>
          <View style={styles.card}>
            <View style={styles.compareHead}>
              <Text style={[styles.compareCell, styles.compareHeadLabel]} />
              <Text style={[styles.compareCell, styles.compareHeadText]}>Free</Text>
              <Text style={[styles.compareCell, styles.compareHeadText, styles.compareHeadPro]}>Premium</Text>
            </View>
            {COMPARE.map((row, i) => (
              <View key={row.id}>
                <View style={styles.compareRow}>
                  <Text style={[styles.compareCell, styles.compareLabel]}>{row.label}</Text>
                  <Text style={[styles.compareCell, styles.compareFree]}>{row.free}</Text>
                  <Text style={[styles.compareCell, styles.comparePro]}>{row.premium}</Text>
                </View>
                {i < COMPARE.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>

          <Text style={styles.disclaimer}>
            Demo build — no real payment is processed. Your plan is stored on this device only.
          </Text>
        </ScrollView>

        {/* Footer CTA */}
        <View style={styles.footer}>
          {isPremium ? (
            <>
              <View style={styles.ctaDone}>
                <Ionicons name="checkmark-circle" size={19} color={Palette.green} />
                <Text style={styles.ctaDoneText}>Premium is active</Text>
              </View>
              <Pressable
                onPress={onDowngrade}
                disabled={busy}
                hitSlop={8}
                style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
                <Text style={styles.linkText}>Switch back to Free plan</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={onUpgrade}
                disabled={busy}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                style={({ pressed }) => [styles.cta, busy && styles.ctaDisabled, pressed && !busy && styles.ctaPressed]}>
                <Ionicons name="diamond" size={18} color="#FFFFFF" />
                <Text style={styles.ctaText}>
                  {busy ? 'Activating…' : `Upgrade — ${plan.price}${plan.per}`}
                </Text>
              </Pressable>
              <Text style={styles.ctaNote}>Cancel anytime · no card required in this demo</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD_SHADOW = {
  shadowColor: '#3A2E7A',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1 },
    pressed: { opacity: 0.5 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: Palette.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },

    scroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },

    /* hero */
    hero: {
      alignItems: 'center',
      backgroundColor: Palette.primary,
      borderRadius: 26,
      paddingVertical: 26,
      paddingHorizontal: 22,
      marginBottom: 8,
      overflow: 'hidden',
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    heroBlobTop: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: 'rgba(255,255,255,0.14)',
      top: -50,
      right: -30,
    },
    heroBlobBottom: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: 'rgba(0,0,0,0.08)',
      bottom: -50,
      left: -20,
    },
    crown: {
      width: 64,
      height: 64,
      borderRadius: 24,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    activePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 14,
      paddingHorizontal: 10,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    activePillText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
    heroTitle: {
      fontFamily: FontFamily,
      fontSize: 21,
      fontWeight: '800',
      color: '#FFFFFF',
      marginTop: 14,
      textAlign: 'center',
    },
    heroSub: {
      fontFamily: FontFamily,
      fontSize: 14,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.85)',
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
    },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.muted,
      marginTop: 22,
      marginBottom: 10,
      marginLeft: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },

    /* plan picker */
    planRow: { flexDirection: 'row', gap: 12 },
    planCard: {
      flex: 1,
      backgroundColor: Palette.card,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: Palette.hairline,
      padding: 14,
      ...CARD_SHADOW,
    },
    planCardActive: { borderColor: Palette.primary, backgroundColor: Tint.primary },
    saveChip: {
      position: 'absolute',
      top: -9,
      right: 12,
      paddingHorizontal: 8,
      height: 20,
      borderRadius: 10,
      backgroundColor: Palette.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveChipText: { fontFamily: FontFamily, fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
    planTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: Palette.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: { borderColor: Palette.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Palette.primary },
    planLabel: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.muted },
    planLabelActive: { color: Palette.ink },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 12 },
    price: { fontFamily: FontFamily, fontSize: 24, fontWeight: '800', color: Palette.ink },
    priceActive: { color: Palette.primary },
    per: { fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: Palette.subtle },
    planCaption: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.muted,
      marginTop: 6,
      lineHeight: 17,
    },

    /* cards */
    card: { backgroundColor: Palette.card, borderRadius: 20, paddingHorizontal: 16, ...CARD_SHADOW },
    divider: { height: 1, backgroundColor: Palette.hairline, marginLeft: 48 },

    perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    perkIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    perkText: { flex: 1, gap: 2 },
    perkTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
    perkBlurb: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, lineHeight: 18 },

    /* comparison */
    compareHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: Palette.hairline,
    },
    compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
    compareCell: { flex: 1, fontFamily: FontFamily, fontSize: 13 },
    compareHeadLabel: { flex: 1.4 },
    compareHeadText: {
      fontWeight: '700',
      color: Palette.muted,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      fontSize: 11,
    },
    compareHeadPro: { color: Palette.primary },
    compareLabel: { flex: 1.4, fontWeight: '600', color: Palette.ink },
    compareFree: { fontWeight: '600', color: Palette.subtle, textAlign: 'center' },
    comparePro: { fontWeight: '800', color: Palette.primary, textAlign: 'center' },

    disclaimer: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: 18,
      paddingHorizontal: 10,
    },

    /* footer */
    footer: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: Palette.hairline,
      backgroundColor: Palette.bg,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 58,
      borderRadius: 20,
      backgroundColor: Palette.primary,
      shadowColor: Palette.primary,
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    ctaDisabled: { backgroundColor: '#C9C2EC' },
    ctaPressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
    ctaText: { fontFamily: FontFamily, fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
    ctaNote: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 8,
    },
    ctaDone: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 58,
      borderRadius: 20,
      backgroundColor: Tint.green,
    },
    ctaDoneText: { fontFamily: FontFamily, fontSize: 17, fontWeight: '700', color: Palette.ink },
    linkBtn: { alignSelf: 'center', paddingVertical: 10 },
    linkText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: Palette.muted },
  });
}
