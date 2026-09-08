import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarChart, LegendRow, StackedBar, StatTile } from '@/components/charts';
import { ProgressRing } from '@/components/progress-ring';
import { EmptyState } from '@/components/ui/empty-state';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAnalytics } from '@/hooks/use-analytics';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMinutesTotal, formatPercent, WEEKDAY_SHORT } from '@/lib/analytics';

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const tabBarSpace = 60 + (insets.bottom > 0 ? insets.bottom : 12);

  const a = useAnalytics(7);

  const barData = useMemo(
    () =>
      a.range.series.map((d) => ({
        key: d.key,
        label: d.label,
        value: d.total,
        highlight: d.isToday,
      })),
    [a.range.series],
  );

  const subjectSegments = useMemo(
    () =>
      a.subjects
        .filter((s) => s.minutes > 0)
        .map((s) => ({ key: s.name, value: s.minutes, color: s.color })),
    [a.subjects],
  );

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ paddingTop: insets.top + 12 }}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>Track your productivity habits</Text>
          </View>
          <Pressable
            hitSlop={8}
            onPress={() => router.push('/study-stats')}
            style={({ pressed }) => [styles.statsBtn, pressed && { opacity: 0.6 }]}>
            <Ionicons name="stats-chart" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {!a.hasData ? (
        <View style={styles.center}>
          <EmptyState
            icon="bar-chart-outline"
            title="No analytics yet"
            message="Complete tasks and study sessions and your insights, trends and streaks will appear here."
            ctaLabel="Add your first task"
            onPress={() => router.push('/add-task')}
          />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarSpace + 28 }]}>
          {/* Today hero */}
          <View style={styles.hero}>
            <View pointerEvents="none" style={styles.heroBlob} />
            <View style={styles.heroText}>
              <Text style={styles.heroLabel}>{"Today's Progress"}</Text>
              <Text style={styles.heroBig}>{formatPercent(a.today.score)}</Text>
              <View style={styles.streakChip}>
                <Ionicons name="flame" size={14} color="#FFFFFF" />
                <Text style={styles.streakChipText}>
                  {a.activeStreak} day{a.activeStreak === 1 ? '' : 's'} active
                </Text>
              </View>
            </View>
            <ProgressRing
              size={104}
              thickness={12}
              progress={a.today.score}
              color="#FFFFFF"
              trackColor="rgba(255,255,255,0.28)"
              holeColor={Palette.primary}>
              <Text style={styles.ringLabel}>
                {a.today.donePlans}/{a.today.plannedItems}
              </Text>
            </ProgressRing>
          </View>

          {/* Headline tiles */}
          <View style={styles.tileRow}>
            <StatTile
              icon="checkmark-done"
              color={Palette.green}
              tint={Tint.green}
              value={`${a.tasks.done}`}
              label="Tasks completed"
            />
            <StatTile
              icon="time-outline"
              color={Palette.blue}
              tint={Tint.blue}
              value={formatMinutesTotal(a.classes.weeklyMinutes)}
              label="Scheduled weekly"
            />
          </View>
          <View style={styles.tileRow}>
            <StatTile
              icon="flame"
              color={Palette.orange}
              tint={Tint.orange}
              value={`${a.habits.bestStreak}`}
              label="Best habit streak"
            />
            <StatTile
              icon="trending-up"
              color={Palette.primary}
              tint={Tint.primary}
              value={a.range.average.toFixed(1)}
              label="Avg completions / day"
            />
          </View>

          {/* 7-day trend */}
          <Text style={styles.sectionLabel}>Last 7 days</Text>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Completions</Text>
              <Text style={styles.cardMeta}>{a.range.total} total</Text>
            </View>
            <BarChart data={barData} />
            {a.range.best ? (
              <Text style={styles.cardFoot}>
                Best day: {a.range.best.label} with {a.range.best.total} completed
              </Text>
            ) : (
              <Text style={styles.cardFoot}>Nothing completed yet this week.</Text>
            )}
          </View>

          {/* Task breakdown */}
          <Text style={styles.sectionLabel}>Tasks</Text>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Completion rate</Text>
              <Text style={styles.cardMeta}>{formatPercent(a.tasks.completionRate)}</Text>
            </View>
            <StackedBar
              segments={[
                { key: 'done', value: a.tasks.done, color: Palette.green },
                { key: 'pending', value: a.tasks.pending, color: Palette.hairline },
              ]}
              style={styles.stack}
            />
            <Text style={styles.cardFoot}>
              {a.tasks.done} done · {a.tasks.pending} pending
            </Text>

            <View style={styles.divider} />

            {(['High', 'Medium', 'Low'] as const).map((p) => {
              const row = a.tasks.byPriority[p];
              if (row.total === 0) return null;
              const color = p === 'High' ? '#E5484D' : p === 'Medium' ? Palette.orange : Palette.green;
              return (
                <LegendRow
                  key={p}
                  color={color}
                  label={`${p} priority`}
                  value={`${row.done}/${row.total}`}
                  // The `row.total === 0` case already returned null above, so
                  // row.total is always truthy here — the `: 0` side is dead.
                  /* v8 ignore next */
                  progress={row.total ? row.done / row.total : 0}
                />
              );
            })}
          </View>

          {/* Subject split */}
          {a.subjects.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Subjects</Text>
              <View style={styles.card}>
                {subjectSegments.length > 0 ? (
                  <>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>Weekly time split</Text>
                      <Text style={styles.cardMeta}>{formatMinutesTotal(a.classes.weeklyMinutes)}</Text>
                    </View>
                    <StackedBar segments={subjectSegments} style={styles.stack} />
                  </>
                ) : null}
                {a.subjects.slice(0, 6).map((s) => (
                  <LegendRow
                    key={s.name}
                    color={s.color}
                    label={s.name}
                    value={s.minutes > 0 ? formatMinutesTotal(s.minutes) : `${s.taskTotal} tasks`}
                    caption={
                      s.taskTotal > 0
                        ? `${s.taskDone}/${s.taskTotal} tasks done`
                        : 'No tasks yet'
                    }
                    progress={s.taskTotal ? s.taskDone / s.taskTotal : undefined}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Weekly load */}
          {a.classes.weeklyMinutes > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Weekly load</Text>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Scheduled per day</Text>
                  <Text style={styles.cardMeta}>{a.classes.count} entries</Text>
                </View>
                <BarChart
                  data={a.classes.perDay.map((m, i) => ({
                    key: `d${i}`,
                    label: WEEKDAY_SHORT[i],
                    value: Math.round(m / 6) / 10, // hours, 1dp
                    highlight: i === a.classes.busiestDay,
                  }))}
                  color={Palette.blue}
                  mutedColor={Tint.blue}
                />
                <Text style={styles.cardFoot}>
                  {a.classes.busiestDay !== null
                    ? `Busiest day: ${WEEKDAY_SHORT[a.classes.busiestDay]} (${formatMinutesTotal(
                        a.classes.perDay[a.classes.busiestDay],
                      )})`
                    : 'Nothing scheduled yet.'}
                </Text>
              </View>
            </>
          ) : null}

          {/* Habits */}
          <Text style={styles.sectionLabel}>Habits</Text>
          <View style={styles.card}>
            {a.habits.total === 0 ? (
              <EmptyState
                compact
                icon="leaf-outline"
                title="No habits tracked"
                message="Track daily habits to see streaks and consistency here."
                ctaLabel="Open Habit Tracker"
                onPress={() => router.push('/habits')}
              />
            ) : (
              <>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Today</Text>
                  <Text style={styles.cardMeta}>
                    {a.habits.done}/{a.habits.total} · {formatPercent(a.habits.completion)}
                  </Text>
                </View>
                {a.habits.rows.map((r) => (
                  <LegendRow
                    key={r.habit.id}
                    color={(Palette as unknown as Record<string, string>)[r.habit.colorKey] ?? Palette.primary}
                    label={r.habit.name}
                    value={r.habit.unit ? `${r.current}/${r.target}` : r.done ? 'Done' : '—'}
                    caption={`${r.streak} day streak · best ${r.bestStreak}`}
                    progress={r.pct}
                  />
                ))}
              </>
            )}
          </View>

          <Pressable
            onPress={() => router.push('/study-stats')}
            style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.moreText}>View detailed statistics</Text>
            <Ionicons name="chevron-forward" size={18} color={Palette.primary} />
          </Pressable>
        </ScrollView>
      )}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    title: { fontFamily: FontFamily, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: Palette.ink },
    subtitle: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, marginTop: 3 },
    statsBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: { flex: 1, justifyContent: 'center', paddingBottom: 80 },

    scroll: { paddingHorizontal: 20, paddingTop: 12 },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Palette.primary,
      borderRadius: 26,
      padding: 22,
      overflow: 'hidden',
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    heroBlob: {
      position: 'absolute',
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: 'rgba(255,255,255,0.14)',
      top: -60,
      right: -30,
    },
    heroText: { flex: 1, paddingRight: 12 },
    heroLabel: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
    heroBig: {
      fontFamily: FontFamily,
      fontSize: 42,
      fontWeight: '800',
      color: '#FFFFFF',
      marginVertical: 4,
      letterSpacing: -1,
    },
    streakChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
    },
    streakChipText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
    ringLabel: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: '#FFFFFF' },

    tileRow: { flexDirection: 'row', gap: 12, marginTop: 12 },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 26,
      marginBottom: 12,
    },

    card: {
      backgroundColor: Palette.card,
      borderRadius: 22,
      padding: 18,
      ...CARD_SHADOW,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    cardTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '800', color: Palette.ink },
    cardMeta: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },
    cardFoot: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '600',
      color: Palette.subtle,
      marginTop: 14,
    },
    stack: { marginBottom: 4 },
    divider: { height: 1, backgroundColor: Palette.hairline, marginVertical: 18 },

    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 52,
      borderRadius: 18,
      backgroundColor: Tint.primary,
      marginTop: 24,
    },
    moreText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.primary },
  });
}
