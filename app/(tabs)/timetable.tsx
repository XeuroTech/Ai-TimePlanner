import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { getAddEntryConfig } from '@/constants/categories';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatTime } from '@/lib/time';
import { useProfile } from '@/store/auth-store';
import { type PlanClass, useMyClasses, usePlannerStore } from '@/store/planner-store';

/* -------------------------------------------------------------------------- */
/* Grid config                                                                */
/* -------------------------------------------------------------------------- */

const SIDE_PAD = 10;
const GUTTER = 36; // time-label column width
const HOUR_HEIGHT = 62;
const START_HOUR = 8; // 8 AM
const END_HOUR = 20; // 8 PM
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* day: 0 = Monday ... 6 = Sunday. start/end are 24h decimal hours.           */
/* TODO(backend): load real events per date from your API instead of this     */
/* recurring weekly template.                                                 */
/* -------------------------------------------------------------------------- */

type TTEvent = {
  id: string;
  day: number;
  start: number;
  end: number;
  subject: string;
  color: string;
  tint: string;
};

/** Soft tint for an arbitrary accent color. */
function tintFor(color: string): string {
  return color + '22';
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                               */
/* -------------------------------------------------------------------------- */

function mondayOf(weekOffset: number, base = new Date()): Date {
  const d = new Date(base);
  const diffToMon = (d.getDay() + 6) % 7; // days since Monday (Mon=0)
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diffToMon + weekOffset * 7);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatHour(h: number): string {
  const hour = Math.floor(h);
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function formatRange(days: Date[]): string {
  const first = days[0];
  const last = days[6];
  const year = last.getFullYear();
  const lastMonth = last.toLocaleDateString('en-US', { month: 'long' });
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${lastMonth} ${year}`;
  }
  const firstMonth = first.toLocaleDateString('en-US', { month: 'short' });
  const lastShort = last.toLocaleDateString('en-US', { month: 'short' });
  return `${first.getDate()} ${firstMonth} – ${last.getDate()} ${lastShort} ${year}`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function TimetableScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cfg = getAddEntryConfig(useProfile()?.category);
  const removeClass = usePlannerStore((s) => s.removeClass);

  const classes = useMyClasses();
  const selectedClass = selectedId ? classes.find((c) => c.id === selectedId) ?? null : null;
  // Recurring weekly template — the same classes show every week.
  const events: TTEvent[] = useMemo(
    () =>
      classes.map((c) => ({
        id: c.id,
        day: c.day,
        start: c.start / 60,
        end: c.end / 60,
        subject: c.subject,
        color: c.color,
        tint: tintFor(c.color),
      })),
    [classes],
  );

  const dayColWidth = (width - SIDE_PAD * 2 - GUTTER) / 7;
  const gridHeight = (HOURS.length - 1) * HOUR_HEIGHT;
  const tabBarSpace = 60 + (insets.bottom > 0 ? insets.bottom : 12);

  const days = useMemo(() => {
    const monday = mondayOf(weekOffset);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);

  const isCurrentWeek = weekOffset === 0;
  const todayIndex = isCurrentWeek ? (new Date().getDay() + 6) % 7 : -1;

  // Current-time indicator position (only while viewing the current week).
  const now = new Date();
  const nowDecimal = now.getHours() + now.getMinutes() / 60;
  const showNow = isCurrentWeek && nowDecimal >= START_HOUR && nowDecimal <= END_HOUR;
  const nowTop = (nowDecimal - START_HOUR) * HOUR_HEIGHT;

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={{ paddingTop: insets.top + 8 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('tabs.timetable.title')}</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/calendar')}
              hitSlop={6}
              style={({ pressed }) => [styles.calBtn, pressed && styles.pressed]}>
              <Ionicons name="calendar-outline" size={22} color={Palette.primary} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/add-class')}
              android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true }}
              style={({ pressed }) => [styles.addBtn, pressed && styles.addPressed]}>
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Week selector */}
        <View style={styles.weekBar}>
          <Pressable
            hitSlop={10}
            onPress={() => setWeekOffset((w) => w - 1)}
            style={({ pressed }) => [styles.weekArrow, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={18} color={Palette.primary} />
          </Pressable>
          <Text style={styles.weekText}>{formatRange(days)}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => setWeekOffset((w) => w + 1)}
            style={({ pressed }) => [styles.weekArrow, pressed && styles.pressed]}>
            <Ionicons name="chevron-forward" size={18} color={Palette.primary} />
          </Pressable>
        </View>

        {/* Day header row */}
        <View style={styles.dayHeaderRow}>
          <View style={{ width: GUTTER }} />
          {days.map((d, i) => {
            const active = i === todayIndex;
            return (
              <View key={i} style={[styles.dayCell, { width: dayColWidth }]}>
                <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
                  {DAY_LABELS[i]}
                </Text>
                <View style={[styles.datePill, active && styles.datePillActive]}>
                  <Text style={[styles.dateText, active && styles.dateTextActive]}>
                    {d.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarSpace + 20 }}>
        <View style={[styles.grid, { height: gridHeight, marginHorizontal: SIDE_PAD }]}>
          {/* current day column highlight */}
          {todayIndex >= 0 ? (
            <View
              style={[
                styles.todayColumn,
                { left: GUTTER + todayIndex * dayColWidth, width: dayColWidth, height: gridHeight },
              ]}
            />
          ) : null}

          {/* hour lines + labels */}
          {HOURS.map((h, i) => (
            <View key={h} style={[styles.hourRow, { top: i * HOUR_HEIGHT }]}>
              <Text style={styles.hourLabel}>{formatHour(h)}</Text>
              <View style={[styles.hourLine, { left: GUTTER }]} />
            </View>
          ))}

          {/* event blocks */}
          {events.map((e) => (
            <Pressable
              key={e.id}
              onPress={() => setSelectedId(e.id)}
              style={[
                styles.event,
                {
                  backgroundColor: e.tint,
                  left: GUTTER + e.day * dayColWidth + 3,
                  width: dayColWidth - 6,
                  top: (e.start - START_HOUR) * HOUR_HEIGHT + 2,
                  height: (e.end - e.start) * HOUR_HEIGHT - 4,
                  borderLeftColor: e.color,
                },
              ]}>
              <Text style={[styles.eventTitle, { color: e.color }]} numberOfLines={2}>
                {e.subject}
              </Text>
              <Text style={[styles.eventTime, { color: e.color }]} numberOfLines={1}>
                {formatHour(e.start)}
              </Text>
            </Pressable>
          ))}

          {/* current-time line */}
          {showNow ? (
            <View style={[styles.nowLine, { top: nowTop, left: GUTTER }]}>
              <View style={styles.nowDot} />
              <View style={styles.nowBar} />
            </View>
          ) : null}

          {/* empty state overlay */}
          {events.length === 0 ? (
            <View style={styles.emptyOverlay} pointerEvents="box-none">
              <EmptyState
                compact
                icon="calendar-outline"
                title={t('tabs.timetable.emptyTitle')}
                message={t('tabs.timetable.emptyMessage')}
                ctaLabel={cfg.title}
                onPress={() => router.push('/add-class')}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ClassDetailDialog
        visible={!!selectedClass}
        item={selectedClass}
        onClose={() => setSelectedId(null)}
        onEdit={(item) => {
          setSelectedId(null);
          router.push({ pathname: '/add-class', params: { classId: item.id } });
        }}
        onDelete={(item) => {
          Alert.alert(t('tabs.timetable.deleteClassTitle'), t('tabs.timetable.deleteClassMessage', { subject: item.subject }), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: () => {
                setSelectedId(null);
                removeClass(item.id);
              },
            },
          ]);
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Class detail dialog                                                       */
/* -------------------------------------------------------------------------- */

function DetailRow({
  icon,
  label,
  value,
  styles,
  Palette,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  Palette: AppPalette;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={16} color={Palette.subtle} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ClassDetailDialog({
  visible,
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  visible: boolean;
  item: PlanClass | null;
  onClose: () => void;
  onEdit: (item: PlanClass) => void;
  onDelete: (item: PlanClass) => void;
}) {
  const { t } = useTranslation();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const cfg = getAddEntryConfig(useProfile()?.category);
  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.blurBackdrop} onPress={onClose}>
        <BlurView
          intensity={40}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      </Pressable>
      <View pointerEvents="box-none" style={styles.dialogWrap}>
        <View style={styles.dialogCard}>
          <View style={styles.dialogHeader}>
            <View style={[styles.dialogDot, { backgroundColor: item.color }]} />
            <Text style={styles.dialogTitle} numberOfLines={2}>
              {item.subject}
            </Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={22} color={Palette.muted} />
            </Pressable>
          </View>

          <View style={styles.detailCard}>
            <DetailRow icon="calendar-outline" label={t('tabs.timetable.dayLabel')} value={DAY_LABELS[item.day] ?? '—'} styles={styles} Palette={Palette} />
            <DetailRow
              icon="time-outline"
              label={t('tabs.timetable.timeLabel')}
              value={`${formatTime(item.start)} – ${formatTime(item.end)}`}
              styles={styles}
              Palette={Palette}
            />
            <DetailRow icon={cfg.person.icon} label={cfg.person.label} value={item.teacher || '—'} styles={styles} Palette={Palette} />
            <DetailRow icon={cfg.place.icon} label={cfg.place.label} value={item.room || '—'} styles={styles} Palette={Palette} />
            <DetailRow icon="notifications-outline" label={t('tabs.timetable.reminderLabel')} value={item.reminder || '—'} styles={styles} Palette={Palette} />
            <DetailRow icon="repeat-outline" label={t('tabs.timetable.repeatLabel')} value={item.repeat || '—'} styles={styles} Palette={Palette} />
          </View>

          <View style={styles.dialogActions}>
            <Pressable onPress={() => onDelete(item)} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={18} color="#E5484D" />
            </Pressable>
            <Pressable
              onPress={() => onEdit(item)}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              style={({ pressed }) => [styles.editBtn, pressed && styles.editPressed]}>
              <Ionicons name="create-outline" size={18} color="#FFFFFF" />
              <Text style={styles.editText}>{t('common.edit')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  pressed: { opacity: 0.5 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  title: { fontFamily: FontFamily, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: Palette.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  addPressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.95 }] },

  weekBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    backgroundColor: Palette.card,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 16,
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  weekArrow: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Tint.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },

  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SIDE_PAD,
    marginBottom: 6,
  },
  dayCell: { alignItems: 'center', gap: 6 },
  dayLabel: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.subtle },
  dayLabelActive: { color: Palette.primary },
  datePill: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePillActive: { backgroundColor: Palette.primary },
  dateText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink },
  dateTextActive: { color: '#FFFFFF' },

  grid: { position: 'relative', marginTop: 6 },
  emptyOverlay: { position: 'absolute', top: 70, left: GUTTER, right: 0, alignItems: 'center' },
  todayColumn: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(108,77,255,0.05)',
    borderRadius: 12,
  },
  hourRow: { position: 'absolute', left: 0, right: 0, height: 1, flexDirection: 'row', alignItems: 'center' },
  hourLabel: {
    width: GUTTER,
    marginTop: -1,
    fontFamily: FontFamily,
    fontSize: 10,
    fontWeight: '600',
    color: Palette.subtle,
    textAlign: 'left',
  },
  hourLine: { position: 'absolute', right: 0, height: 1, backgroundColor: Palette.hairline },

  event: {
    position: 'absolute',
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  eventTitle: { fontFamily: FontFamily, fontSize: 11, fontWeight: '800', letterSpacing: -0.2 },
  eventTime: { fontFamily: FontFamily, fontSize: 9, fontWeight: '600', marginTop: 2, opacity: 0.8 },

  nowLine: { position: 'absolute', right: 0, height: 2, flexDirection: 'row', alignItems: 'center' },
  nowDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E5484D',
    marginLeft: -4,
  },
  nowBar: { flex: 1, height: 2, backgroundColor: '#E5484D', borderRadius: 1 },

  /* class detail dialog */
  blurBackdrop: { ...StyleSheet.absoluteFillObject },
  dialogWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Palette.card,
    borderRadius: 26,
    padding: 22,
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dialogDot: { width: 12, height: 12, borderRadius: 6 },
  dialogTitle: { flex: 1, fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },

  detailCard: { backgroundColor: Palette.bg, borderRadius: 18, paddingHorizontal: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  detailIcon: { width: 26, alignItems: 'flex-start' },
  detailLabel: { width: 84, fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: Palette.muted },
  detailValue: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink, textAlign: 'right' },

  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  deleteBtn: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#FDE7E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPressed: { backgroundColor: Palette.primaryDark },
  editText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  });
}
