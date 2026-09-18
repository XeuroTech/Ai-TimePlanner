import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
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

import { ProgressRing } from '@/components/progress-ring';
import { ColorPickerField } from '@/components/ui/color-picker-field';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberStepperField } from '@/components/ui/number-stepper-field';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePremium } from '@/hooks/use-premium';
import {
  type Habit,
  type HabitColorKey,
  type HabitKind,
  useHabitProgress,
  useHabitsStore,
} from '@/store/habits-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateNext = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));

/** Free tier cap — matches the "Up to 3" line on the premium screen. */
const FREE_HABIT_LIMIT = 3;

/* -------------------------------------------------------------------------- */
/* Editor presets                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `flag-outline` sits first as the generic "any habit" icon, pre-selected in
 * `BLANK_DRAFT` — a user whose habit doesn't match one of the specific icons
 * below always has a sensible one already chosen instead of none.
 */
const ICON_CHOICES: IoniconName[] = [
  'flag-outline',
  'water-outline',
  'barbell-outline',
  'book-outline',
  'moon-outline',
  'walk-outline',
  'leaf-outline',
  'musical-notes-outline',
  'heart-outline',
  'flower-outline',
  'bed-outline',
  'nutrition-outline',
  'medkit-outline',
  'create-outline',
  'sunny-outline',
  'body-outline',
  'cash-outline',
  'school-outline',
  'phone-portrait-outline',
  'happy-outline',
  'fitness-outline',
  'bicycle-outline',
  'football-outline',
  'basketball-outline',
  'trophy-outline',
  'game-controller-outline',
  'tv-outline',
  'headset-outline',
  'camera-outline',
  'brush-outline',
  'color-palette-outline',
  'code-slash-outline',
  'laptop-outline',
  'people-outline',
  'call-outline',
  'chatbubble-outline',
  'mail-outline',
  'gift-outline',
  'paw-outline',
  'airplane-outline',
];

const COLOR_CHOICES: HabitColorKey[] = ['primary', 'blue', 'green', 'orange', 'pink'];

type TFn = ReturnType<typeof useTranslation>['t'];

/** Starting points so a new habit is one tap away from being useful. */
type HabitTemplate = { name: string; icon: IoniconName; colorKey: HabitColorKey; kind: HabitKind; unit: string; step: number; target: number };

function getTemplates(t: TFn): HabitTemplate[] {
  return [
    { name: t('habits.templates.drinkWater'), icon: 'water-outline', colorKey: 'blue', kind: 'counter', unit: 'glasses', step: 1, target: 8 },
    { name: t('habits.templates.exercise'), icon: 'barbell-outline', colorKey: 'pink', kind: 'counter', unit: 'min', step: 15, target: 30 },
    { name: t('habits.templates.read'), icon: 'book-outline', colorKey: 'primary', kind: 'counter', unit: 'pages', step: 5, target: 20 },
    { name: t('habits.templates.sleepEarly'), icon: 'moon-outline', colorKey: 'orange', kind: 'checkbox', unit: '', step: 1, target: 1 },
    { name: t('habits.templates.meditate'), icon: 'flower-outline', colorKey: 'green', kind: 'counter', unit: 'min', step: 5, target: 10 },
    { name: t('habits.templates.walk'), icon: 'walk-outline', colorKey: 'blue', kind: 'counter', unit: 'steps', step: 500, target: 5000 },
    { name: t('habits.templates.journal'), icon: 'create-outline', colorKey: 'primary', kind: 'checkbox', unit: '', step: 1, target: 1 },
    { name: t('habits.templates.takeVitamins'), icon: 'medkit-outline', colorKey: 'pink', kind: 'checkbox', unit: '', step: 1, target: 1 },
  ];
}

type Draft = {
  name: string;
  icon: IoniconName;
  colorKey: HabitColorKey;
  customColor?: string;
  kind: HabitKind;
  unit: string;
  step: number;
  target: number;
};

const BLANK_DRAFT: Draft = {
  name: '',
  icon: 'flag-outline',
  colorKey: 'primary',
  kind: 'checkbox',
  unit: '',
  step: 1,
  target: 1,
};

