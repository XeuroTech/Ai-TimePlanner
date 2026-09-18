import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClockTimeField } from '@/components/ui/clock-time-picker';
import { NumberStepperField } from '@/components/ui/number-stepper-field';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatMinutesTotal } from '@/lib/analytics';
import { MINUTES_PER_DAY } from '@/lib/time';
import { DefaultRoutineKey, RoutineItem } from '@/lib/db/profile-repository';
import { useAuthStore } from '@/store/auth-store';

type IoniconName = keyof typeof Ionicons.glyphMap;
type RoutineColorKey = RoutineItem['colorKey'];

/** New custom items rotate through these so they're visually distinct without asking for a color. */
const ROTATE_COLORS: RoutineColorKey[] = ['primary', 'blue', 'green', 'orange', 'pink'];

const ADD_ICON_CHOICES: IoniconName[] = [
  'flag-outline',
  'walk-outline',
  'laptop-outline',
  'cafe-outline',
  'game-controller-outline',
  'musical-notes-outline',
  'people-outline',
  'call-outline',
  'tv-outline',
  'book-outline',
  'briefcase-outline',
  'restaurant-outline',
];

function makeRoutineId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function DailyRoutineScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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
  // Only wake/sleep are fixed — everything else (defaults included) can be
  // removed, because no two people's routine looks the same.
  const [hiddenDefaults, setHiddenDefaults] = useState<DefaultRoutineKey[]>(
    prefs?.hiddenRoutineDefaults ?? [],
  );
  const [customItems, setCustomItems] = useState<RoutineItem[]>(prefs?.customRoutine ?? []);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const isHidden = (key: DefaultRoutineKey) => hiddenDefaults.includes(key);
  const hideDefault = (key: DefaultRoutineKey) =>
    setHiddenDefaults((list) => (list.includes(key) ? list : [...list, key]));

  const addCustomItem = (item: Omit<RoutineItem, 'id' | 'createdAt' | 'colorKey'>) => {
    setCustomItems((list) => [
      ...list,
      {
        ...item,
        id: makeRoutineId(),
        createdAt: Date.now(),
        colorKey: ROTATE_COLORS[list.length % ROTATE_COLORS.length],
      },
    ]);
  };
  const removeCustomItem = (id: string) => setCustomItems((list) => list.filter((i) => i.id !== id));
  const updateCustomMinutes = (id: string, minutes: number) =>
    setCustomItems((list) => list.map((i) => (i.id === id ? { ...i, minutes } : i)));

  // Awake minutes minus everything already committed — a negative number means
  // the routine doesn't physically fit in the day. Removed defaults don't count.
  const awakeMinutes = sleep > wake ? sleep - wake : MINUTES_PER_DAY - wake + sleep;
  const customMinutes = customItems.reduce((sum, i) => sum + i.minutes, 0);
  const committedMinutes =
    (isHidden('study') ? 0 : studyHours * 60) +
    (isHidden('work') ? 0 : workHours * 60) +
    (isHidden('exercise') ? 0 : exercise) +
    (isHidden('meals') ? 0 : meals * 30) +
    customMinutes;
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
        customRoutine: customItems,
        hiddenRoutineDefaults: hiddenDefaults,
      },
    });
    setSaving(false);
    toast.success(t('dailyRoutine.savedToast'));
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
          <Text style={styles.headerTitle}>{t('dailyRoutine.title')}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => setShowAdd(true)}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
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

          <Text style={styles.title}>{t('dailyRoutine.heroTitle')}</Text>
          <Text style={styles.subtitle}>
            {t('dailyRoutine.heroSubtitle')}
          </Text>

          {/* Wake / Sleep — real circular clock pickers */}
          <TimeQuestion
            icon="sunny-outline"
            color={Palette.orange}
            tint={Tint.orange}
            label={t('dailyRoutine.wakeUpTimeLabel')}
            value={wake}
            onChange={setWake}
          />
          <TimeQuestion
            icon="moon-outline"
            color={Palette.blue}
            tint={Tint.blue}
            label={t('dailyRoutine.sleepTimeLabel')}
            value={sleep}
            onChange={setSleep}
          />

          {/* Steppers — tap the value to type an exact number, or nudge with +/-.
             Every one of these is removable; only Wake/Sleep above are fixed. */}
          {!isHidden('study') ? (
            <StepperQuestion
              icon="book-outline"
              color={Palette.primary}
              tint={Tint.primary}
              label={t('dailyRoutine.studyHoursLabel')}
              value={studyHours}
              onChange={setStudyHours}
              min={0}
              max={12}
              unit="h"
              onRemove={() => hideDefault('study')}
            />
          ) : null}
          {!isHidden('work') ? (
            <StepperQuestion
              icon="briefcase-outline"
              color={Palette.secondary}
              tint={Tint.primary}
              label={t('dailyRoutine.workHoursLabel')}
              value={workHours}
              onChange={setWorkHours}
              min={0}
              max={12}
              unit="h"
              onRemove={() => hideDefault('work')}
            />
          ) : null}
          {!isHidden('exercise') ? (
            <StepperQuestion
              icon="barbell-outline"
              color={Palette.pink}
              tint={Tint.pink}
              label={t('dailyRoutine.exerciseLabel')}
              value={exercise}
              onChange={setExercise}
              min={0}
              max={180}
              step={15}
              unit="min"
              onRemove={() => hideDefault('exercise')}
            />
          ) : null}
          {!isHidden('meals') ? (
            <StepperQuestion
              icon="restaurant-outline"
              color={Palette.green}
              tint={Tint.green}
              label={t('dailyRoutine.mealsLabel')}
              value={meals}
              onChange={setMeals}
              min={1}
              max={6}
              onRemove={() => hideDefault('meals')}
            />
          ) : null}

          {/* User-added items — always shown in the order they were added. */}
          {customItems.map((item) => {
            const color = (Palette as unknown as Record<string, string>)[item.colorKey] ?? Palette.primary;
            const tint = (Tint as unknown as Record<string, string>)[item.colorKey] ?? Tint.primary;
            return (
              <StepperQuestion
                key={item.id}
                icon={item.icon as IoniconName}
                color={color}
                tint={tint}
                label={item.label}
                value={item.minutes}
                onChange={(v) => updateCustomMinutes(item.id, v)}
                min={0}
                max={720}
                step={5}
                unit="min"
                onRemove={() => removeCustomItem(item.id)}
              />
            );
          })}

          {/* Live balance — makes an over-committed routine obvious before saving. */}
          <View style={[styles.balance, freeMinutes < 0 && styles.balanceOver]}>
            <Ionicons
              name={freeMinutes < 0 ? 'warning-outline' : 'checkmark-circle-outline'}
              size={18}
              color={freeMinutes < 0 ? '#E5484D' : Palette.green}
            />
            <Text style={styles.balanceText}>
              {freeMinutes < 0
                ? t('dailyRoutine.overBooked', { over: formatMinutesTotal(-freeMinutes), total: formatMinutesTotal(awakeMinutes) })
                : t('dailyRoutine.freeOutOf', { free: formatMinutesTotal(freeMinutes), total: formatMinutesTotal(awakeMinutes) })}
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
            <Text style={styles.continueText}>{saving ? t('dailyRoutine.saving') : t('common.continue')}</Text>
          </Pressable>
        </View>

        {/* Inline time picker overlay list is rendered within each TimeQuestion. */}
      </SafeAreaView>

      <AddItemSheet visible={showAdd} onClose={() => setShowAdd(false)} onAdd={addCustomItem} />
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
  onRemove,
  children,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  label: string;
  right: ReactNode;
  /** Shows a trash button after `right`. Omit for the two fixed rows (Wake/Sleep). */
  onRemove?: () => void;
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
        {onRemove ? (
          <Pressable
            hitSlop={8}
            onPress={onRemove}
            style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
            <Ionicons name="trash-outline" size={16} color="#E5484D" />
          </Pressable>
        ) : null}
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
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  onRemove,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onRemove?: () => void;
}) {
  return (
    <QuestionShell
      icon={icon}
      color={color}
      tint={tint}
      label={label}
      onRemove={onRemove}
      right={
        <NumberStepperField
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          step={step}
          unit={unit}
          title={label}
        />
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Add item sheet                                                            */
/* -------------------------------------------------------------------------- */

function AddItemSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: { label: string; icon: IoniconName; minutes: number }) => void;
}) {
  const { t } = useTranslation();
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<IoniconName>('flag-outline');
  const [minutes, setMinutes] = useState(30);

  const reset = () => {
    setLabel('');
    setIcon('flag-outline');
    setMinutes(30);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd({ label: trimmed, icon, minutes });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.sheetBackdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('dailyRoutine.addSheetTitle')}</Text>
              <Pressable hitSlop={10} onPress={close}>
                <Ionicons name="close" size={22} color={Palette.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>{t('common.name')}</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  value={label}
                  onChangeText={setLabel}
                  placeholder={t('dailyRoutine.namePlaceholder')}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>

              <Text style={styles.fieldLabel}>{t('dailyRoutine.iconLabel')}</Text>
              <View style={styles.iconGrid}>
                {ADD_ICON_CHOICES.map((ic) => {
                  const active = ic === icon;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => setIcon(ic)}
                      style={[styles.iconChip, active && { backgroundColor: Palette.primary, borderColor: Palette.primary }]}>
                      <Ionicons name={ic} size={20} color={active ? '#FFFFFF' : Palette.muted} />
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.durationRow}>
                <Text style={styles.stepperLabel}>{t('dailyRoutine.durationLabel')}</Text>
                <NumberStepperField value={minutes} onChange={setMinutes} min={0} max={720} step={5} unit="min" title={t('dailyRoutine.durationLabel')} />
              </View>
            </ScrollView>

            <Pressable
              onPress={save}
              disabled={!label.trim()}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              style={({ pressed }) => [
                styles.continueBtn,
                styles.sheetSaveBtn,
                !label.trim() && styles.sheetSaveDisabled,
                pressed && !!label.trim() && styles.continuePressed,
              ]}>
              <Text style={styles.continueText}>{t('dailyRoutine.addItemButton')}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Palette.primary,
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
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FDE7E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

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

  /* Add-item sheet */
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(16,14,36,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Palette.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Palette.hairline,
    marginBottom: 12,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { fontFamily: FontFamily, fontSize: 20, fontWeight: '800', color: Palette.ink },
  sheetSaveBtn: { marginTop: 16 },
  sheetSaveDisabled: { opacity: 0.5 },

  fieldLabel: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted, marginTop: 16, marginBottom: 8 },
  inputWrap: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
  },
  input: { fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  stepperLabel: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
  });
}
