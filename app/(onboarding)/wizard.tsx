import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { ClockTimeField } from '@/components/ui/clock-time-picker';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { getCategory } from '@/constants/categories';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuthStore } from '@/store/auth-store';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WizardScreen() {
  const router = useRouter();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const profile = useAuthStore((s) => s.profile);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const category = getCategory(profile?.category);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(profile?.name ?? '');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('');
  const [days, setDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [wake, setWake] = useState(7 * 60);
  const [sleep, setSleep] = useState(23 * 60);
  const [workingHours, setWorkingHours] = useState(8);
  const [reminder, setReminder] = useState(9 * 60);
  const [goals, setGoals] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const generate = async () => {
    if (!name.trim()) {
      setNameError('Name is required.');
      return;
    }
    setNameError(null);
    setSaving(true);
    await completeOnboarding({
      name: name.trim(),
      country: country.trim(),
      timezone: timezone.trim(),
      workingDays: days,
      wakeTime: wake,
      sleepTime: sleep,
      workingHours,
      reminderTime: reminder,
      aiGoals: goals.trim(),
    });
    setSaving(false);
    toast.success('Your planner is ready!');
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.badge, { backgroundColor: category.tint }]}>
              <Ionicons name={category.icon} size={28} color={category.color} />
            </View>
            <Text style={styles.title}>Set up your planner</Text>
            <Text style={styles.subtitle}>A few details so your {category.label.toLowerCase()} planner fits your day.</Text>

            <TextField label="Name" value={name} onChangeText={setName} placeholder="Your name" icon="person-outline" autoCapitalize="words" error={nameError} />
            <TextField label="Country" value={country} onChangeText={setCountry} placeholder="e.g. Pakistan" icon="flag-outline" autoCapitalize="words" />
            <TextField label="Timezone" value={timezone} onChangeText={setTimezone} placeholder="e.g. GMT+5" icon="globe-outline" />

            <Text style={styles.groupLabel}>Working Days</Text>
            <View style={styles.daysRow}>
              {DAYS.map((d) => {
                const on = days.includes(d);
                return (
                  <Pressable key={d} onPress={() => toggleDay(d)} style={[styles.dayChip, on && styles.dayChipOn]}>
                    <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Times use the circular clock picker; only real counts stay as steppers. */}
            <TimeRow label="Wake Time" icon="sunny-outline" value={wake} onChange={setWake} />
            <TimeRow label="Sleep Time" icon="moon-outline" value={sleep} onChange={setSleep} />
            <Stepper label="Working Hours" icon="briefcase-outline" display={`${workingHours} h`} onDec={() => setWorkingHours((v) => Math.max(1, v - 1))} onInc={() => setWorkingHours((v) => Math.min(16, v + 1))} />
            <TimeRow label="Daily Reminder Time" icon="notifications-outline" value={reminder} onChange={setReminder} />

            <Text style={styles.groupLabel}>AI Goals</Text>
            <View style={styles.goalsBox}>
              <TextInput
                value={goals}
                onChangeText={setGoals}
                placeholder="e.g. Stay consistent, finish projects on time, study 2h daily…"
                placeholderTextColor={Palette.subtle}
                multiline
                style={styles.goalsInput}
              />
            </View>

            <Button title="Generate My Planner" icon="sparkles" onPress={generate} loading={saving} style={styles.cta} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** Card row whose value opens the circular clock picker. */
function TimeRow({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  onChange: (v: number) => void;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  return (
    <View style={styles.stepCard}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={18} color={Palette.primary} />
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
      <ClockTimeField
        variant="pill"
        icon={icon}
        title={label}
        value={value}
        onChange={onChange}
        minuteStep={5}
      />
    </View>
  );
}

function Stepper({
  label,
  icon,
  display,
  onDec,
  onInc,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  display: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  return (
    <View style={styles.stepCard}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={18} color={Palette.primary} />
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={onDec} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
          <Ionicons name="remove" size={18} color={Palette.primary} />
        </Pressable>
        <Text style={styles.stepValue}>{display}</Text>
        <Pressable onPress={onInc} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
          <Ionicons name="add" size={18} color={Palette.primary} />
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.5 },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 30 },

  badge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontFamily: FontFamily, fontSize: 27, fontWeight: '800', letterSpacing: -0.6, color: Palette.ink },
  subtitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.muted, marginTop: 8, marginBottom: 24, lineHeight: 21 },

  groupLabel: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink, marginBottom: 12, marginTop: 4 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  dayChip: {
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 13,
    backgroundColor: Palette.card,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipOn: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  dayText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.muted },
  dayTextOn: { color: '#FFFFFF' },

  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  stepIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: Tint.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  stepLabel: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Tint.primary, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: FontFamily, fontSize: 14, fontWeight: '800', color: Palette.ink, minWidth: 72, textAlign: 'center' },

  goalsBox: {
    backgroundColor: Palette.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    padding: 14,
    marginBottom: 22,
  },
  goalsInput: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.ink, minHeight: 80, textAlignVertical: 'top' },
  cta: { marginTop: 4 },
  });
}
