import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressRing } from '@/components/progress-ring';
import { EmptyState } from '@/components/ui/empty-state';
import { getAddEntryConfig } from '@/constants/categories';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatTime, toDateKey } from '@/lib/time';
import { useAuthStore } from '@/store/auth-store';
import { useHabitSummary } from '@/store/habits-store';
import { useUnreadNotificationCount } from '@/store/notification-store';
import { useMyClasses, useMyPlans, useMyTasks, usePlannerStore } from '@/store/planner-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Soft tint for an arbitrary accent color (used for schedule chips). */
function tintFor(color: string): string {
  return color + '22';
}

/* -------------------------------------------------------------------------- */
/* Data — no mock content. Lists start empty and fill from the local store.   */
/* -------------------------------------------------------------------------- */

type ScheduleItem = {
  id: string;
  /** Sort key: minutes from midnight. */
  minutes: number;
  time: string;
  title: string;
  location?: string;
  color: string;
  tint: string;
  icon: IoniconName;
  /** Daily-plan rows show a strike-through once done; class rows never do. */
  done?: boolean;
};

type Priority = 'High' | 'Medium' | 'Low';

function getPriorityStyle(Palette: AppPalette, Tint: AppTint): Record<Priority, { color: string; tint: string }> {
  return {
    High: { color: '#E5484D', tint: '#FDE7E8' },
    Medium: { color: Palette.orange, tint: Tint.orange },
    Low: { color: Palette.green, tint: Tint.green },
  };
}

type QuickAction = { id: string; label: string; icon: IoniconName; color: string; tint: string };

type TFn = ReturnType<typeof useTranslation>['t'];

