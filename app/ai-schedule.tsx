import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatTime } from '@/lib/time';
import { useAuthStore } from '@/store/auth-store';
import { useMyClasses } from '@/store/planner-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

const SUBJECTS = ['Math', 'Physics', 'Programming', 'English', 'Chemistry', 'Biology'];
const DIFFICULTY = ['Easy', 'Medium', 'Hard'] as const;
type Difficulty = (typeof DIFFICULTY)[number];

const SUGGESTIONS = [
  'Schedule harder subjects earlier in the day',
  'Add a revision day before the exam',
  'Keep sessions under 90 minutes for better focus',
];

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function AiScheduleScreen() {
  const router = useRouter();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  // The Daily Routine screen is the source of truth for how much time the user
  // actually has; seed from it instead of a hard-coded 4.
  const prefs = useAuthStore((s) => s.profile?.preferences);
  const myClasses = useMyClasses();

  const [selected, setSelected] = useState<string[]>([]);
  const [studyHours, setStudyHours] = useState(prefs?.studyHours ?? 4);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [examDays, setExamDays] = useState(14);
  const [breakTime, setBreakTime] = useState(15);

  // Offer the user's real subjects first, falling back to the generic list for
  // someone who hasn't built a timetable yet.
  const subjectOptions = useMemo(() => {
    const mine = [...new Set(myClasses.map((c) => c.subject))].filter(Boolean);
    return mine.length ? mine : SUBJECTS;
  }, [myClasses]);

  const examDate = new Date();
  examDate.setDate(examDate.getDate() + examDays);
  const examLabel = examDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });

  const toggleSubject = (s: string) =>
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const onGenerate = () => {
    // Fold the saved routine into the prompt so the AI plans around the hours
    // the user is actually awake and free.
    const routineBits: string[] = [];
    if (typeof prefs?.wakeTime === 'number' && typeof prefs?.sleepTime === 'number') {
      routineBits.push(`I wake at ${formatTime(prefs.wakeTime)} and sleep at ${formatTime(prefs.sleepTime)}`);
    }
    if (prefs?.workHours) routineBits.push(`I work ${prefs.workHours}h a day`);
    if (prefs?.exerciseMinutes) routineBits.push(`I exercise ${prefs.exerciseMinutes} min a day`);
    const routine = routineBits.length ? ` ${routineBits.join(', ')}.` : '';

    const prompt =
      `Create a ${examDays}-day study schedule for these subjects: ${selected.join(', ')}. ` +
      `I can study ${studyHours} hour${studyHours === 1 ? '' : 's'} a day at a ${difficulty.toLowerCase()} ` +
      `difficulty level, with ${breakTime}-minute breaks between sessions. My exam is on ${examLabel}.` +
      routine;
    router.push({ pathname: '/ai-assistant', params: { seed: prompt } });
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
          <Text style={styles.headerTitle}>AI Generator</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Animated AI hero */}
          <View style={styles.hero}>
            <View pointerEvents="none" style={styles.heroBlobTop} />
            <View pointerEvents="none" style={styles.heroBlobBottom} />
            <AnimatedOrb />
            <Text style={styles.heroTitle}>Let AI plan your study</Text>
            <Text style={styles.heroSub}>Answer a few questions and get a personalized schedule.</Text>
          </View>

          {/* Subjects */}
          <Section icon="library-outline" color={Palette.primary} tint={Tint.primary} title="Subjects">
            <View style={styles.chipsWrap}>
              {subjectOptions.map((s) => {
                const active = selected.includes(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => toggleSubject(s)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Study hours */}
          <Section icon="time-outline" color={Palette.blue} tint={Tint.blue} title="Study Hours / day">
            <Stepper
              display={`${studyHours} h`}
              onDec={() => setStudyHours((v) => Math.max(1, v - 1))}
              onInc={() => setStudyHours((v) => Math.min(12, v + 1))}
            />
          </Section>

          {/* Difficulty */}
          <Section icon="speedometer-outline" color={Palette.orange} tint={Tint.orange} title="Difficulty">
            <View style={styles.segment}>
              {DIFFICULTY.map((d) => {
                const active = d === difficulty;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDifficulty(d)}
                    style={[styles.segItem, active && styles.segItemActive]}>
                    <Text style={[styles.segText, active && styles.segTextActive]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {/* Exam date */}
          <Section icon="calendar-outline" color={Palette.pink} tint={Tint.pink} title="Exam Date">
            <Stepper
              display={examLabel}
              wide
              onDec={() => setExamDays((v) => Math.max(1, v - 1))}
              onInc={() => setExamDays((v) => Math.min(120, v + 1))}
            />
          </Section>

          {/* Break time */}
          <Section icon="cafe-outline" color={Palette.green} tint={Tint.green} title="Break Time">
            <Stepper
              display={`${breakTime} min`}
              onDec={() => setBreakTime((v) => Math.max(5, v - 5))}
              onInc={() => setBreakTime((v) => Math.min(60, v + 5))}
            />
          </Section>

          {/* AI suggestions */}
          <View style={styles.suggestCard}>
            <View style={styles.suggestHeader}>
              <Ionicons name="sparkles" size={18} color={Palette.primary} />
              <Text style={styles.suggestTitle}>AI Suggestions</Text>
            </View>
            {SUGGESTIONS.map((s) => (
              <View key={s} style={styles.suggestRow}>
                <Ionicons name="checkmark-circle" size={16} color={Palette.primary} />
                <Text style={styles.suggestText}>{s}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Generate */}
        <View style={styles.footer}>
          <Pressable
            onPress={onGenerate}
            disabled={selected.length === 0}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [
              styles.generateBtn,
              selected.length === 0 && styles.generateDisabled,
              pressed && selected.length > 0 && styles.generatePressed,
            ]}>
            <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            <Text style={styles.generateText}>Generate Schedule</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Animated orb                                                               */
/* -------------------------------------------------------------------------- */

function AnimatedOrb() {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.orb}>
      <Animated.View style={[styles.orbRing, { transform: [{ rotate }] }]}>
        <View style={[styles.orbDot, { top: 0, left: 33 }]} />
        <View style={[styles.orbDot, { bottom: 4, left: 6 }]} />
        <View style={[styles.orbDot, { bottom: 4, right: 6 }]} />
      </Animated.View>
      <Animated.View style={[styles.orbCore, { transform: [{ scale: pulse }] }]}>
        <Ionicons name="sparkles" size={30} color={Palette.primary} />
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function Section({
  icon,
  color,
  tint,
  title,
  children,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  title: string;
  children: ReactNode;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Stepper({
  display,
  onDec,
  onInc,
  wide,
}: {
  display: string;
  onDec: () => void;
  onInc: () => void;
  wide?: boolean;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onDec} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <Ionicons name="remove" size={18} color={Palette.primary} />
      </Pressable>
      <Text style={[styles.stepValue, wide && { minWidth: 130 }]}>{display}</Text>
      <Pressable onPress={onInc} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
        <Ionicons name="add" size={18} color={Palette.primary} />
      </Pressable>
    </View>
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
  iconBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Palette.card, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },

  scroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },

  /* hero */
  hero: {
    alignItems: 'center',
    backgroundColor: Palette.primary,
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 22,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: Palette.primary,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  heroBlobTop: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)', top: -50, right: -30 },
  heroBlobBottom: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(0,0,0,0.08)', bottom: -50, left: -20 },
  heroTitle: { fontFamily: FontFamily, fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginTop: 14 },
  heroSub: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 6, lineHeight: 20 },

  orb: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  orbRing: { position: 'absolute', width: 92, height: 92 },
  orbDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.9)' },
  orbCore: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* cards */
  card: { backgroundColor: Palette.card, borderRadius: 20, padding: 16, marginBottom: 14, ...CARD_SHADOW },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 14,
    backgroundColor: Palette.bg,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: Palette.primary, borderColor: Palette.primary },
  chipText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.muted },
  chipTextActive: { color: '#FFFFFF' },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: Tint.primary, alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, textAlign: 'center', fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.ink },

  segment: { flexDirection: 'row', backgroundColor: '#ECEAF6', borderRadius: 14, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segItemActive: {
    backgroundColor: Palette.card,
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  segText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.muted },
  segTextActive: { color: Palette.primary },

  suggestCard: { backgroundColor: Tint.primary, borderRadius: 20, padding: 16, marginBottom: 8, gap: 12 },
  suggestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  suggestTitle: { fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.ink },
  suggestRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  suggestText: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.ink, lineHeight: 20 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.bg,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 58,
    borderRadius: 20,
    backgroundColor: Palette.primary,
    shadowColor: Palette.primary,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  generateDisabled: { backgroundColor: '#C9C2EC' },
  generatePressed: { backgroundColor: Palette.primaryDark, transform: [{ scale: 0.99 }] },
  generateText: { fontFamily: FontFamily, fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  });
}
