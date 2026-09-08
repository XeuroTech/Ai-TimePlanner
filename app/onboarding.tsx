import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactElement, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * Onboarding carousel for the AI Smart Timetable Planner.
 *
 * A premium 3-slide horizontal pager with an animated dots indicator.
 *  - Slide 1: welcome + AI-robot-helping-a-student illustration
 *  - Slide 2: AI scheduling
 *  - Slide 3: smart reminders
 *
 * Built only with `@expo/vector-icons` + core RN primitives (no extra native
 * deps) so it runs in Expo Go and production builds unchanged.
 *
 * Navigation:
 *  - "Get Started" and "Login" both enter the app (tabs) for now.
 *    TODO(backend): point "Login" at a dedicated /login route once auth exists.
 */

type Slide = {
  key: string;
  title: string;
  subtitle: string;
  Art: () => ReactElement;
};

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    title: 'Welcome to Smart Planner',
    subtitle: 'Your AI powered personal timetable assistant.',
    Art: RobotStudentArt,
  },
  {
    key: 'ai-schedule',
    title: 'AI That Plans For You',
    subtitle: 'Let AI build the perfect timetable around your classes and goals.',
    Art: AiScheduleArt,
  },
  {
    key: 'reminders',
    title: 'Never Miss a Task',
    subtitle: 'Smart reminders keep your study sessions and deadlines on track.',
    Art: RemindersArt,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;

  const enterApp = () => router.replace('/register');
  // TODO(backend): replace with router.push('/login') when the auth screen exists.
  const login = () => router.replace('/login');

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false },
  );

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Decorative background blobs */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, styles.blobOne]} />
        <View style={[styles.blob, styles.blobTwo]} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Skip */}
        <View style={styles.topBar}>
          <Pressable
            onPress={enterApp}
            hitSlop={12}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        {/* Slides */}
        <Animated.FlatList
          data={SLIDES}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.artArea}>
                <item.Art />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          )}
        />

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((s, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 26, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return <Animated.View key={s.key} style={[styles.dot, { width: dotWidth, opacity }]} />;
          })}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={enterApp}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryText}>Get Started</Text>
          </Pressable>

          <Pressable
            onPress={login}
            android_ripple={{ color: 'rgba(108,77,255,0.12)' }}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryPressed]}>
            <Text style={styles.secondaryText}>Login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Illustrations                                                              */
/* -------------------------------------------------------------------------- */

