import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { type PlanTask, useMyTasks, usePlannerStore } from '@/store/planner-store';

// Enable smooth layout transitions on Android (no-op where unsupported).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateNext = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* TODO(backend): load tasks from your API / store; toggling should persist.  */
/* -------------------------------------------------------------------------- */

type Priority = 'High' | 'Medium' | 'Low';

function getPriorityStyle(Palette: AppPalette, Tint: AppTint): Record<Priority, { color: string; tint: string }> {
  return {
    High: { color: '#E5484D', tint: '#FDE7E8' },
    Medium: { color: Palette.orange, tint: Tint.orange },
    Low: { color: Palette.green, tint: Tint.green },
  };
}

type Filter = 'all' | 'pending' | 'completed';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
];

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarSpace = 60 + (insets.bottom > 0 ? insets.bottom : 12);

  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const PRIORITY_STYLE = useMemo(() => getPriorityStyle(Palette, Tint), [Palette, Tint]);

  const tasks = useMyTasks();
  const toggleTask = usePlannerStore((s) => s.toggleTask);
  const removeTask = usePlannerStore((s) => s.removeTask);
  const [filter, setFilter] = useState<Filter>('all');

  const pendingCount = tasks.filter((t) => !t.done).length;
  const completedCount = tasks.length - pendingCount;
  const counts: Record<Filter, number> = {
    all: tasks.length,
    pending: pendingCount,
    completed: completedCount,
  };

  const visible = useMemo(() => {
    if (filter === 'pending') return tasks.filter((t) => !t.done);
    if (filter === 'completed') return tasks.filter((t) => t.done);
    // "All": keep pending on top, completed sink to the bottom.
    return [...tasks].sort((a, b) => Number(a.done) - Number(b.done));
  }, [tasks, filter]);

  const toggle = (id: string) => {
    animateNext();
    toggleTask(id);
  };

  const selectFilter = (key: Filter) => {
    animateNext();
    setFilter(key);
  };

  const onAdd = () => {
    router.push('/add-task');
  };

  /** Long-press surfaces edit/delete without cluttering the row itself. */
  const onLongPressTask = (task: PlanTask) => {
    Alert.alert(task.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => router.push({ pathname: '/add-task', params: { taskId: task.id } }) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete task', `Delete "${task.title}"? This can't be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                animateNext();
                removeTask(task.id);
              },
            },
          ]),
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.blob} />
      </View>

      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>My Tasks</Text>
            <Text style={styles.summary}>
              {pendingCount} pending · {completedCount} completed
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="checkmark-done" size={22} color={Palette.primary} />
          </View>
        </View>

        {/* Segmented filter with live counts */}
        <View style={styles.segment}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => selectFilter(f.key)}
                style={[styles.segmentItem, active && styles.segmentItemActive]}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {f.label}
                </Text>
                <View style={[styles.segCount, active && styles.segCountActive]}>
                  <Text style={[styles.segCountText, active && styles.segCountTextActive]}>
                    {counts[f.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarSpace + 90 }]}>
        {visible.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          visible.map((t) => {
            const p = PRIORITY_STYLE[t.priority];
            return (
              <Pressable
                key={t.id}
                onPress={() => toggle(t.id)}
                onLongPress={() => onLongPressTask(t)}
                delayLongPress={300}
                android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
                <View style={[styles.checkbox, t.done && styles.checkboxDone]}>
                  {t.done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </View>

                <View style={styles.cardBody}>
                  <Text
                    style={[styles.cardTitle, t.done && styles.cardTitleDone]}
                    numberOfLines={1}>
                    {t.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={[styles.subjectDot, { backgroundColor: p.color }]} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {t.subject}
                    </Text>
                    <Text style={styles.metaDivider}>·</Text>
                    <Ionicons name="time-outline" size={13} color={Palette.subtle} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {t.due}
                    </Text>
                  </View>
                </View>

                <View style={[styles.priorityChip, { backgroundColor: p.tint }]}>
                  <Text style={[styles.priorityText, { color: p.color }]}>{t.priority}</Text>
                </View>

                <Pressable
                  hitSlop={8}
                  onPress={() => onLongPressTask(t)}
                  style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
                  <Ionicons name="ellipsis-vertical" size={16} color={Palette.subtle} />
                </Pressable>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Floating add button */}
      <Pressable
        onPress={onAdd}
        android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true }}
        style={({ pressed }) => [styles.fab, { bottom: tabBarSpace + 16 }, pressed && styles.fabPressed]}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

function EmptyState({ filter }: { filter: Filter }) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const message =
    filter === 'completed'
      ? 'No completed tasks yet.'
      : filter === 'pending'
        ? 'All caught up — nothing pending!'
        : 'No tasks yet. Add your first one.';
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles" size={36} color={Palette.primary} />
      </View>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD_SHADOW = {
  shadowColor: '#3A2E7A',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },

  blob: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -110,
    right: -90,
    backgroundColor: 'rgba(139,125,255,0.14)',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  title: { fontFamily: FontFamily, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: Palette.ink },
  summary: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, marginTop: 4 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segment: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#ECEAF6',
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
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
  segCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#DAD6EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segCountActive: { backgroundColor: Tint.primary },
  segCountText: { fontFamily: FontFamily, fontSize: 11, fontWeight: '800', color: Palette.muted },
  segCountTextActive: { color: Palette.primary },

  list: { paddingHorizontal: 20, paddingTop: 18, gap: 12 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderRadius: 20,
    padding: 16,
    ...CARD_SHADOW,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CFC7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkboxDone: { backgroundColor: Palette.green, borderColor: Palette.green },
  cardBody: { flex: 1, marginRight: 10 },
  cardTitle: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
  cardTitleDone: { color: Palette.subtle, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  subjectDot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, flexShrink: 1 },
  metaDivider: { color: Palette.subtle, fontSize: 13 },

  priorityChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  priorityText: { fontFamily: FontFamily, fontSize: 11, fontWeight: '800' },
  menuBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  pressed: { opacity: 0.5 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 16 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '600', color: Palette.muted, textAlign: 'center' },

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
