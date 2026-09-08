import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { firebaseConfig } from '@/lib/firebase/config';
import { useAuthStore } from '@/store/auth-store';

/** How often to quietly re-check verification while the screen is open. */
const POLL_INTERVAL_MS = 5000;

/** Firebase's default sender — worth naming, it is what people search spam for. */
const SENDER = `noreply@${firebaseConfig.authDomain ?? 'firebaseapp.com'}`;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const toast = useToast();
  const fbUser = useAuthStore((s) => s.fbUser);
  const onboarded = useAuthStore((s) => !!s.profile?.onboarded);
  const sendVerificationEmail = useAuthStore((s) => s.sendVerificationEmail);
  const refreshEmailVerified = useAuthStore((s) => s.refreshEmailVerified);
  const logout = useAuthStore((s) => s.logout);
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  /** Seconds left on the resend throttle; 0 means "you can tap now". */
  const [cooldown, setCooldown] = useState(0);
  /** Guards against two navigations racing (background poll + manual tap). */
  const navigated = useRef(false);

  const goOn = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace(onboarded ? '/(tabs)' : '/success');
  }, [onboarded, router]);

  // Poll while the screen is open, and re-check the moment the app returns to
  // the foreground — the flow is "leave for the mail app, tap the link, come
  // back", and nothing should need pressing after that.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || navigated.current) return;
      const verified = await refreshEmailVerified();
      if (!cancelled && verified) goOn();
    };

    void check();
    const interval = setInterval(() => void check(), POLL_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshEmailVerified, goOn]);

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!fbUser) return <Redirect href="/login" />;

  const checkAgain = async () => {
    setChecking(true);
    const verified = await refreshEmailVerified();
    setChecking(false);
    if (verified) {
      goOn();
    } else {
      toast.error('Still not verified. Check your inbox and spam folder, or resend the email.');
    }
  };

  const resend = async () => {
    setResending(true);
    const res = await sendVerificationEmail();
    setResending(false);
    if (res.ok) {
      setCooldown(res.cooldownSeconds);
      toast.success('Verification email sent. Check your inbox and spam folder.');
    } else {
      // A throttle refusal says exactly how long to disable the control for,
      // instead of letting the next tap hit the same wall.
      if (res.retryInSeconds) setCooldown(res.retryInSeconds);
      toast.error(res.error);
    }
  };

  const useAnotherAccount = async () => {
    await logout();
    router.replace('/login');
  };

  const resendDisabled = resending || cooldown > 0;
  const resendLabel = resending ? 'Sending…' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email';

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.content}>
            <View style={styles.badge}>
              <Ionicons name="mail-unread-outline" size={38} color={Palette.primary} />
            </View>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              We sent a verification link to {fbUser.email}. Open it, then come back — this screen continues on its
              own.
            </Text>
            <Text style={styles.hint}>Nothing yet? Check spam and promotions for a mail from {SENDER}.</Text>
            <View style={styles.form}>
              <Button title="I've Verified — Continue" onPress={checkAgain} loading={checking} />
              <Pressable hitSlop={8} onPress={resend} disabled={resendDisabled} style={styles.resend}>
                <Text style={[styles.resendText, resendDisabled && styles.resendTextDisabled]}>{resendLabel}</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={useAnotherAccount} style={styles.resend}>
                <Text style={styles.logoutText}>Use a different account</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1 },
    flex: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 60, alignItems: 'center' },
    badge: {
      width: 92,
      height: 92,
      borderRadius: 28,
      backgroundColor: Tint.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },
    title: { fontFamily: FontFamily, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: Palette.ink, textAlign: 'center' },
    subtitle: {
      fontFamily: FontFamily,
      fontSize: 15,
      fontWeight: '500',
      color: Palette.muted,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 10,
      lineHeight: 22,
      paddingHorizontal: 10,
    },
    hint: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '500',
      color: Palette.muted,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 19,
      paddingHorizontal: 10,
      opacity: 0.85,
    },
    form: { width: '100%' },
    resend: { alignSelf: 'center', marginTop: 18 },
    resendText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.primary },
    resendTextDisabled: { color: Palette.muted },
    logoutText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: Palette.muted },
  });
}