function progressText(t: TFn, current: number, target: number, unit: string): string {
  if (!unit) return current >= target ? t('habits.completed') : t('habits.notDone');
  return t('habits.progressWithUnit', { current, target, unit });
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function HabitsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const { isPremium } = usePremium();

  const rows = useHabitProgress();
  const addHabit = useHabitsStore((s) => s.addHabit);
  const updateHabit = useHabitsStore((s) => s.updateHabit);
  const removeHabit = useHabitsStore((s) => s.removeHabit);
  const bumpHabit = useHabitsStore((s) => s.bumpHabit);
  const decrementHabit = useHabitsStore((s) => s.decrementHabit);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);

  const doneCount = rows.filter((r) => r.done).length;
  const completion = rows.length ? rows.reduce((sum, r) => sum + r.pct, 0) / rows.length : 0;
  const bestStreak = rows.reduce((max, r) => Math.max(max, r.streak), 0);

  const atLimit = !isPremium && rows.length >= FREE_HABIT_LIMIT;

  /** Resolves a stored palette key (or a custom hex) into render-ready colors. */
  const look = (key: HabitColorKey, customColor?: string) => {
    if (key === 'custom' && customColor) return { color: customColor, tint: `${customColor}22` };
    return {
      color: (Palette as unknown as Record<string, string>)[key] ?? Palette.primary,
      tint: (Tint as unknown as Record<string, string>)[key] ?? Tint.primary,
    };
  };

  const openCreate = () => {
    if (atLimit) {
      toast.show(t('habits.limitReachedToast', { limit: FREE_HABIT_LIMIT }), 'error');
      router.push('/premium');
      return;
    }
    setEditing(null);
    setDraft(BLANK_DRAFT);
    setEditorOpen(true);
  };

  const openEdit = (habit: Habit) => {
    setEditing(habit);
    setDraft({
      name: habit.name,
      icon: habit.icon as IoniconName,
      colorKey: habit.colorKey,
      customColor: habit.customColor,
      kind: habit.kind,
      unit: habit.unit,
      step: habit.step,
      target: habit.target,
    });
    setEditorOpen(true);
  };

  const onSave = () => {
    const name = draft.name.trim();
    if (!name) {
      toast.show(t('habits.nameRequiredToast'), 'error');
      return;
    }
    // A checkbox habit is always a simple done/not-done tick.
    const isCounter = draft.kind === 'counter';
    const target = isCounter ? Math.max(1, draft.target) : 1;
    const step = isCounter ? Math.max(1, draft.step) : 1;
    const payload = {
      name,
      icon: draft.icon,
      colorKey: draft.colorKey,
      customColor: draft.colorKey === 'custom' ? draft.customColor : undefined,
      kind: draft.kind,
      unit: isCounter ? draft.unit.trim() : '',
      step,
      target,
    };

    animateNext();
    if (editing) {
      updateHabit(editing.id, payload);
      toast.success(t('habits.updatedToast'));
    } else {
      addHabit(payload);
      toast.success(t('habits.addedToast'));
    }
    setEditorOpen(false);
  };

  const onDelete = () => {
    if (!editing) return;
    animateNext();
    removeHabit(editing.id);
    setEditorOpen(false);
    toast.success(t('habits.removedToast'));
  };

  const confirmDelete = (habit: Habit) => {
    Alert.alert(t('habits.deleteTitle'), t('habits.deleteMessage', { name: habit.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          animateNext();
          removeHabit(habit.id);
        },
      },
    ]);
  };

  const applyTemplate = (tmpl: HabitTemplate) => {
    setDraft({ ...tmpl });
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
          <Text style={styles.headerTitle}>{t('habits.title')}</Text>
          <Pressable
            hitSlop={10}
            onPress={openCreate}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {rows.length === 0 ? (
            <EmptyState
              icon="leaf-outline"
              title={t('habits.emptyTitle')}
              message={t('habits.emptyMessage')}
              ctaLabel={t('habits.emptyCta')}
              onPress={openCreate}
            />
          ) : (
            <>
              {/* Today's completion hero */}
              <View style={styles.hero}>
                <View pointerEvents="none" style={styles.heroBlobTop} />
                <View pointerEvents="none" style={styles.heroBlobBottom} />
                <View style={styles.heroText}>
                  <Text style={styles.heroLabel}>{t('habits.todaysCompletion')}</Text>
                  <Text style={styles.heroBig}>
                    {doneCount}
                    <Text style={styles.heroBigSmall}> / {rows.length}</Text>
                  </Text>
                  <View style={styles.streakChip}>
                    <Ionicons name="flame" size={14} color="#FFFFFF" />
                    <Text style={styles.streakChipText}>{t('tabs.home.dayStreak', { count: bestStreak })}</Text>
                  </View>
                </View>
                <ProgressRing
                  size={104}
                  thickness={12}
                  progress={completion}
                  color="#FFFFFF"
                  trackColor="rgba(255,255,255,0.28)"
                  holeColor={Palette.primary}>
                  <Text style={styles.ringPct}>{Math.round(completion * 100)}%</Text>
                </ProgressRing>
              </View>

              <Text style={styles.sectionLabel}>{t('habits.yourHabits')}</Text>
              {rows.map(({ habit, current, target, done, pct, streak }) => {
                const l = look(habit.colorKey, habit.customColor);
                return (
                  <Pressable
                    key={habit.id}
                    onPress={() => {
                      animateNext();
                      bumpHabit(habit.id);
                    }}
                    onLongPress={() => openEdit(habit)}
                    delayLongPress={300}
                    android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                    style={({ pressed }) => [styles.habitCard, pressed && styles.habitPressed]}>
                    <ProgressRing
                      size={56}
                      thickness={5}
                      progress={pct}
                      color={l.color}
                      trackColor={l.tint}>
                      <Ionicons name={habit.icon as IoniconName} size={22} color={l.color} />
                    </ProgressRing>

                    <View style={styles.habitBody}>
                      <Text style={styles.habitName} numberOfLines={1}>
                        {habit.name}
                      </Text>
                      <View style={styles.habitMeta}>
                        <Text style={styles.habitProgress}>
                          {progressText(t, current, target, habit.unit)}
                        </Text>
                        <Text style={styles.metaDot}>·</Text>
                        <Ionicons name="flame" size={13} color={Palette.orange} />
                        <Text style={styles.habitStreak}>{streak}</Text>
                      </View>
                    </View>

                    <View style={styles.habitActions}>
                      {/* Checkbox habits toggle on the main tap; the minus is only
                         useful mid-way through a counter, not once it's done —
                         at that point the main circle itself resets it. */}
                      {habit.kind === 'counter' && current > 0 && !done ? (
                        <Pressable
                          onPress={() => {
                            animateNext();
                            decrementHabit(habit.id);
                          }}
                          hitSlop={8}
                          style={({ pressed }) => [styles.minusBtn, pressed && styles.pressed]}>
                          <Ionicons name="remove" size={16} color={Palette.subtle} />
                        </Pressable>
                      ) : null}
                      <View style={[styles.habitAction, done && { backgroundColor: l.color, borderColor: l.color }]}>
                        <Ionicons name={done ? 'checkmark' : 'add'} size={20} color={done ? '#FFFFFF' : l.color} />
                      </View>
                      <Pressable
                        onPress={() => confirmDelete(habit)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.deleteRowBtn, pressed && styles.pressed]}>
                        <Ionicons name="trash-outline" size={15} color={Palette.subtle} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.hint}>{t('habits.hint')}</Text>

              {atLimit ? (
                <Pressable
                  onPress={() => router.push('/premium')}
                  style={({ pressed }) => [styles.upsell, pressed && styles.pressed]}>
                  <Ionicons name="sparkles" size={16} color={Palette.primary} />
                  <Text style={styles.upsellText}>
                    {t('habits.upsellText', { limit: FREE_HABIT_LIMIT })}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <HabitEditor
        visible={editorOpen}
        draft={draft}
        setDraft={setDraft}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSave={onSave}
        onDelete={onDelete}
        onTemplate={applyTemplate}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Editor sheet                                                               */
/* -------------------------------------------------------------------------- */

function HabitEditor({
  visible,
  draft,
  setDraft,
  editing,
  onClose,
  onSave,
  onDelete,
  onTemplate,
}: {
  visible: boolean;
  draft: Draft;
  setDraft: (d: Draft) => void;
  editing: Habit | null;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onTemplate: (tmpl: HabitTemplate) => void;
}) {
  const { t } = useTranslation();
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const TEMPLATES = useMemo(() => getTemplates(t), [t]);
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetGrabber} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editing ? t('habits.editTitle') : t('habits.newTitle')}</Text>
              <Pressable hitSlop={10} onPress={onClose}>
                <Ionicons name="close" size={22} color={Palette.muted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScroll}>
              {!editing ? (
                <>
                  <Text style={styles.fieldLabel}>{t('habits.quickStart')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.templateRow}>
                    {TEMPLATES.map((tmpl) => (
                      <Pressable
                        key={tmpl.name}
                        onPress={() => onTemplate(tmpl)}
                        style={({ pressed }) => [styles.template, pressed && styles.pressed]}>
                        <Ionicons name={tmpl.icon} size={16} color={Palette.primary} />
                        <Text style={styles.templateText}>{tmpl.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <Text style={styles.fieldLabel}>{t('common.name')}</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  value={draft.name}
                  onChangeText={(v) => patch({ name: v })}
                  placeholder={t('habits.namePlaceholder')}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>

              <Text style={styles.fieldLabel}>{t('habits.typeLabel')}</Text>
              <View style={styles.kindRow}>
                <Pressable
                  onPress={() => patch({ kind: 'counter' })}
                  style={[styles.kindOption, draft.kind === 'counter' && styles.kindOptionActive]}>
                  <Ionicons
                    name="repeat-outline"
                    size={18}
                    color={draft.kind === 'counter' ? '#FFFFFF' : Palette.muted}
                  />
                  <Text style={[styles.kindOptionText, draft.kind === 'counter' && styles.kindOptionTextActive]}>
                    {t('habits.counterLabel')}
                  </Text>
                  <Text style={[styles.kindOptionSub, draft.kind === 'counter' && styles.kindOptionSubActive]}>
                    {t('habits.counterSub')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => patch({ kind: 'checkbox' })}
                  style={[styles.kindOption, draft.kind === 'checkbox' && styles.kindOptionActive]}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={draft.kind === 'checkbox' ? '#FFFFFF' : Palette.muted}
                  />
                  <Text style={[styles.kindOptionText, draft.kind === 'checkbox' && styles.kindOptionTextActive]}>
                    {t('habits.checkboxLabel')}
                  </Text>
                  <Text style={[styles.kindOptionSub, draft.kind === 'checkbox' && styles.kindOptionSubActive]}>
                    {t('habits.checkboxSub')}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>{t('habits.iconLabel')}</Text>
              <View style={styles.chipGrid}>
                {ICON_CHOICES.map((ic) => {
                  const active = ic === draft.icon;
                  return (
                    <Pressable
                      key={ic}
                      onPress={() => patch({ icon: ic })}
                      style={[styles.iconChip, active && styles.iconChipActive]}>
                      <Ionicons name={ic} size={20} color={active ? '#FFFFFF' : Palette.muted} />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>{t('addEntry.colorLabel')}</Text>
              <ColorPickerField
                presets={COLOR_CHOICES.map((key) => ({
                  key,
                  color: (Palette as unknown as Record<string, string>)[key] ?? Palette.primary,
                }))}
                selectedKey={draft.colorKey}
                customColor={draft.customColor}
                onSelectPreset={(key) => patch({ colorKey: key as HabitColorKey, customColor: undefined })}
                onSelectCustom={(hex) => patch({ colorKey: 'custom', customColor: hex })}
              />

              {draft.kind === 'counter' ? (
                <>
                  <Text style={styles.fieldLabel}>{t('habits.unitLabel')}</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={draft.unit}
                      onChangeText={(v) => patch({ unit: v })}
                      placeholder={t('habits.unitPlaceholder')}
                      placeholderTextColor={Palette.subtle}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{t('habits.dailyTargetLabel')}</Text>
                    <NumberStepperField
                      value={draft.target}
                      onChange={(v) => patch({ target: v })}
                      min={1}
                      max={999}
                      unit={draft.unit.trim()}
                      title={t('habits.dailyTargetLabel')}
                    />
                  </View>
                  <View style={styles.stepperRow}>
                    <Text style={styles.stepperLabel}>{t('habits.perTapLabel')}</Text>
                    <NumberStepperField
                      value={draft.step}
                      onChange={(v) => patch({ step: v })}
                      min={1}
                      max={100}
                      unit={draft.unit.trim()}
                      title={t('habits.perTapTitle')}
                    />
                  </View>
                </>
              ) : null}
            </ScrollView>

            <View style={styles.sheetFooter}>
              {editing ? (
                <Pressable
                  onPress={onDelete}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
                  <Ionicons name="trash-outline" size={18} color="#E5484D" />
                </Pressable>
              ) : null}
              <Pressable
                onPress={onSave}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed]}>
                <Text style={styles.saveText}>{editing ? t('habits.saveChanges') : t('habits.addHabit')}</Text>
              </Pressable>
            </View>
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
  shadowOpacity: 0.08,
  shadowRadius: 16,
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

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Palette.primary,
      borderRadius: 26,
      padding: 22,
      marginBottom: 8,
      overflow: 'hidden',
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    heroBlobTop: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: 'rgba(255,255,255,0.14)',
      top: -50,
      right: -30,
    },
    heroBlobBottom: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: 'rgba(0,0,0,0.08)',
      bottom: -60,
      left: -20,
    },
    heroText: { flex: 1, paddingRight: 12 },
    heroLabel: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
    heroBig: {
      fontFamily: FontFamily,
      fontSize: 40,
      fontWeight: '800',
      color: '#FFFFFF',
      marginVertical: 4,
      letterSpacing: -1,
    },
    heroBigSmall: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
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
    ringPct: { fontFamily: FontFamily, fontSize: 20, fontWeight: '800', color: '#FFFFFF' },

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

    habitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
      ...CARD_SHADOW,
    },
    habitPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
    habitBody: { flex: 1, marginLeft: 14 },
    habitName: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
    habitMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
    habitProgress: { fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: Palette.muted },
    metaDot: { color: Palette.subtle, fontSize: 13 },
    habitStreak: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.orange },

    habitActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    minusBtn: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: Palette.bg,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    habitAction: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: Palette.bg,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteRowBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },

    hint: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '600',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 6,
    },

    upsell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: Tint.primary,
      borderRadius: 16,
      padding: 14,
      marginTop: 18,
    },
    upsellText: { flex: 1, fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },

    /* editor sheet */
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(16,14,36,0.45)', justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: Palette.bg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 20,
      maxHeight: '88%',
    },
    sheetGrabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: Palette.hairline,
      marginBottom: 12,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    sheetTitle: { fontFamily: FontFamily, fontSize: 20, fontWeight: '800', color: Palette.ink },
    sheetScroll: { paddingBottom: 12 },

    fieldLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.muted,
      marginTop: 16,
      marginBottom: 8,
    },
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

    templateRow: { gap: 8, paddingRight: 4 },
    template: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Tint.primary,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    templateText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.primary },

    kindRow: { flexDirection: 'row', gap: 10 },
    kindOption: {
      flex: 1,
      backgroundColor: Palette.card,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 4,
    },
    kindOptionActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    kindOptionText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink, marginTop: 2 },
    kindOptionTextActive: { color: '#FFFFFF' },
    kindOptionSub: { fontFamily: FontFamily, fontSize: 11, fontWeight: '600', color: Palette.muted },
    kindOptionSubActive: { color: 'rgba(255,255,255,0.85)' },

    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
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
    iconChipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },

    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: Palette.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 12,
    },
    stepperLabel: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },

    sheetFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
    deleteBtn: {
      width: 54,
      height: 54,
      borderRadius: 18,
      backgroundColor: '#FDE7E8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtn: {
      flex: 1,
      height: 54,
      borderRadius: 18,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savePressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
    saveText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  });
}
