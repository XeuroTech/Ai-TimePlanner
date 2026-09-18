import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
            <Text style={styles.title}>{t('tabs.analytics.title')}</Text>
            <Text style={styles.subtitle}>{t('tabs.analytics.subtitle')}</Text>
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
            title={t('tabs.analytics.emptyTitle')}
            message={t('tabs.analytics.emptyMessage')}
            ctaLabel={t('tabs.analytics.emptyCta')}
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
              <Text style={styles.heroLabel}>{t('tabs.analytics.todaysProgress')}</Text>
              <Text style={styles.heroBig}>{formatPercent(a.today.score)}</Text>
              <View style={styles.streakChip}>
                <Ionicons name="flame" size={14} color="#FFFFFF" />
                <Text style={styles.streakChipText}>
                  {t('tabs.analytics.activeStreak', { count: a.activeStreak })}
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
              label={t('tabs.analytics.tasksCompleted')}
            />
            <StatTile
              icon="time-outline"
              color={Palette.blue}
              tint={Tint.blue}
              value={formatMinutesTotal(a.classes.weeklyMinutes)}
              label={t('tabs.analytics.scheduledWeekly')}
            />
          </View>
          <View style={styles.tileRow}>
            <StatTile
              icon="flame"
              color={Palette.orange}
              tint={Tint.orange}
              value={`${a.habits.bestStreak}`}
              label={t('tabs.analytics.bestHabitStreak')}
            />
            <StatTile
              icon="trending-up"
              color={Palette.primary}
              tint={Tint.primary}
              value={a.range.average.toFixed(1)}
              label={t('tabs.analytics.avgCompletionsPerDay')}
            />
          </View>

          {/* 7-day trend */}
          <Text style={styles.sectionLabel}>{t('tabs.analytics.last7Days')}</Text>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{t('tabs.analytics.completionsTitle')}</Text>
              <Text style={styles.cardMeta}>{t('tabs.analytics.totalMeta', { total: a.range.total })}</Text>
            </View>
            <BarChart data={barData} />
            {a.range.best ? (
              <Text style={styles.cardFoot}>
                {t('tabs.analytics.bestDayFoot', { day: a.range.best.label, count: a.range.best.total })}
              </Text>
            ) : (
              <Text style={styles.cardFoot}>{t('tabs.analytics.nothingCompletedFoot')}</Text>
            )}
          </View>

          {/* Task breakdown */}
          <Text style={styles.sectionLabel}>{t('tabs.analytics.tasksSection')}</Text>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{t('tabs.analytics.completionRateTitle')}</Text>
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
              {t('tabs.analytics.doneVsPendingFoot', { done: a.tasks.done, pending: a.tasks.pending })}
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
                  label={t('tabs.analytics.priorityRow', { priority: p })}
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
              <Text style={styles.sectionLabel}>{t('tabs.analytics.subjectsSection')}</Text>
              <View style={styles.card}>
                {subjectSegments.length > 0 ? (
                  <>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{t('tabs.analytics.weeklyTimeSplitTitle')}</Text>
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
                    value={s.minutes > 0 ? formatMinutesTotal(s.minutes) : t('tabs.analytics.tasksCount', { count: s.taskTotal })}
                    caption={
                      s.taskTotal > 0
                        ? t('tabs.analytics.tasksDoneCaption', { done: s.taskDone, total: s.taskTotal })
                        : t('tabs.analytics.noTasksYetCaption')
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
              <Text style={styles.sectionLabel}>{t('tabs.analytics.weeklyLoadSection')}</Text>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{t('tabs.analytics.scheduledPerDayTitle')}</Text>
                  <Text style={styles.cardMeta}>{t('tabs.analytics.entriesMeta', { count: a.classes.count })}</Text>
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
                    ? t('tabs.analytics.busiestDayFoot', {
                        day: WEEKDAY_SHORT[a.classes.busiestDay],
                        duration: formatMinutesTotal(a.classes.perDay[a.classes.busiestDay]),
                      })
                    : t('tabs.analytics.nothingScheduledFoot')}
                </Text>
              </View>
            </>
          ) : null}

          {/* Habits */}
          <Text style={styles.sectionLabel}>{t('tabs.analytics.habitsSection')}</Text>
          <View style={styles.card}>
            {a.habits.total === 0 ? (
              <EmptyState
                compact
                icon="leaf-outline"
                title={t('tabs.analytics.noHabitsTitle')}
                message={t('tabs.analytics.noHabitsMessage')}
                ctaLabel={t('tabs.analytics.openHabitTracker')}
                onPress={() => router.push('/habits')}
              />
            ) : (
              <>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>{t('tabs.analytics.todayCardTitle')}</Text>
                  <Text style={styles.cardMeta}>
                    {t('tabs.analytics.habitsMeta', {
                      done: a.habits.done,
                      total: a.habits.total,
                      percent: formatPercent(a.habits.completion),
                    })}
                  </Text>
                </View>
                {a.habits.rows.map((r) => (
                  <LegendRow
                    key={r.habit.id}
                    color={(Palette as unknown as Record<string, string>)[r.habit.colorKey] ?? Palette.primary}
                    label={r.habit.name}
                    value={r.habit.unit ? `${r.current}/${r.target}` : r.done ? t('common.done') : '—'}
                    caption={t('tabs.analytics.streakCaption', { streak: r.streak, best: r.bestStreak })}
                    progress={r.pct}
                  />
                ))}
              </>
            )}
          </View>

          <Pressable
            onPress={() => router.push('/study-stats')}
            style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.moreText}>{t('tabs.analytics.viewDetailedStats')}</Text>
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
