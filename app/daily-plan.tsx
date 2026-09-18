import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClockTimeField } from '@/components/ui/clock-time-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatTime, toDateKey } from '@/lib/time';
import { useMyPlans, usePlannerStore } from '@/store/planner-store';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateNext = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));

type IoniconName = keyof typeof Ionicons.glyphMap;

const DEFAULT_PLAN_ICON: IoniconName = 'today-outline';

/** A small, relevant set — daily-plan items span many kinds of activities. */
const PLAN_ICON_CHOICES: IoniconName[] = [
  'today-outline',
  'briefcase-outline',
  'book-outline',
  'school-outline',
  'fitness-outline',
  'walk-outline',
  'restaurant-outline',
  'cafe-outline',
  'medkit-outline',
  'heart-outline',
  'people-outline',
  'call-outline',
  'chatbubble-outline',
  'mail-outline',
  'cart-outline',
  'cash-outline',
  'home-outline',
  'car-outline',
  'airplane-outline',
  'game-controller-outline',
  'musical-notes-outline',
  'film-outline',
  'sunny-outline',
  'moon-outline',
  'flag-outline',
  'star-outline',
];

function prettyDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Parses a `YYYY-MM-DD` key back into a local Date (avoids the UTC shift `new Date(string)` causes). */
function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export default function DailyPlanScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // Opened from Calendar with a specific date, or from the Home/tabs shortcut for today.
  const { date } = useLocalSearchParams<{ date?: string }>();
  const dateKey = date ?? toDateKey();
  const isToday = dateKey === toDateKey();

  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

  const plans = useMyPlans(dateKey);
  const addPlan = usePlannerStore((s) => s.addPlan);
  const togglePlan = usePlannerStore((s) => s.togglePlan);
  const removePlan = usePlannerStore((s) => s.removePlan);

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [time, setTime] = useState(9 * 60);
  const [icon, setIcon] = useState<IoniconName>(DEFAULT_PLAN_ICON);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...plans].sort((a, b) => Number(a.done) - Number(b.done) || a.time - b.time),
    [plans],
  );
  const doneCount = plans.filter((p) => p.done).length;

  const onAdd = () => {
    if (!title.trim()) {
      setError(t('dailyPlan.emptyTitleError'));
      return;
    }
    setError(null);
    animateNext();
    addPlan({ date: dateKey, title: title.trim(), time, note: note.trim() || undefined, icon });
    setTitle('');
    setNote('');
    setIcon(DEFAULT_PLAN_ICON);
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
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{isToday ? t('dailyPlan.titleToday') : t('dailyPlan.titleOther')}</Text>
            <Text style={styles.headerSub}>{prettyDate(fromDateKey(dateKey))}</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* Add form */}
            <View style={styles.formCard}>
              <View style={styles.inputWrap}>
                <Ionicons name="create-outline" size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t('dailyPlan.titlePlaceholder')}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={onAdd}
                />
              </View>

              {/* Real circular clock picker */}
              <View style={styles.clockField}>
                <ClockTimeField
                  label={t('dailyPlan.timeLabel')}
                  title={t('dailyPlan.timeTitle')}
                  value={time}
                  onChange={setTime}
                  minuteStep={5}
                  tone="bg"
                />
              </View>

              <View style={[styles.inputWrap, styles.noteWrap]}>
                <Ionicons name="document-text-outline" size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('dailyPlan.notePlaceholder')}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>

              <Text style={styles.iconLabel}>{t('dailyPlan.iconLabel')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.iconRow}>
                {PLAN_ICON_CHOICES.map((ic) => {
                  const active = ic === icon;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setIcon(ic)}
                      style={[styles.iconChip, active && styles.iconChipActive]}>
                      <Ionicons name={ic} size={20} color={active ? '#FFFFFF' : Palette.muted} />
                    </Pressable>
                  );
                })}
              </ScrollView>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                onPress={onAdd}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                style={({ pressed }) => [styles.addBtn, pressed && styles.addPressed]}>
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.addText}>{t('dailyPlan.addButton')}</Text>
              </Pressable>
            </View>

            {/* Progress summary */}
            {plans.length > 0 ? (
              <Text style={styles.summary}>
                {t('dailyPlan.summary', { done: doneCount, total: plans.length })}
              </Text>
            ) : null}

            {/* Plan list */}
            {ordered.length === 0 ? (
              <View style={styles.emptyWrap}>
                <EmptyState
                  compact
                  icon="today-outline"
                  title={t('dailyPlan.emptyTitle')}
                  message={t('dailyPlan.emptyMessage')}
                />
              </View>
            ) : (
              ordered.map((p) => (
                <View key={p.id} style={styles.planRow}>
                  <Pressable
                    onPress={() => {
                      animateNext();
                      togglePlan(p.id);
                    }}
                    hitSlop={8}
                    style={[styles.checkbox, p.done && styles.checkboxDone]}>
                    {p.done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </Pressable>

                  <View style={styles.planBody}>
                    <Text style={[styles.planTitle, p.done && styles.planTitleDone]} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={13} color={Palette.subtle} />
                      <Text style={styles.metaText}>{formatTime(p.time)}</Text>
                      {p.note ? (
                        <>
                          <Text style={styles.metaDivider}>·</Text>
                          <Text style={styles.metaText} numberOfLines={1}>
                            {p.note}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      animateNext();
                      removePlan(p.id);
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
                    <Ionicons name="trash-outline" size={18} color={Palette.subtle} />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
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

  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  formCard: {
    backgroundColor: Palette.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
    ...CARD_SHADOW,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.bg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    paddingHorizontal: 14,
    height: 54,
    marginBottom: 12,
  },
  noteWrap: { marginBottom: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink, height: '100%' },

  /* ClockTimeField brings its own 20px bottom margin — trim it back to 12. */
  clockField: { marginBottom: -8 },

  iconLabel: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted, marginBottom: 8 },
  iconRow: { gap: 10, paddingVertical: 2, paddingBottom: 4 },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.bg,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },

  error: { fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: '#E5484D', marginBottom: 10 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 16,
    backgroundColor: Palette.primary,
  },
  addPressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
  addText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  summary: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted, marginBottom: 12, marginLeft: 4 },

  emptyWrap: { paddingTop: 20 },

  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
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
  planBody: { flex: 1, marginRight: 10 },
  planTitle: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
  planTitleDone: { color: Palette.subtle, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  metaText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, flexShrink: 1 },
  metaDivider: { color: Palette.subtle, fontSize: 13 },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: Palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  });
}
