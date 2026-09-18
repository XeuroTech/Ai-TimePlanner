/**
 * Reminder settings.
 *
 * The Home screen's "Reminders" quick action used to open `/notifications`,
 * which is a read-only *inbox* of already-delivered messages. That left
 * `preferences.reminderTime` — the daily "plan your day" nudge that
 * `lib/services/reminders.ts` schedules — settable only during onboarding, so
 * anyone who skipped it could never turn it on.
 *
 * This screen is the missing control surface: it owns the daily nudge time,
 * the master toggle, and shows exactly what is currently scheduled so the
 * reminder engine stops being a black box.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClockTimeField } from '@/components/ui/clock-time-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getNotificationDiagnostics,
  requestNotificationPermission,
  sendTestNotification,
  type PermissionState,
} from '@/lib/services/notifications';
import { reminderOffsetMinutes, syncReminders, type SyncResult } from '@/lib/services/reminders';
import { formatTime, toDateKey } from '@/lib/time';
import { useAuthStore } from '@/store/auth-store';
import { useMyClasses, useMyPlans } from '@/store/planner-store';
import { useThemeStore } from '@/store/theme-store';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type TFn = ReturnType<typeof useTranslation>['t'];

/** Common nudge times, so the usual case is one tap rather than a dial drag. */
function getPresets(t: TFn): { label: string; minutes: number }[] {
  return [
    { label: t('reminders.presets.morning'), minutes: 8 * 60 },
    { label: t('reminders.presets.midday'), minutes: 12 * 60 },
    { label: t('reminders.presets.evening'), minutes: 20 * 60 },
  ];
}

