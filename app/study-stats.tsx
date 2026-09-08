import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarChart, LegendRow, Sparkline, StatTile } from '@/components/charts';
import { EmptyState } from '@/components/ui/empty-state';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAnalytics } from '@/hooks/use-analytics';
import { useAppTheme } from '@/hooks/use-app-theme';
import { type Analytics, formatMinutesTotal, formatPercent, WEEKDAY_SHORT } from '@/lib/analytics';

type IoniconName = keyof typeof Ionicons.glyphMap;
type Range = 7 | 30;

/* -------------------------------------------------------------------------- */
/* Achievements                                                               */
/* -------------------------------------------------------------------------- */

type Achievement = {
  id: string;
  title: string;
  caption: string;
  icon: IoniconName;
  colorKey: 'primary' | 'blue' | 'green' | 'orange' | 'pink';
  /** 0..1 — the track fills as the user approaches the goal. */
  progress: number;
  unlocked: boolean;
};

/** Derived purely from real analytics, so nothing here can unlock on mock data. */
function buildAchievements(a: Analytics): Achievement[] {
  const ratio = (value: number, goal: number) => Math.max(0, Math.min(1, value / goal));
  return [
    {
      id: 'first-step',
      title: 'First Step',
      caption: 'Complete your first task',
      icon: 'footsteps-outline',
      colorKey: 'green',
      progress: ratio(a.tasks.done, 1),
      unlocked: a.tasks.done >= 1,
    },
    {
      id: 'consistent',
      title: 'Consistent',
      caption: '3-day activity streak',
      icon: 'flame-outline',
      colorKey: 'orange',
      progress: ratio(a.activeStreak, 3),
      unlocked: a.activeStreak >= 3,
    },
    {
      id: 'committed',
      title: 'Committed',
      caption: '7-day activity streak',
      icon: 'trophy-outline',
      colorKey: 'pink',
      progress: ratio(a.activeStreak, 7),
      unlocked: a.activeStreak >= 7,
    },
    {
      id: 'organiser',
      title: 'Organiser',
      caption: 'Schedule 5 classes',
      icon: 'calendar-outline',
      colorKey: 'blue',
      progress: ratio(a.classes.count, 5),
      unlocked: a.classes.count >= 5,
    },
    {
      id: 'finisher',
      title: 'Finisher',
      caption: 'Complete 25 tasks',
      icon: 'checkmark-done-outline',
      colorKey: 'primary',
      progress: ratio(a.tasks.done, 25),
      unlocked: a.tasks.done >= 25,
    },
    {
      id: 'habitual',
      title: 'Habitual',
      caption: '10-day habit streak',
      icon: 'leaf-outline',
      colorKey: 'green',
      progress: ratio(a.habits.longestEver, 10),
      unlocked: a.habits.longestEver >= 10,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function StudyStatsScreen() {
  const router = useRouter();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const [range, setRange] = useState<Range>(7);
  const a = useAnalytics(range);

  const achievements = useMemo(() => buildAchievements(a), [a]);
  const unlockedCount = achievements.filter((x) => x.unlocked).length;

  // Totals for the "what made up the number" breakdown.
  const mix = useMemo(() => {
    const tasks = a.range.series.reduce((s, d) => s + d.tasksDone, 0);
    const plans = a.range.series.reduce((s, d) => s + d.plansDone, 0);
    const habits = a.range.series.reduce((s, d) => s + d.habitsDone, 0);
    return { tasks, plans, habits, total: Math.max(1, tasks + plans + habits) };
  }, [a.range.series]);

  // Both fallbacks below are only ever reached with one of the 5 literal
  // `colorKey` values from the closed Achievement type, all guaranteed to
  // exist on Palette/Tint — the `??` side can never actually trigger.
  /* v8 ignore start */
  const colorFor = (key: string) =>
    (Palette as unknown as Record<string, string>)[key] ?? Palette.primary;
  const tintFor = (key: string) => (Tint as unknown as Record<string, string>)[key] ?? Tint.primary;
  /* v8 ignore stop */

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Statistics</Text>
          <View style={styles.iconBtn} />
        </View>

        {!a.hasData ? (
          <View style={styles.center}>
            <EmptyState
              icon="stats-chart-outline"
              title="No statistics yet"
              message="Your study hours, subject breakdown, weekly and monthly trends, achievements and streaks will show up here as you use the app."
              ctaLabel="Add to Timetable"
              onPress={() => router.push('/add-class')}
            />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Range switch */}
            <View style={styles.segment}>
              {([7, 30] as Range[]).map((r) => {
                const active = r === range;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setRange(r)}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}>
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {r} days
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Headline tiles */}
            <View style={styles.tileRow}>
              <StatTile
                icon="flame"
                color={Palette.orange}
                tint={Tint.orange}
                value={`${a.activeStreak}`}
                label="Day streak"
              />
              <StatTile
                icon="checkmark-done"
                color={Palette.green}
                tint={Tint.green}
                value={`${a.range.total}`}
                label={`Completed in ${range}d`}
              />
            </View>
            <View style={styles.tileRow}>
              <StatTile
                icon="time-outline"
                color={Palette.blue}
                tint={Tint.blue}
                value={formatMinutesTotal(a.classes.weeklyMinutes)}
                label="Scheduled per week"
              />
              <StatTile
                icon="pie-chart-outline"
                color={Palette.primary}
                tint={Tint.primary}
                value={formatPercent(a.tasks.completionRate)}
                label="Task completion"
              />
            </View>

            {/* Trend */}
            <Text style={styles.sectionLabel}>Trend</Text>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{range}-day activity</Text>
                <Text style={styles.cardMeta}>avg {a.range.average.toFixed(1)}/day</Text>
              </View>
              {range === 7 ? (
                <BarChart
                  data={a.range.series.map((d) => ({
                    key: d.key,
                    label: d.label,
                    value: d.total,
                    highlight: d.isToday,
                  }))}
                />
              ) : (
                <>
                  {/* 30 labelled bars would be unreadable — use the trend strip. */}
                  <Sparkline values={a.range.series.map((d) => d.total)} height={72} />
                  <View style={styles.sparkAxis}>
                    <Text style={styles.axisText}>{a.range.series[0]?.key.slice(5) ?? ''}</Text>
                    <Text style={styles.axisText}>Today</Text>
                  </View>
                </>
              )}
              <Text style={styles.cardFoot}>
                {a.range.best
                  ? `Peak: ${a.range.best.total} completed on ${a.range.best.key}`
                  : 'Nothing completed in this window yet.'}
              </Text>
            </View>

            {/* Breakdown */}
            <Text style={styles.sectionLabel}>Breakdown</Text>
            <View style={styles.card}>
              <LegendRow
                color={Palette.green}
                label="Tasks"
                value={`${mix.tasks}`}
                progress={mix.tasks / mix.total}
              />
              <LegendRow
                color={Palette.primary}
                label="Daily plan items"
                value={`${mix.plans}`}
                progress={mix.plans / mix.total}
              />
              <LegendRow
                color={Palette.orange}
                label="Habits hit"
                value={`${mix.habits}`}
                progress={mix.habits / mix.total}
              />
            </View>

            {/* Weekly load */}
            {a.classes.weeklyMinutes > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Weekly load</Text>
                <View style={styles.card}>
                  <BarChart
                    data={a.classes.perDay.map((m, i) => ({
                      key: `d${i}`,
                      label: WEEKDAY_SHORT[i],
                      value: Math.round(m / 6) / 10, // minutes -> hours, 1dp
                      highlight: i === a.classes.busiestDay,
                    }))}
                    color={Palette.blue}
                    mutedColor={Tint.blue}
                  />
                  <Text style={styles.cardFoot}>Hours scheduled each weekday</Text>
                </View>
              </>
            ) : null}

            {/* Subjects */}
            {a.subjects.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Subjects</Text>
                <View style={styles.card}>
                  {a.subjects.map((s) => (
                    <LegendRow
                      key={s.name}
                      color={s.color}
                      label={s.name}
                      value={s.minutes > 0 ? formatMinutesTotal(s.minutes) : `${s.taskTotal} tasks`}
                      caption={s.taskTotal > 0 ? `${s.taskDone}/${s.taskTotal} tasks done` : undefined}
                      progress={s.taskTotal ? s.taskDone / s.taskTotal : s.share}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* Achievements */}
            <Text style={styles.sectionLabel}>
              Achievements · {unlockedCount}/{achievements.length}
            </Text>
            <View style={styles.achievementGrid}>
              {achievements.map((ach) => (
                <View key={ach.id} style={[styles.achievement, !ach.unlocked && styles.achievementLocked]}>
                  <View
                    style={[
                      styles.achievementIcon,
                      { backgroundColor: ach.unlocked ? tintFor(ach.colorKey) : Palette.hairline },
                    ]}>
                    <Ionicons
                      name={ach.unlocked ? ach.icon : 'lock-closed-outline'}
                      size={20}
                      color={ach.unlocked ? colorFor(ach.colorKey) : Palette.subtle}
                    />
                  </View>
                  <Text style={styles.achievementTitle} numberOfLines={1}>
                    {ach.title}
                  </Text>
                  <Text style={styles.achievementCaption} numberOfLines={2}>
                    {ach.caption}
                  </Text>
                  <View style={styles.achievementTrack}>
                    <View
                      style={[
                        styles.achievementFill,
                        {
                          width: `${Math.round(ach.progress * 100)}%`,
                          backgroundColor: ach.unlocked ? colorFor(ach.colorKey) : Palette.subtle,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
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
    center: { flex: 1, justifyContent: 'center', paddingBottom: 60 },

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    segment: {
      flexDirection: 'row',
      backgroundColor: Palette.hairline,
      borderRadius: 16,
      padding: 4,
      gap: 4,
      marginBottom: 16,
    },
    segmentItem: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    segmentItemActive: {
      backgroundColor: Palette.card,
      shadowColor: '#3A2E7A',
      shadowOpacity: 0.1,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    segmentText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.muted },
    segmentTextActive: { color: Palette.primary },

    tileRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 20,
      marginBottom: 12,
    },

    card: { backgroundColor: Palette.card, borderRadius: 22, padding: 18, ...CARD_SHADOW },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    cardTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '800', color: Palette.ink },
    cardMeta: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },
    cardFoot: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.subtle, marginTop: 14 },

    sparkAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    axisText: { fontFamily: FontFamily, fontSize: 11, fontWeight: '600', color: Palette.subtle },

    achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    achievement: {
      width: '47%',
      flexGrow: 1,
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 14,
      ...CARD_SHADOW,
    },
    achievementLocked: { opacity: 0.72 },
    achievementIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    achievementTitle: { fontFamily: FontFamily, fontSize: 14, fontWeight: '800', color: Palette.ink },
    achievementCaption: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.muted,
      marginTop: 3,
      minHeight: 32,
    },
    achievementTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: Palette.hairline,
      marginTop: 8,
      overflow: 'hidden',
    },
    achievementFill: { height: '100%', borderRadius: 3 },
  });
}
