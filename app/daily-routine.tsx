import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClockTimeField } from '@/components/ui/clock-time-picker';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMinutesTotal } from '@/lib/analytics';
import { MINUTES_PER_DAY } from '@/lib/time';
import { useAuthStore } from '@/store/auth-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function DailyRoutineScreen() {
  const router = useRouter();
  const toast = useToast();

  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const prefs = useAuthStore((s) => s.profile?.preferences);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  // Every field is seeded from the saved profile, so reopening the screen shows
  // what was actually saved rather than resetting to the defaults.
  const [wake, setWake] = useState(prefs?.wakeTime ?? 7 * 60);
  const [sleep, setSleep] = useState(prefs?.sleepTime ?? 23 * 60);
  const [studyHours, setStudyHours] = useState(prefs?.studyHours ?? 4);
  const [workHours, setWorkHours] = useState(prefs?.workHours ?? 2);
  const [exercise, setExercise] = useState(prefs?.exerciseMinutes ?? 30); // minutes
  const [meals, setMeals] = useState(prefs?.mealsPerDay ?? 3);
  const [saving, setSaving] = useState(false);

  // Awake minutes minus everything already committed — a negative number means
  // the routine doesn't physically fit in the day.
  const awakeMinutes = sleep > wake ? sleep - wake : MINUTES_PER_DAY - wake + sleep;
  const committedMinutes = studyHours * 60 + workHours * 60 + exercise + meals * 30;
  const freeMinutes = awakeMinutes - committedMinutes;

  const onContinue = async () => {
    setSaving(true);
    // Wake/sleep share the same profile keys the onboarding wizard writes; the
    // rest are new keys read back by this screen and the AI planner.
    await updateProfile({
      preferences: {
        wakeTime: wake,
        sleepTime: sleep,
        studyHours,
        workHours,
        exerciseMinutes: exercise,
        mealsPerDay: meals,
      },
    });
    setSaving(false);
    toast.success('Routine saved.');
    router.back();
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
          <Text style={styles.headerTitle}>Daily Routine</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          {/* Friendly illustration */}
          <View style={styles.illustration}>
            <View style={styles.illoHalo} />
            <View style={[styles.illoChip, styles.illoSun]}>
              <Ionicons name="sunny" size={18} color={Palette.orange} />
            </View>
            <View style={[styles.illoChip, styles.illoMoon]}>
              <Ionicons name="moon" size={18} color={Palette.blue} />
            </View>
            <View style={styles.illoBadge}>
              <Ionicons name="alarm" size={44} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.title}>Set your daily routine</Text>
          <Text style={styles.subtitle}>
            This helps the AI build a schedule that fits your natural rhythm.
          </Text>

          {/* Wake / Sleep — real circular clock pickers */}
          <TimeQuestion
            icon="sunny-outline"
            color={Palette.orange}
            tint={Tint.orange}
            label="Wake Up Time"
            value={wake}
            onChange={setWake}
          />
          <TimeQuestion
            icon="moon-outline"
            color={Palette.blue}
            tint={Tint.blue}
            label="Sleep Time"
            value={sleep}
            onChange={setSleep}
          />

          {/* Steppers */}
          <StepperQuestion
            icon="book-outline"
            color={Palette.primary}
            tint={Tint.primary}
            label="Study Hours"
            display={`${studyHours} h`}
            onDec={() => setStudyHours((v) => Math.max(0, v - 1))}
            onInc={() => setStudyHours((v) => Math.min(12, v + 1))}
          />
          <StepperQuestion
            icon="briefcase-outline"
            color={Palette.secondary}
            tint={Tint.primary}
            label="Work Hours"
            display={`${workHours} h`}
            onDec={() => setWorkHours((v) => Math.max(0, v - 1))}
            onInc={() => setWorkHours((v) => Math.min(12, v + 1))}
          />
          <StepperQuestion
            icon="barbell-outline"
            color={Palette.pink}
            tint={Tint.pink}
            label="Exercise"
            display={`${exercise} min`}
            onDec={() => setExercise((v) => Math.max(0, v - 15))}
            onInc={() => setExercise((v) => Math.min(180, v + 15))}
          />
          <StepperQuestion
            icon="restaurant-outline"
            color={Palette.green}
            tint={Tint.green}
            label="Meals"
            display={`${meals}`}
            onDec={() => setMeals((v) => Math.max(1, v - 1))}
            onInc={() => setMeals((v) => Math.min(6, v + 1))}
          />

          {/* Live balance — makes an over-committed routine obvious before saving. */}
          <View style={[styles.balance, freeMinutes < 0 && styles.balanceOver]}>
            <Ionicons
              name={freeMinutes < 0 ? 'warning-outline' : 'checkmark-circle-outline'}
              size={18}
              color={freeMinutes < 0 ? '#E5484D' : Palette.green}
            />
            <Text style={styles.balanceText}>
              {freeMinutes < 0
                ? `Over-booked by ${formatMinutesTotal(-freeMinutes)} — your day is only ${formatMinutesTotal(awakeMinutes)} long.`
                : `${formatMinutesTotal(freeMinutes)} free out of ${formatMinutesTotal(awakeMinutes)} awake.`}
            </Text>
          </View>
        </ScrollView>

        {/* Continue */}
        <View style={styles.footer}>
          <Pressable
            onPress={onContinue}
            disabled={saving}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [
              styles.continueBtn,
              (pressed || saving) && styles.continuePressed,
            ]}>
            <Text style={styles.continueText}>{saving ? 'Saving…' : 'Continue'}</Text>
          </Pressable>
        </View>

        {/* Inline time picker overlay list is rendered within each TimeQuestion. */}
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Question rows                                                              */
/* -------------------------------------------------------------------------- */