export default function RemindersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const PRESETS = useMemo(() => getPresets(t), [t]);
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const prefs = useAuthStore((s) => s.profile?.preferences);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const notificationsEnabled = useThemeStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useThemeStore((s) => s.setNotificationsEnabled);

  const classes = useMyClasses();
  const plans = useMyPlans();

  const savedTime = prefs?.reminderTime;
  const [dailyOn, setDailyOn] = useState(typeof savedTime === 'number');
  const [time, setTime] = useState(savedTime ?? 8 * 60);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [summary, setSummary] = useState<SyncResult | null>(null);

  /*
   * Read back what the OS and the reminder engine actually think is true.
   *
   * Every call here goes through expo-notifications, which rejects outright on
   * web (and can reject on a device that has notifications hard-blocked). An
   * unhandled rejection inside an effect trips the error overlay, so failures
   * are swallowed and simply leave the readout empty.
   */
  const refresh = useCallback(async () => {
    try {
      const diag = await getNotificationDiagnostics();
      setPermission(diag.permission);
    } catch {
      setPermission('undetermined');
    }
    try {
      setSummary(await syncReminders());
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* Which classes currently produce a reminder, for the "scheduled" list. */
  const activeClasses = useMemo(
    () =>
      classes
        .filter((c) => reminderOffsetMinutes(c.reminder) !== null)
        .sort((a, b) => a.day - b.day || a.start - b.start),
    [classes],
  );

  const upcomingPlans = useMemo(() => {
    const today = toDateKey();
    return plans
      .filter((p) => !p.done && p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time - b.time)
      .slice(0, 5);
  }, [plans]);

  const persistDaily = async (on: boolean, minutes: number) => {
    // `undefined` is dropped by JSON.stringify, which is how the daily nudge is
    // cleared — reminders.ts only schedules when the value is a number.
    await updateProfile({ preferences: { reminderTime: on ? minutes : undefined } });
    await refresh();
  };

  const onToggleDaily = async (on: boolean) => {
    setDailyOn(on);
    await persistDaily(on, time);
    toast.success(on ? t('reminders.dailyNudgeSetToast', { time: formatTime(time) }) : t('reminders.dailyNudgeOffToast'));
  };

  const onTimeChange = (minutes: number) => {
    setTime(minutes);
    if (dailyOn) void persistDaily(true, minutes);
  };

  const onToggleMaster = async (on: boolean) => {
    setNotificationsEnabled(on);
    if (on && permission !== 'granted') {
      try {
        const next = await requestNotificationPermission();
        setPermission(next);
        if (next !== 'granted') {
          toast.show(t('common.notificationsBlockedToast'), 'error');
        }
      } catch {
        toast.show(t('reminders.notAvailableToast'), 'error');
      }
    }
    await refresh();
  };

  const onSendTest = async () => {
    try {
      const ok = await sendTestNotification();
      if (ok) {
        toast.success(t('reminders.testScheduledToast'));
      } else {
        toast.show(t('common.testReminderFailedToast'), 'error');
      }
    } catch {
      toast.show(t('common.testReminderFailedToast'), 'error');
    }
  };

  const totalScheduled = summary
    ? summary.classReminders + summary.planReminders + summary.dailyReminders
    : 0;

  const blocked = notificationsEnabled && permission !== 'granted';

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t('reminders.title')}</Text>
            <Text style={styles.headerSub}>
              {notificationsEnabled ? t('reminders.scheduledCount', { count: totalScheduled }) : t('reminders.turnedOff')}
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons name="mail-outline" size={20} color={Palette.ink} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Permission warning — the single most common reason nothing arrives. */}
          {blocked ? (
            <Pressable
              onPress={() => void onToggleMaster(true)}
              style={({ pressed }) => [styles.warning, pressed && styles.pressed]}>
              <Ionicons name="warning-outline" size={18} color="#E5484D" />
              <Text style={styles.warningText}>
                {t('reminders.permissionWarning')}
              </Text>
            </Pressable>
          ) : null}

          {/* Master switch */}
          <View style={styles.card}>
            <View style={styles.rowIcon}>
              <Ionicons name="notifications" size={20} color={Palette.primary} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{t('reminders.allRemindersTitle')}</Text>
              <Text style={styles.rowSub}>{t('reminders.allRemindersSub')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => void onToggleMaster(v)}
              trackColor={{ false: Palette.hairline, true: Palette.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Daily nudge */}
          <Text style={styles.sectionLabel}>{t('reminders.dailyNudgeSection')}</Text>
          <View style={styles.card}>
            <View style={[styles.rowIcon, { backgroundColor: Tint.orange }]}>
              <Ionicons name="sunny-outline" size={20} color={Palette.orange} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{t('reminders.remindMeTitle')}</Text>
              <Text style={styles.rowSub}>
                {dailyOn ? t('reminders.everyDayAt', { time: formatTime(time) }) : t('reminders.off')}
              </Text>
            </View>
            <Switch
              value={dailyOn}
              onValueChange={(v) => void onToggleDaily(v)}
              disabled={!notificationsEnabled}
              trackColor={{ false: Palette.hairline, true: Palette.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {dailyOn ? (
            <View style={styles.timeCard}>
              <ClockTimeField
                label={t('reminders.nudgeTimeLabel')}
                title={t('reminders.dailyReminderTitle')}
                value={time}
                onChange={onTimeChange}
                minuteStep={5}
                tone="bg"
              />
              <View style={styles.presetRow}>
                {PRESETS.map((p) => {
                  const active = p.minutes === time;
                  return (
                    <Pressable
                      key={p.label}
                      onPress={() => onTimeChange(p.minutes)}
                      style={[styles.preset, active && styles.presetActive]}>
                      <Text style={[styles.presetText, active && styles.presetTextActive]}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* What's scheduled */}
          <Text style={styles.sectionLabel}>{t('reminders.classRemindersSection')}</Text>
          {activeClasses.length === 0 ? (
            <View style={styles.cardPlain}>
              <EmptyState
                compact
                icon="book-outline"
                title={t('reminders.noClassRemindersTitle')}
                message={t('reminders.noClassRemindersMessage')}
                ctaLabel={t('tabs.home.addToTimetable')}
                onPress={() => router.push('/add-class')}
              />
            </View>
          ) : (
            <View style={styles.cardPlain}>
              {activeClasses.map((c, i) => (
                <View key={c.id}>
                  <View style={styles.listRow}>
                    <View style={[styles.dot, { backgroundColor: c.color }]} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {c.subject}
                      </Text>
                      <Text style={styles.rowSub}>
                        {DAY_NAMES[c.day] ?? '—'} · {formatTime(c.start)} · {c.reminder}
                      </Text>
                    </View>
                    <Text style={styles.repeat}>{c.repeat ?? 'Weekly'}</Text>
                  </View>
                  {i < activeClasses.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionLabel}>{t('reminders.upcomingPlanSection')}</Text>
          {upcomingPlans.length === 0 ? (
            <View style={styles.cardPlain}>
              <EmptyState
                compact
                icon="today-outline"
                title={t('reminders.nothingPlannedTitle')}
                message={t('reminders.nothingPlannedMessage')}
                ctaLabel={t('reminders.openDailyPlanCta')}
                onPress={() => router.push('/daily-plan')}
              />
            </View>
          ) : (
            <View style={styles.cardPlain}>
              {upcomingPlans.map((p, i) => (
                <View key={p.id}>
                  <View style={styles.listRow}>
                    <View style={[styles.dot, { backgroundColor: Palette.primary }]} />
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text style={styles.rowSub}>
                        {p.date} · {formatTime(p.time)}
                      </Text>
                    </View>
                  </View>
                  {i < upcomingPlans.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </View>
          )}

          {/* Test notification — proves delivery works without waiting for a real reminder. */}
          <Pressable
            onPress={() => void onSendTest()}
            style={({ pressed }) => [styles.testButton, pressed && styles.pressed]}>
            <Ionicons name="paper-plane-outline" size={18} color={Palette.primary} />
            <Text style={styles.testButtonText}>{t('common.sendTestNotification')}</Text>
          </Pressable>

          {/* Engine readout — proves the schedule was rebuilt. */}
          {summary ? (
            <Text style={styles.footnote}>
              {summary.enabled
                ? t('reminders.scheduledNowFootnote', {
                    classCount: summary.classReminders,
                    planCount: summary.planReminders,
                    dailyCount: summary.dailyReminders,
                  })
                : summary.reason === 'no-permission'
                  ? t('reminders.pausedNoPermission')
                  : t('reminders.turnedOffFootnote')}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },
    headerSub: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.muted, marginTop: 2 },

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    warning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#FDE7E8',
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    warningText: { flex: 1, fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: '#B4272B', lineHeight: 18 },

    testButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Tint.primary,
      borderRadius: 16,
      padding: 14,
      marginTop: 22,
    },
    testButtonText: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.primary },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 22,
      marginBottom: 12,
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 14,
      ...CARD_SHADOW,
    },
    cardPlain: {
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 14,
      ...CARD_SHADOW,
    },
    rowIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: Tint.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    rowBody: { flex: 1, marginRight: 10 },
    rowTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
    rowSub: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },

    timeCard: {
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 16,
      marginTop: 12,
      ...CARD_SHADOW,
    },
    presetRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    preset: {
      flex: 1,
      height: 40,
      borderRadius: 13,
      backgroundColor: Palette.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    presetActive: { backgroundColor: Tint.primary },
    presetText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted },
    presetTextActive: { color: Palette.primary },

    listRow: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
    repeat: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: Palette.subtle },
    divider: { height: 1, backgroundColor: Palette.hairline, marginVertical: 12 },

    footnote: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '600',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 22,
    },
  });
}
