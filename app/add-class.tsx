import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
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
import { ColorPickerField } from '@/components/ui/color-picker-field';
import { getAddEntryConfig } from '@/constants/categories';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { REMINDER_OPTIONS } from '@/lib/services/reminders';
import { useProfile } from '@/store/auth-store';
import { useMyClasses, usePlannerStore } from '@/store/planner-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const REPEAT_OPTIONS = ['Never', 'Daily', 'Weekly', 'Weekdays'];

const todayIndex = (new Date().getDay() + 6) % 7;

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function AddClassScreen() {
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  const addClass = usePlannerStore((s) => s.addClass);
  const updateClass = usePlannerStore((s) => s.updateClass);
  const classes = useMyClasses();
  const editing = classId ? classes.find((c) => c.id === classId) ?? null : null;
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const COLOR_OPTIONS = [
    Palette.primary,
    Palette.blue,
    Palette.green,
    Palette.orange,
    Palette.pink,
    Palette.secondary,
    '#9AA0B4',
  ];

  // The Add screen adapts its wording to the user's persona/category.
  const profile = useProfile();
  const cfg = getAddEntryConfig(profile?.category);

  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [dayIndex, setDayIndex] = useState(editing?.day ?? todayIndex);
  const [start, setStart] = useState<number>(editing?.start ?? 540); // 9:00 AM
  const [end, setEnd] = useState<number>(editing?.end ?? 600); // 10:00 AM
  const [teacher, setTeacher] = useState(editing?.teacher ?? '');
  const [room, setRoom] = useState(editing?.room ?? '');
  const [reminder, setReminder] = useState(editing?.reminder ?? 'At start');
  const [repeat, setRepeat] = useState(editing?.repeat ?? 'Weekly');
  const [color, setColor] = useState<string>(editing?.color ?? Palette.primary);
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    if (!subject.trim()) {
      setError(`Please enter a ${cfg.subject.label.toLowerCase()}.`);
      return;
    }
    if (end <= start) {
      setError('End time must be after start time.');
      return;
    }
    setError(null);
    const payload = {
      subject: subject.trim(),
      day: dayIndex,
      start,
      end,
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      reminder,
      repeat,
      color,
    };
    if (editing) updateClass(editing.id, payload);
    else addClass(payload);
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
          <Text style={styles.headerTitle}>{editing ? `Edit ${cfg.title}` : cfg.title}</Text>
          <View style={styles.iconBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* Subject */}
            <Field label={cfg.subject.label}>
              <View style={styles.inputWrap}>
                <Ionicons name={cfg.subject.icon} size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={cfg.subject.placeholder}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>
            </Field>

            {/* Day */}
            <Field label="Day">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.dayRow}>
                {DAY_LABELS.map((d, i) => {
                  const active = i === dayIndex;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDayIndex(i)}
                      style={[styles.dayChip, active && styles.dayChipActive]}>
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Field>

            {/* Start / End time — real circular clock picker */}
            <View style={styles.row2}>
              <View style={styles.flex}>
                <ClockTimeField
                  label="Start Time"
                  title="Start time"
                  value={start}
                  onChange={(v) => {
                    setStart(v);
                    // Keep the end time after the start by preserving the length.
                    if (v >= end) setEnd(Math.min(1439, v + Math.max(30, end - start)));
                  }}
                  minuteStep={5}
                />
              </View>
              <View style={{ width: 14 }} />
              <View style={styles.flex}>
                <ClockTimeField
                  label="End Time"
                  title="End time"
                  value={end}
                  onChange={setEnd}
                  minuteStep={5}
                  compareTo={start}
                />
              </View>
            </View>

            {/* Person (teacher / client / patient / …) */}
            <Field label={cfg.person.label}>
              <View style={styles.inputWrap}>
                <Ionicons name={cfg.person.icon} size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={teacher}
                  onChangeText={setTeacher}
                  placeholder={cfg.person.placeholder}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>
            </Field>

            {/* Place (room / location / link / …) */}
            <Field label={cfg.place.label}>
              <View style={styles.inputWrap}>
                <Ionicons name={cfg.place.icon} size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={room}
                  onChangeText={setRoom}
                  placeholder={cfg.place.placeholder}
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>
            </Field>

            {/* Reminder */}
            <Field label="Reminder">
              <ChipSelect options={REMINDER_OPTIONS} value={reminder} onChange={setReminder} icon="notifications-outline" />
            </Field>

            {/* Repeat */}
            <Field label="Repeat">
              <ChipSelect options={REPEAT_OPTIONS} value={repeat} onChange={setRepeat} icon="repeat-outline" />
            </Field>

            {/* Color */}
            <Field label="Color">
              <ColorPickerField
                presets={COLOR_OPTIONS.map((c) => ({ key: c, color: c }))}
                selectedKey={COLOR_OPTIONS.includes(color) ? color : 'custom'}
                customColor={COLOR_OPTIONS.includes(color) ? undefined : color}
                onSelectPreset={(key) => setColor(key)}
                onSelectCustom={(hex) => setColor(hex)}
              />
            </Field>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Save */}
        <View style={styles.footer}>
          <Pressable
            onPress={onSave}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed]}>
            <Text style={styles.saveText}>{editing ? 'Save Changes' : cfg.saveLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Field wrapper                                                              */
/* -------------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Chip select (single choice)                                                */
/* -------------------------------------------------------------------------- */

function ChipSelect({
  options,
  value,
  onChange,
  icon,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  icon: IoniconName;
}) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chipRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.chip, active && styles.chipActive]}>
            <Ionicons name={icon} size={14} color={active ? '#FFFFFF' : Palette.muted} />
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

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
  headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },

  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },

  field: { marginBottom: 20 },
  fieldLabel: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink, marginBottom: 10 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    paddingHorizontal: 14,
    height: 58,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink, height: '100%' },

  row2: { flexDirection: 'row' },

  dayRow: { gap: 10, paddingVertical: 2 },
  dayChip: {
    minWidth: 52,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 15,
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  dayChipText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.muted },
  dayChipTextActive: { color: '#FFFFFF' },

  chipRow: { gap: 10, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 14,
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
  },
  chipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  chipText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted },
  chipTextActive: { color: '#FFFFFF' },

  error: { fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: '#E5484D', marginTop: 4 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.bg,
  },
  saveBtn: {
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
  savePressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
  saveText: { fontFamily: FontFamily, fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  });
}
