import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuthStore } from '@/store/auth-store';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Splash / Onboarding screen for the AI Smart Timetable Planner.
 *
 * Premium "Smart Planner" welcome screen:
 *  - Soft lavender background with decorative blobs
 *  - Friendly student-at-laptop illustration built from primitives
 *  - Floating glass cards (calendar, clock, tasks, AI sparkles)
 *  - Large purple "Get Started" call to action
 *
 * Rendered entirely with `@expo/vector-icons` + core RN primitives so it has
 * zero extra native dependencies and works in Expo Go and production builds.
 */

export default function SplashScreen() {
  const router = useRouter();
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const hydrated = useAuthStore((s) => s.hydrated);
  const fbUser = useAuthStore((s) => s.fbUser);
  const profile = useAuthStore((s) => s.profile);

  // Session restore: signed-in users skip the marketing flow.
  useEffect(() => {
    if (hydrated && fbUser && profile) {
      if (!fbUser.emailVerified) {
        router.replace('/verify-email');
      } else {
        router.replace(profile.onboarded ? '/(tabs)' : '/category');
      }
    }
  }, [hydrated, fbUser, profile, router]);

  // Entrance animation (fade + gentle rise).
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(28)).current;
  // Continuous float for the illustration.
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [fade, rise, float]);

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const floatYAlt = float.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });

  const goToOnboarding = () => router.push('/onboarding');
  const goToLogin = () => router.replace('/login');

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Decorative background blobs */}
      <View pointerEvents="none" style={styles.blobLayer}>
        <View style={[styles.blob, styles.blobOne]} />
        <View style={[styles.blob, styles.blobTwo]} />
        <View style={[styles.blob, styles.blobThree]} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View
          style={[styles.content, { opacity: fade, transform: [{ translateY: rise }] }]}>
          {/* Illustration */}
          <View style={styles.illustration}>
            {/* soft halo behind the scene */}
            <View style={styles.halo} />

            {/* floating: AI sparkles (top-left) */}
            <Animated.View
              style={[styles.chip, styles.chipSparkle, { transform: [{ translateY: floatY }] }]}>
              <Ionicons name="sparkles" size={22} color={Palette.pink} />
            </Animated.View>

            {/* floating: calendar (top-right) */}
            <Animated.View
              style={[styles.chip, styles.chipCalendar, { transform: [{ translateY: floatYAlt }] }]}>
              <Ionicons name="calendar" size={22} color={Palette.primary} />
            </Animated.View>

            {/* floating: clock (mid-left) */}
            <Animated.View
              style={[styles.chip, styles.chipClock, { transform: [{ translateY: floatYAlt }] }]}>
              <Ionicons name="time" size={22} color={Palette.blue} />
            </Animated.View>

            {/* floating: tasks (bottom-right) */}
            <Animated.View
              style={[styles.chip, styles.chipTasks, { transform: [{ translateY: floatY }] }]}>
              <Ionicons name="checkmark-done" size={22} color={Palette.green} />
            </Animated.View>

            {/* hero glass card with the student */}
            <Animated.View style={[styles.heroCard, { transform: [{ translateY: floatY }] }]}>
              <View style={styles.scene}>
                {/* character */}
                <View style={styles.hair} />
                <View style={styles.head} />
                <View style={styles.body} />

                {/* laptop */}
                <View style={styles.laptopBase} />
                <View style={styles.laptopScreen}>
                  <View style={styles.codeLineLong} />
                  <View style={styles.codeLineShort} />
                  <View style={styles.codeLineMed} />
                  <Ionicons
                    name="sparkles"
                    size={13}
                    color="#FFFFFF"
                    style={styles.laptopSpark}
                  />
                </View>

                {/* little plant accent */}
                <View style={styles.plantPot} />
                <View style={[styles.leaf, styles.leafLeft]} />
                <View style={[styles.leaf, styles.leafRight]} />
              </View>
            </Animated.View>
          </View>

          {/* Logo + copy */}
          <View style={styles.textBlock}>
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                <Ionicons name="calendar-clear" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.logo}>Smart Planner</Text>
            </View>
            <Text style={styles.subtitle}>Plan your day.{'\n'}Organize your life.</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              onPress={goToOnboarding}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
              <Text style={styles.ctaText}>Get Started</Text>
            </Pressable>

            <Pressable
              onPress={goToLogin}
              hitSlop={12}
              style={({ pressed }) => [styles.linkWrap, pressed && styles.linkPressed]}>
              <Text style={styles.linkText}>I already have an account</Text>
            </Pressable>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.bg,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },

  /* background blobs */
  blobLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobOne: {
    width: 320,
    height: 320,
    top: -90,
    right: -80,
    backgroundColor: 'rgba(139,125,255,0.16)',
  },
  blobTwo: {
    width: 260,
    height: 260,
    top: 120,
    left: -110,
    backgroundColor: 'rgba(108,77,255,0.10)',
  },
  blobThree: {
    width: 300,
    height: 300,
    bottom: -120,
    right: -60,
    backgroundColor: 'rgba(77,163,255,0.10)',
  },

  /* illustration */
  illustration: {
    flex: 1,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(108,77,255,0.08)',
  },
  heroCard: {
    width: 208,
    height: 196,
    borderRadius: 40,
    backgroundColor: Palette.glass,
    borderWidth: 1,
    borderColor: Palette.glassBorder,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  scene: {
    width: '100%',
    height: 172,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  hair: {
    position: 'absolute',
    top: 26,
    width: 62,
    height: 54,
    borderRadius: 31,
    backgroundColor: '#4A3B8F',
  },
  head: {
    position: 'absolute',
    top: 38,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F6C9A6',
  },
  body: {
    position: 'absolute',
    bottom: 18,
    width: 118,
    height: 78,
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    backgroundColor: Palette.orange,
  },
  laptopBase: {
    position: 'absolute',
    bottom: 20,
    width: 116,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#B9AEF2',
  },
  laptopScreen: {
    position: 'absolute',
    bottom: 30,
    width: 96,
    height: 60,
    borderRadius: 12,
    backgroundColor: Palette.primary,
    paddingHorizontal: 12,
    paddingTop: 12,
    justifyContent: 'flex-start',
  },
  codeLineLong: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  codeLineMed: {
    width: '55%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  codeLineShort: {
    width: '38%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
  },
  laptopSpark: {
    position: 'absolute',
    right: 10,
    bottom: 8,
  },
  plantPot: {
    position: 'absolute',
    bottom: 18,
    right: 22,
    width: 20,
    height: 22,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: Palette.pink,
  },
  leaf: {
    position: 'absolute',
    bottom: 36,
    right: 26,
    width: 12,
    height: 20,
    borderRadius: 8,
    backgroundColor: Palette.green,
  },
  leafLeft: {
    transform: [{ rotate: '-22deg' }],
    right: 34,
  },
  leafRight: {
    transform: [{ rotate: '22deg' }],
  },

  /* floating chips */
  chip: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
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
  chipSparkle: { top: 24, left: 22 },
  chipCalendar: { top: 12, right: 28 },
  chipClock: { top: 118, left: 6 },
  chipTasks: { bottom: 22, right: 10 },

  /* text */
  textBlock: {
    alignItems: 'center',
    marginTop: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C4DFF',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  logo: {
    fontFamily: FontFamily,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: Palette.ink,
  },
  subtitle: {
    fontFamily: FontFamily,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
    textAlign: 'center',
    color: Palette.muted,
  },

  /* actions */
  actions: {
    marginTop: 8,
  },
  cta: {
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
  ctaPressed: {
    backgroundColor: '#5B3EEB',
    transform: [{ scale: 0.985 }],
  },
  ctaText: {
    fontFamily: FontFamily,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  linkWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  linkPressed: {
    opacity: 0.6,
  },
  linkText: {
    fontFamily: FontFamily,
    color: Palette.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  });
}