function QuestionShell({
  icon,
  color,
  tint,
  label,
  right,
  children,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  label: string;
  right: ReactNode;
  children?: ReactNode;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.qIcon, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={styles.qLabel}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function TimeQuestion({
  icon,
  color,
  tint,
  label,
  value,
  onChange,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <QuestionShell
      icon={icon}
      color={color}
      tint={tint}
      label={label}
      right={
        <ClockTimeField
          variant="pill"
          icon={icon}
          title={label}
          value={value}
          onChange={onChange}
          minuteStep={5}
        />
      }
    />
  );
}

function StepperQuestion({
  icon,
  color,
  tint,
  label,
  display,
  onDec,
  onInc,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  label: string;
  display: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  return (
    <QuestionShell
      icon={icon}
      color={color}
      tint={tint}
      label={label}
      right={
        <View style={styles.stepper}>
          <Pressable onPress={onDec} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
            <Ionicons name="remove" size={18} color={Palette.primary} />
          </Pressable>
          <Text style={styles.stepValue}>{display}</Text>
          <Pressable onPress={onInc} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
            <Ionicons name="add" size={18} color={Palette.primary} />
          </Pressable>
        </View>
      }
    />
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

  illustration: { height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  illoHalo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(108,77,255,0.08)',
  },
  illoBadge: {
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  illoChip: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
    zIndex: 2,
  },
  illoSun: { top: 18, left: 56 },
  illoMoon: { bottom: 18, right: 56 },

  title: { fontFamily: FontFamily, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: Palette.ink, textAlign: 'center' },
  subtitle: {
    fontFamily: FontFamily,
    fontSize: 15,
    fontWeight: '500',
    color: Palette.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
    paddingHorizontal: 10,
    lineHeight: 21,
  },

  card: {
    backgroundColor: Palette.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  qIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  qLabel: { flex: 1, fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },

  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Tint.green,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  balanceOver: { backgroundColor: '#FDE7E8' },
  balanceText: { flex: 1, fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: Palette.ink, lineHeight: 18 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.ink, minWidth: 54, textAlign: 'center' },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.bg,
  },
  continueBtn: {
    height: 58,
    borderRadius: 20,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.primary,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  continuePressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
  continueText: { fontFamily: FontFamily, fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  });
}
