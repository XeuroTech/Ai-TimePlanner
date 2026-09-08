import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* Keyed by `${year}-${month}-${day}` (month is 0-based).                     */
/* TODO(backend): load events for the visible month from your API.            */
/* -------------------------------------------------------------------------- */

type CalEvent = { id: string; title: string; time: string; color: string };

function keyFor(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const TODAY = new Date();
// No mock data — events come from the local calendar store once created.
const EVENTS: Record<string, CalEvent[]> = {};

type Cell = { date: Date; inMonth: boolean };

function buildMonth(year: number, month: number): Cell[] {
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun
  const cells: Cell[] = [];
  // 6 rows x 7 cols = 42 cells, starting from the Sunday on/before the 1st.
  const start = new Date(year, month, 1 - firstWeekday);
  for (let i = 0; i < 42; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function CalendarScreen() {
  const router = useRouter();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const [view, setView] = useState({ year: TODAY.getFullYear(), month: TODAY.getMonth() });
  const [selected, setSelected] = useState(new Date(TODAY));

  const cells = useMemo(() => buildMonth(view.year, view.month), [view]);
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectedEvents = EVENTS[keyFor(selected)] ?? [];
  const selectedLabel = selected.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });

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
          <Text style={styles.headerTitle}>Calendar</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}>
          {/* Month card */}
          <View style={styles.monthCard}>
            <View style={styles.monthNav}>
              <Pressable
                hitSlop={10}
                onPress={() => shiftMonth(-1)}
                style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}>
                <Ionicons name="chevron-back" size={18} color={Palette.primary} />
              </Pressable>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <Pressable
                hitSlop={10}
                onPress={() => shiftMonth(1)}
                style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}>
                <Ionicons name="chevron-forward" size={18} color={Palette.primary} />
              </Pressable>
            </View>

            {/* Weekday labels */}
            <View style={styles.weekRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={styles.weekLabel}>
                  {w}
                </Text>
              ))}
            </View>

            {/* Day grid */}
            <View style={styles.grid}>
              {cells.map((cell) => {
                const isSelected = sameDay(cell.date, selected);
                const isToday = sameDay(cell.date, TODAY);
                const hasEvents = (EVENTS[keyFor(cell.date)] ?? []).length > 0;
                return (
                  <Pressable
                    key={cell.date.toISOString()}
                    onPress={() => setSelected(cell.date)}
                    style={styles.dayCell}>
                    <View style={[styles.dayInner, isSelected && styles.daySelected]}>
                      <Text
                        style={[
                          styles.dayText,
                          !cell.inMonth && styles.dayMuted,
                          isToday && !isSelected && styles.dayToday,
                          isSelected && styles.dayTextSelected,
                        ]}>
                        {cell.date.getDate()}
                      </Text>
                    </View>
                    {
                      // EVENTS is a hardcoded empty stub (see below) — hasEvents is
                      // always false until a real events source is wired in, so
                      // only the placeholder arm below ever renders.
                      /* v8 ignore start */
                      hasEvents ? (
                        <View
                          style={[
                            styles.eventDot,
                            { backgroundColor: isSelected ? '#FFFFFF' : Palette.primary },
                          ]}
                        />
                      ) : (
                        <View style={styles.eventDotPlaceholder} />
                      )
                      /* v8 ignore stop */
                    }
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Events */}
          <View style={styles.eventsHeader}>
            <Text style={styles.eventsTitle}>Events on {selectedLabel}</Text>
            {isTodaySelected(selected) ? <Text style={styles.todayBadge}>Today</Text> : null}
          </View>

          {selectedEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={30} color={Palette.subtle} />
              <Text style={styles.emptyText}>No events scheduled</Text>
            </View>
          ) : (
            // EVENTS is a hardcoded empty stub, so selectedEvents is always []
            // and this branch (and the .map callback below) never runs.
            /* v8 ignore next 13 */
            selectedEvents.map((e) => (
              <View key={e.id} style={styles.eventCard}>
                <View style={[styles.eventAccent, { backgroundColor: e.color }]} />
                <View style={styles.eventBody}>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                  <Text style={styles.eventTime}>{e.time}</Text>
                </View>
                <View style={[styles.eventIcon, { backgroundColor: e.color + '1A' }]}>
                  <Ionicons name="time-outline" size={18} color={e.color} />
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Floating add event */}
        <Pressable
          onPress={() => {
            /* TODO(backend): open the Add Event flow. */
          }}
          android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true }}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

function isTodaySelected(selected: Date): boolean {
  return sameDay(selected, TODAY);
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

  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 },

  monthCard: {
    backgroundColor: Palette.card,
    borderRadius: 24,
    padding: 16,
    marginBottom: 24,
    ...CARD_SHADOW,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontFamily: FontFamily, fontSize: 17, fontWeight: '800', color: Palette.ink },

  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.subtle,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInner: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: Palette.primary,
    shadowColor: Palette.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  dayText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink },
  dayMuted: { color: '#C7C4D6' },
  dayToday: { color: Palette.primary, fontWeight: '800' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '800' },
  eventDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  eventDotPlaceholder: { width: 5, height: 5, marginTop: 3 },

  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eventsTitle: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: Palette.ink },
  todayBadge: {
    fontFamily: FontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: Palette.primary,
    backgroundColor: Tint.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  eventAccent: { width: 5, height: 40, borderRadius: 3, marginRight: 14 },
  eventBody: { flex: 1 },
  eventTitle: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
  eventTime: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 3 },
  eventIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  emptyCard: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: Palette.card,
    borderRadius: 20,
    paddingVertical: 34,
    ...CARD_SHADOW,
  },
  emptyText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.muted },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 62,
    height: 62,
    borderRadius: 21,
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