function RobotStudentArt() {
  const { Palette } = useAppTheme();
  const art = useMemo(() => createArtStyles(Palette), [Palette]);
  return (
    <View style={art.wrap}>
      <View style={art.halo} />

      {/* floating sparkles */}
      <View style={[art.chip, art.chipTopLeft]}>
        <Ionicons name="sparkles" size={20} color={Palette.pink} />
      </View>

      {/* floating schedule card the robot is organizing */}
      <View style={[art.scheduleCard]}>
        <View style={art.scheduleRow}>
          <View style={[art.tag, { backgroundColor: Palette.primary }]} />
          <View style={[art.line, { width: 46 }]} />
        </View>
        <View style={art.scheduleRow}>
          <View style={[art.tag, { backgroundColor: Palette.blue }]} />
          <View style={[art.line, { width: 34 }]} />
        </View>
        <View style={art.scheduleRow}>
          <View style={[art.tag, { backgroundColor: Palette.green }]} />
          <View style={[art.line, { width: 40 }]} />
        </View>
      </View>

      {/* robot */}
      <View style={art.robot}>
        <View style={art.antenna} />
        <View style={art.antennaDot} />
        <View style={art.head}>
          <View style={art.face}>
            <View style={art.eye} />
            <View style={art.eye} />
          </View>
          <View style={art.smile} />
          <View style={[art.cheek, { left: 12 }]} />
          <View style={[art.cheek, { right: 12 }]} />
        </View>
        <View style={art.earLeft} />
        <View style={art.earRight} />
        <View style={art.body}>
          <Ionicons name="calendar-clear" size={26} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

function AiScheduleArt() {
  const { Palette } = useAppTheme();
  const art = useMemo(() => createArtStyles(Palette), [Palette]);
  const blocks = [
    { c: Palette.primary, w: '80%' },
    { c: Palette.blue, w: '60%' },
    { c: Palette.green, w: '72%' },
    { c: Palette.orange, w: '52%' },
  ];
  return (
    <View style={art.wrap}>
      <View style={art.halo} />
      <View style={[art.chip, art.chipTopRight]}>
        <Ionicons name="sparkles" size={20} color={Palette.primary} />
      </View>
      <View style={art.timetable}>
        <View style={art.ttHeader}>
          <Ionicons name="calendar" size={18} color={Palette.primary} />
          <View style={[art.line, { width: 70, marginLeft: 8 }]} />
        </View>
        {blocks.map((b, i) => (
          <View key={i} style={art.ttRow}>
            <View style={art.ttTime} />
            <View style={[art.ttBlock, { backgroundColor: b.c, width: b.w as `${number}%` }]} />
          </View>
        ))}
      </View>
      <View style={[art.chip, art.chipBottomLeft]}>
        <Ionicons name="flash" size={20} color={Palette.orange} />
      </View>
    </View>
  );
}

function RemindersArt() {
  const { Palette } = useAppTheme();
  const art = useMemo(() => createArtStyles(Palette), [Palette]);
  const items = [
    { done: true, w: 64 },
    { done: true, w: 48 },
    { done: false, w: 58 },
  ];
  return (
    <View style={art.wrap}>
      <View style={art.halo} />
      <View style={[art.chip, art.chipTopRight]}>
        <Ionicons name="notifications" size={20} color={Palette.pink} />
      </View>
      <View style={art.checklist}>
        {items.map((it, i) => (
          <View key={i} style={art.checkRow}>
            <View style={[art.checkBox, it.done && art.checkBoxDone]}>
              {it.done && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <View style={[art.line, { width: it.w }]} />
          </View>
        ))}
      </View>
      <View style={[art.chip, art.chipBottomLeft]}>
        <Ionicons name="time" size={20} color={Palette.blue} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  pressed: { opacity: 0.6 },

  blob: { position: 'absolute', borderRadius: 999 },
  blobOne: {
    width: 300,
    height: 300,
    top: -100,
    right: -90,
    backgroundColor: 'rgba(139,125,255,0.16)',
  },
  blobTwo: {
    width: 280,
    height: 280,
    bottom: -120,
    left: -90,
    backgroundColor: 'rgba(77,163,255,0.10)',
  },

  topBar: {
    height: 44,
    paddingHorizontal: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  skip: {
    fontFamily: FontFamily,
    fontSize: 15,
    fontWeight: '600',
    color: Palette.muted,
  },

  slide: {
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artArea: {
    height: 300,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily,
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    color: Palette.ink,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: FontFamily,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    textAlign: 'center',
    color: Palette.muted,
    marginTop: 12,
    paddingHorizontal: 6,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 22,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.primary,
  },

  actions: {
    paddingHorizontal: 28,
    paddingBottom: 12,
  },
  primaryBtn: {
    height: 60,
    borderRadius: 22,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  primaryPressed: { backgroundColor: '#5B3EEB', transform: [{ scale: 0.985 }] },
  primaryText: {
    fontFamily: FontFamily,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    height: 58,
    borderRadius: 22,
    backgroundColor: '#EFEBFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  secondaryPressed: { backgroundColor: '#E4DEFF' },
  secondaryText: {
    fontFamily: FontFamily,
    color: Palette.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  });
}

function createArtStyles(Palette: AppPalette) {
  return StyleSheet.create({
  wrap: {
    width: 240,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(108,77,255,0.08)',
  },

  chip: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  chipTopLeft: { top: 18, left: 8 },
  chipTopRight: { top: 14, right: 10 },
  chipBottomLeft: { bottom: 20, left: 6 },

  /* robot */
  robot: { alignItems: 'center', justifyContent: 'center' },
  antenna: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#B9AEF2',
  },
  antennaDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Palette.primary,
    marginTop: -26,
    marginBottom: 12,
  },
  head: {
    width: 128,
    height: 104,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#E7E3FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  face: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 6,
  },
  eye: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Palette.primary,
  },
  smile: {
    width: 34,
    height: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: Palette.secondary,
  },
  cheek: {
    position: 'absolute',
    bottom: 26,
    width: 12,
    height: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,111,174,0.5)',
  },
  earLeft: {
    position: 'absolute',
    left: 44,
    width: 10,
    height: 26,
    borderRadius: 6,
    backgroundColor: Palette.secondary,
    top: 34,
  },
  earRight: {
    position: 'absolute',
    right: 44,
    width: 10,
    height: 26,
    borderRadius: 6,
    backgroundColor: Palette.secondary,
    top: 34,
  },
  body: {
    marginTop: 14,
    width: 116,
    height: 68,
    borderRadius: 26,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },

  /* floating schedule card */
  scheduleCard: {
    position: 'absolute',
    right: 2,
    top: 70,
    width: 96,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { width: 10, height: 10, borderRadius: 3 },
  line: { height: 7, borderRadius: 4, backgroundColor: '#E2DEF3' },

  /* timetable (slide 2) */
  timetable: {
    width: 190,
    borderRadius: 26,
    backgroundColor: Palette.glass,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    padding: 18,
    gap: 12,
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 9,
  },
  ttHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ttRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ttTime: { width: 22, height: 8, borderRadius: 4, backgroundColor: '#D9D3F2' },
  ttBlock: { height: 18, borderRadius: 8 },

  /* checklist (slide 3) */
  checklist: {
    width: 200,
    borderRadius: 26,
    backgroundColor: Palette.glass,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    padding: 20,
    gap: 16,
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 9,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CFC7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxDone: {
    backgroundColor: Palette.green,
    borderColor: Palette.green,
  },
  });
}
