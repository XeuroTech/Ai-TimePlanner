import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { ToastProvider } from '@/components/ui/toast';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAutoBackup } from '@/hooks/use-auto-backup';
import { useReminders } from '@/hooks/use-reminders';
import {
  initObservability,
  reportError,
  setAnalyticsUser,
  setCrashUser,
  trackScreenView,
} from '@/lib/services/observability';
import { useAuthStore } from '@/store/auth-store';

export const unstable_settings = {
  anchor: 'splash',
};

/**
 * Root error boundary. expo-router picks this up via the `ErrorBoundary` named
 * export of a `_layout` file and wraps the route in `<Try catch={ErrorBoundary}>`
 * (see expo-router/build/useScreens.js `fromImport`).
 *
 * Scope caveat: this only catches errors thrown while RENDERING the tree below.
 * It cannot catch an exception thrown while this module is being *required* —
 * Metro's `guardedLoadModule` swallows those and hands expo-router `undefined`,
 * which is what produced the "Cannot read property 'ErrorBoundary' of undefined"
 * black-screen crash. That is why lib/firebase/config.ts is lazy and never
 * throws at module scope.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    reportError(error, 'root-error-boundary');
  }, [error]);

  return (
    <View style={styles.errorRoot}>
      <ScrollView contentContainerStyle={styles.errorContent}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error?.message ?? 'Unknown error'}</Text>
        {error?.stack ? <Text style={styles.errorStack}>{error.stack}</Text> : null}
        <Text style={styles.errorRetry} onPress={() => void retry()}>
          Tap to retry
        </Text>
      </ScrollView>
    </View>
  );
}

/** Redirects based on Firebase session + local onboarding once hydrated. */
function useAuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const hydrated = useAuthStore((s) => s.hydrated);
  const fbUser = useAuthStore((s) => s.fbUser);
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (!hydrated) return;
    const authed = !!fbUser && !!profile;
    const verified = !!fbUser?.emailVerified;
    const onboarded = !!profile?.onboarded;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';
    const inTabs = group === '(tabs)';

    if (!authed) {
      if (inTabs || inOnboarding) router.replace('/login');
    } else if (!verified) {
      if (inTabs || inOnboarding) router.replace('/verify-email');
    } else if (onboarded && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [hydrated, fbUser, profile, segments, router]);
}

/** Fires a screen_view analytics event on every route change. */
function useScreenTracking() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    trackScreenView(pathname);
  }, [pathname]);
}

export default function RootLayout() {
  const { isDark } = useAppTheme();
  const init = useAuthStore((s) => s.init);
  const fbUser = useAuthStore((s) => s.fbUser);
  useAuthGate();
  useScreenTracking();
  // Notification channels, delivery listeners and reminder (re)scheduling.
  useReminders();
  // Debounced Google Drive uploads — inert unless the user enabled auto backup.
  useAutoBackup();

  useEffect(() => {
    // Observability first, so any failure inside init() is captured.
    initObservability();
    void init();
  }, [init]);

  // Attribute analytics + crash reports to the signed-in user (cleared on logout).
  useEffect(() => {
    setAnalyticsUser(fbUser?.uid ?? null);
    setCrashUser(fbUser?.uid ?? null);
  }, [fbUser]);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <Stack>
          <Stack.Screen name="splash" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="add-class" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="add-task" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="daily-plan" options={{ headerShown: false }} />
          <Stack.Screen name="calendar" options={{ headerShown: false }} />
          <Stack.Screen name="ai-assistant" options={{ headerShown: false }} />
          <Stack.Screen name="daily-routine" options={{ headerShown: false }} />
          <Stack.Screen name="habits" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="reminders" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="language" options={{ headerShown: false }} />
          <Stack.Screen name="security" options={{ headerShown: false }} />
          <Stack.Screen name="privacy-policy" options={{ headerShown: false }} />
          <Stack.Screen name="terms" options={{ headerShown: false }} />
          <Stack.Screen name="about" options={{ headerShown: false }} />
          <Stack.Screen name="backup" options={{ headerShown: false }} />
          {/* Google OAuth deep-link landing route - see app/oauthredirect.tsx */}
          <Stack.Screen name="oauthredirect" options={{ headerShown: false }} />
          <Stack.Screen name="premium" options={{ headerShown: false }} />
          <Stack.Screen name="ai-schedule" options={{ headerShown: false }} />
          <Stack.Screen name="study-stats" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ToastProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorRoot: { flex: 1, backgroundColor: '#F6F5FF' },
  errorContent: { padding: 24, paddingTop: 72, gap: 12 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#1B1B2F' },
  errorMessage: { fontSize: 15, lineHeight: 22, color: '#E5484D' },
  errorStack: { fontSize: 11, lineHeight: 16, color: '#6E6B8A' },
  errorRetry: { marginTop: 16, fontSize: 16, fontWeight: '600', color: '#6C4DFF' },
});
