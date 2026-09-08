import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Priority, usePlannerStore } from '@/store/planner-store';

const PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

const DUE_OPTIONS = ['Today', 'Tomorrow', 'This week', 'Next week', 'No date'];

export default function AddTaskScreen() {
  const router = useRouter();
  const addTask = usePlannerStore((s) => s.addTask);
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const PRIORITY_STYLE: Record<Priority, { color: string; tint: string }> = {
    High: { color: '#E5484D', tint: '#FDE7E8' },
    Medium: { color: Palette.orange, tint: Tint.orange },
    Low: { color: Palette.green, tint: Tint.green },
  };

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [due, setDue] = useState('Today');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    if (!title.trim()) {
      setError('Please enter a task title.');
      return;
    }
    setError(null);
    addTask({
      title: title.trim(),
      subject: subject.trim() || 'General',
      due,
      priority,
    });
    router.back();
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Add Task</Text>
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
            <Field label="Task">
              <View style={styles.inputWrap}>
                <Ionicons name="checkmark-done-outline" size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Finish assignment"
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>
            </Field>

            <Field label="Subject / Category">
              <View style={styles.inputWrap}>
                <Ionicons name="pricetag-outline" size={18} color={Palette.subtle} style={styles.inputIcon} />
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="e.g. Mathematics"
                  placeholderTextColor={Palette.subtle}
                  style={styles.input}
                />
              </View>
            </Field>

            <Field label="Due">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chipRow}>
                {DUE_OPTIONS.map((opt) => {
                  const active = opt === due;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setDue(opt)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Ionicons name="time-outline" size={14} color={active ? '#FFFFFF' : Palette.muted} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Field>

            <Field label="Priority">
              <View style={styles.priorityRow}>
                {PRIORITIES.map((p) => {
                  const active = p === priority;
                  const s = PRIORITY_STYLE[p];
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPriority(p)}
                      style={[
                        styles.priorityChip,
                        { backgroundColor: active ? s.color : s.tint },
                      ]}>
                      <Text style={[styles.priorityText, { color: active ? '#FFFFFF' : s.color }]}>
                        {p}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.footer}>
          <Pressable
            onPress={onSave}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [styles.saveBtn, pressed && styles.savePressed]}>
            <Text style={styles.saveText}>Save Task</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

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

  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '800' },

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