function getQuickActions(t: TFn, Palette: AppPalette, Tint: AppTint): QuickAction[] {
  return [
    { id: 'q1', label: t('tabs.home.quickActions.addClass'), icon: 'add-circle', color: Palette.primary, tint: Tint.primary },
    { id: 'q2', label: t('tabs.home.quickActions.addTask'), icon: 'checkmark-done', color: Palette.green, tint: Tint.green },
    { id: 'q3', label: t('tabs.home.quickActions.aiPlanner'), icon: 'sparkles', color: Palette.pink, tint: Tint.pink },
    { id: 'q4', label: t('tabs.home.quickActions.reminders'), icon: 'notifications', color: Palette.blue, tint: Tint.blue },
  ];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getGreeting(t: TFn, date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return t('tabs.home.greetingMorning');
  if (h < 17) return t('tabs.home.greetingAfternoon');
  return t('tabs.home.greetingEvening');
}

function formatToday(date = new Date()): string {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const tabBarSpace = 60 + (insets.bottom > 0 ? insets.bottom : 12);

  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const PRIORITY_STYLE = useMemo(() => getPriorityStyle(Palette, Tint), [Palette, Tint]);
  const QUICK_ACTIONS = useMemo(() => getQuickActions(t, Palette, Tint), [t, Palette, Tint]);

  const profile = useAuthStore((s) => s.profile);
  const firstName = profile?.name?.trim().split(' ')[0] || t('tabs.home.fallbackName');
  const avatarUri = profile?.preferences?.avatarUri;

  // Persona-aware wording (e.g. "Add Class" -> "Add Appointment" for a doctor).
  const cfg = getAddEntryConfig(profile?.category);

  const dateKey = toDateKey();
  const classes = useMyClasses();
  const tasks = useMyTasks();
  const todaysPlans = useMyPlans(dateKey);
  const toggleTask = usePlannerStore((s) => s.toggleTask);
  const unread = useUnreadNotificationCount();
  const habits = useHabitSummary(dateKey);

  const todayIndex = (new Date().getDay() + 6) % 7; // Mon = 0

  /*
   * "Today's Schedule" is the union of timetable classes *and* daily-plan
   * items — previously it only read classes, so anything added on the Daily
   * Plan screen was invisible here even though both are on the same timeline.
   */
  const schedule: ScheduleItem[] = useMemo(() => {
    const fromClasses: ScheduleItem[] = classes
      .filter((c) => c.day === todayIndex)
      .map((c) => ({
        id: `c-${c.id}`,
        minutes: c.start,
        time: formatTime(c.start),
        title: c.subject,
        location: c.room,
        color: c.color,
        tint: tintFor(c.color),
        icon: 'book' as IoniconName,
      }));

    const fromPlans: ScheduleItem[] = todaysPlans.map((p) => ({
      id: `p-${p.id}`,
      minutes: p.time,
      time: formatTime(p.time),
      title: p.title,
      location: p.note,
      color: Palette.primary,
      tint: Tint.primary,
      icon: (p.icon as IoniconName | undefined) ?? 'today-outline',
      done: p.done,
    }));

    return [...fromClasses, ...fromPlans].sort((a, b) => a.minutes - b.minutes);
  }, [classes, todaysPlans, todayIndex, Palette.primary, Tint.primary]);

  // Pending tasks first, capped for the home preview.
  const upcoming = useMemo(() => tasks.filter((t) => !t.done).slice(0, 4), [tasks]);
  const donePlans = todaysPlans.filter((p) => p.done).length;

  const openSchedule = () => router.push('/timetable');
  const openTasks = () => router.push('/tasks');
  const openDailyPlan = () => router.push('/daily-plan');
  const onAiPress = () => router.push('/ai-assistant');
  const onQuickAction = (id: string) => {
    if (id === 'q1') router.push('/add-class');
    else if (id === 'q2') router.push('/add-task');
    else if (id === 'q3') onAiPress();
    // q4 opens reminder *settings*, not the read-only inbox.
    else if (id === 'q4') router.push('/reminders');
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Decorative background blobs */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, styles.blobOne]} />
        <View style={[styles.blob, styles.blobTwo]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: tabBarSpace + 28 },
        ]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>
              {getGreeting(t)}, {firstName} 👋
            </Text>
            <Text style={styles.subGreeting}>{t('tabs.home.subGreeting')}</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/notifications')}
              hitSlop={6}
              style={({ pressed }) => [styles.bellBtn, pressed && styles.pressed]}>
              <Ionicons name="notifications-outline" size={20} color={Palette.ink} />
              {/* Badge reflects the real inbox instead of always showing a dot. */}
              {unread > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable onPress={() => router.push('/profile')} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Quote card */}
        <View style={styles.quoteCard}>
          <View style={styles.quoteIcon}>
            <Ionicons name="sparkles" size={18} color={Palette.primary} />
          </View>
          <Text style={styles.quoteText}>{`“${t('tabs.home.quote')}”`}</Text>
        </View>

        {/* Daily plan CTA */}
        <Pressable
          onPress={openDailyPlan}
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          style={({ pressed }) => [styles.planBtn, pressed && styles.planBtnPressed]}>
          <View style={styles.planBtnIcon}>
            <Ionicons name="today" size={22} color="#FFFFFF" />
          </View>
          <View style={styles.planBtnBody}>
            <Text style={styles.planBtnTitle}>{t('tabs.home.dailyPlanTitle')}</Text>
            <Text style={styles.planBtnSub}>
              {todaysPlans.length > 0
                ? t('tabs.home.doneTodayProgress', { done: donePlans, total: todaysPlans.length })
                : t('tabs.home.dailyPlanEmpty')}
            </Text>
          </View>
          {todaysPlans.length > 0 ? (
            <ProgressRing
              size={40}
              thickness={5}
              progress={donePlans / todaysPlans.length}
              color="#FFFFFF"
              trackColor="rgba(255,255,255,0.3)"
              holeColor={Palette.primary}
            />
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          )}
        </Pressable>

        {/* Today's schedule */}
        <SectionHeader title={t('tabs.home.todaysScheduleTitle')} caption={formatToday()} onPress={openSchedule} />
        <View style={styles.card}>
          {schedule.length === 0 ? (
            <EmptyState
              compact
              icon="calendar-clear-outline"
              title={t('tabs.home.scheduleEmptyTitle')}
              message={t('tabs.home.scheduleEmptyMessage')}
              ctaLabel={t('tabs.home.addToTimetable')}
              onPress={() => router.push('/add-class')}
            />
          ) : (
            schedule.map((item, i) => (
              <View key={item.id}>
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleTime}>{item.time}</Text>
                  {/* Purely informational — daily plans are ticked off from the
                     Daily Plan screen, not from this at-a-glance summary. */}
                  <View style={[styles.scheduleIcon, { backgroundColor: item.tint }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={styles.scheduleBody}>
                    <Text style={[styles.scheduleTitle, item.done && styles.scheduleTitleDone]}>
                      {item.title}
                    </Text>
                    {item.location ? <Text style={styles.scheduleLocation}>{item.location}</Text> : null}
                  </View>
                  <View style={[styles.scheduleDot, { backgroundColor: item.color }]} />
                </View>
                {i < schedule.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))
          )}
        </View>

        {/* Habits — a live summary, so the tracker isn't buried in Profile. */}
        {habits.total > 0 ? (
          <>
            <SectionHeader title={t('tabs.home.habitsTitle')} onPress={() => router.push('/habits')} />
            <Pressable
              onPress={() => router.push('/habits')}
              style={({ pressed }) => [styles.habitCard, pressed && styles.pressedCard]}>
              <ProgressRing size={54} thickness={6} progress={habits.completion}>
                <Text style={styles.habitPct}>{Math.round(habits.completion * 100)}%</Text>
              </ProgressRing>
              <View style={styles.habitBody}>
                <Text style={styles.habitTitle}>
                  {t('tabs.home.doneTodayProgress', { done: habits.done, total: habits.total })}
                </Text>
                <View style={styles.habitMeta}>
                  <Ionicons name="flame" size={14} color={Palette.orange} />
                  <Text style={styles.habitStreak}>{t('tabs.home.dayStreak', { count: habits.bestStreak })}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Palette.subtle} />
            </Pressable>
          </>
        ) : null}

        {/* Upcoming tasks */}
        <SectionHeader title={t('tabs.home.upcomingTasksTitle')} onPress={openTasks} />
        <View style={styles.card}>
          {upcoming.length === 0 ? (
            <EmptyState
              compact
              icon="checkbox-outline"
              title={t('tabs.home.noUpcomingTasksTitle')}
              message={t('tabs.home.noUpcomingTasksMessage')}
              ctaLabel={t('common.addTask')}
              onPress={() => router.push('/add-task')}
            />
          ) : (
            upcoming.map((t, i) => {
              const p = PRIORITY_STYLE[t.priority];
              return (
                <View key={t.id}>
                  <View style={styles.taskRow}>
                    {/* Was a decorative View — now the same toggle as the Tasks tab. */}
                    <Pressable
                      hitSlop={8}
                      onPress={() => toggleTask(t.id)}
                      style={[styles.taskCheck, t.done && styles.taskCheckDone]}>
                      {t.done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </Pressable>
                    <View style={styles.taskBody}>
                      <Text style={styles.taskTitle}>{t.title}</Text>
                      <Text style={styles.taskDue}>
                        {t.subject} · {t.due}
                      </Text>
                    </View>
                    <View style={[styles.priorityChip, { backgroundColor: p.tint }]}>
                      <Text style={[styles.priorityText, { color: p.color }]}>{t.priority}</Text>
                    </View>
                  </View>
                  {i < upcoming.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              );
            })
          )}
        </View>

        {/* Quick actions */}
        <SectionHeader title={t('tabs.home.quickActionsTitle')} />
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onQuickAction(a.id)}
              android_ripple={{ color: 'rgba(108,77,255,0.08)', borderless: false }}
              style={({ pressed }) => [styles.actionCard, pressed && styles.pressedCard]}>
              <View style={[styles.actionIcon, { backgroundColor: a.tint }]}>
                <Ionicons name={a.icon} size={22} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.id === 'q1' ? cfg.title : a.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Floating AI button */}
      <Pressable
        onPress={onAiPress}
        android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true }}
        style={({ pressed }) => [
          styles.fab,
          { bottom: tabBarSpace + 16 },
          pressed && styles.fabPressed,
        ]}>
        <Ionicons name="sparkles" size={26} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Section header                                                             */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  title,
  caption,
  onPress,
}: {
  title: string;
  caption?: string;
  onPress?: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
      </View>
      {onPress ? (
        <Pressable hitSlop={10} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.seeAll}>{t('common.seeAll')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD_SHADOW = {
  shadowColor: '#3A2E7A',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
} as const;

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  pressed: { opacity: 0.6 },

  blob: { position: 'absolute', borderRadius: 999 },
  blobOne: { width: 300, height: 300, top: -120, right: -100, backgroundColor: 'rgba(139,125,255,0.16)' },
  blobTwo: { width: 260, height: 260, top: 260, left: -120, backgroundColor: 'rgba(77,163,255,0.10)' },

  scroll: { paddingHorizontal: 20 },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  greeting: { fontFamily: FontFamily, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: Palette.ink },
  subGreeting: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  bellBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Palette.pink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Palette.card,
  },
  bellBadgeText: { fontFamily: FontFamily, fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  // `overflow: 'hidden'` on the parent alone doesn't reliably clip an
  // <Image> to the circle on iOS — rounding the image itself is the fix.
  avatarImg: { width: '100%', height: '100%', borderRadius: 23 },
  avatarText: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

  /* quote */
  quoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Tint.primary,
    borderRadius: 22,
    padding: 16,
    marginBottom: 24,
  },
  quoteIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteText: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '600', fontStyle: 'italic', color: Palette.ink, lineHeight: 21 },

  /* daily plan CTA */
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Palette.primary,
    borderRadius: 22,
    padding: 16,
    marginBottom: 24,
    shadowColor: Palette.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  planBtnPressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
  planBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBtnBody: { flex: 1 },
  planBtnTitle: { fontFamily: FontFamily, fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  planBtnSub: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  /* section header */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: Palette.ink },
  sectionCaption: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },
  seeAll: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.primary },

  /* generic card */
  card: {
    backgroundColor: Palette.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 24,
    ...CARD_SHADOW,
  },
  divider: { height: 1, backgroundColor: Palette.hairline, marginVertical: 12 },

  /* schedule */
  scheduleRow: { flexDirection: 'row', alignItems: 'center' },
  scheduleTime: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: Palette.muted, width: 66 },
  scheduleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  scheduleBody: { flex: 1 },
  scheduleTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
  scheduleTitleDone: { color: Palette.subtle, textDecorationLine: 'line-through' },
  scheduleLocation: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },
  scheduleDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },

  /* habits summary */
  habitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Palette.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 24,
    ...CARD_SHADOW,
  },
  habitPct: { fontFamily: FontFamily, fontSize: 13, fontWeight: '800', color: Palette.primary },
  habitBody: { flex: 1 },
  habitTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
  habitMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  habitStreak: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.orange },

  /* tasks */
  taskRow: { flexDirection: 'row', alignItems: 'center' },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#CFC7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  taskCheckDone: { backgroundColor: Palette.green, borderColor: Palette.green },
  taskBody: { flex: 1 },
  taskTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
  taskDue: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },
  priorityChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  priorityText: { fontFamily: FontFamily, fontSize: 11, fontWeight: '700' },

  /* quick actions */
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14 },
  actionCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.card,
    borderRadius: 22,
    padding: 14,
    ...CARD_SHADOW,
  },
  pressedCard: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  actionIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink },

  /* fab */
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.primary,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  fabPressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.95 }] },
  });
}
