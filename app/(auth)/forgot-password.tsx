import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { validateEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/auth-store';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  /** Seconds left on the resend throttle; 0 means "you can tap now". */
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async () => {
    const err = validateEmail(email);
    setError(err);
    if (err) return;
    setLoading(true);
    const res = await forgotPassword(email);
    setLoading(false);
    if (res.ok) {
      setCooldown(res.cooldownSeconds);
      setSent(true);
      toast.success(t('auth.forgotPassword.sentToast'));
    } else {
      if (res.retryInSeconds) setCooldown(res.retryInSeconds);
      toast.error(res.error);
    }
  };

  const resendDisabled = loading || cooldown > 0;
  const resendLabel =
    cooldown > 0
      ? t('auth.forgotPassword.resendLabelCountdown', { seconds: cooldown })
      : t('auth.forgotPassword.resendLabel');

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Pressable hitSlop={10} onPress={() => router.replace('/login')} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={Palette.ink} />
        </Pressable>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.content}>
            {sent ? (
              <>
                <View style={[styles.badge, { backgroundColor: '#E4F9EA' }]}>
                  <Ionicons name="mail-open-outline" size={38} color={Palette.green} />
                </View>
                <Text style={styles.title}>{t('auth.forgotPassword.checkInboxTitle')}</Text>
                {/*
                  Deliberately "if an account exists": with Firebase's email
                  enumeration protection on (the default), the backend returns
                  success for an unregistered address and sends nothing — so
                  promising a delivered email here would be a lie for exactly
                  the user who is confused about why none arrived.
                */}
                <Text style={styles.subtitle}>
                  {t('auth.forgotPassword.checkInboxSubtitle', { email })}
                </Text>
                <View style={styles.form}>
                  <Button title={t('auth.forgotPassword.backToLogin')} onPress={() => router.replace('/login')} />
                  <Pressable hitSlop={8} onPress={submit} disabled={resendDisabled} style={styles.resend}>
                    <Text style={[styles.resendText, resendDisabled && styles.resendTextDisabled]}>
                      {resendLabel}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.badge}>
                  <Ionicons name="lock-closed-outline" size={38} color={Palette.primary} />
                </View>
                <Text style={styles.title}>{t('auth.forgotPassword.title')}</Text>
                <Text style={styles.subtitle}>{t('auth.forgotPassword.subtitle')}</Text>
                <View style={styles.form}>
                  <TextField label={t('common.email')} value={email} onChangeText={setEmail} placeholder={t('common.emailPlaceholder')} icon="mail-outline" keyboardType="email-address" error={error} onSubmitEditing={submit} />
                  <Button title={t('auth.forgotPassword.sendResetLink')} onPress={submit} loading={loading} />
                  <Pressable hitSlop={8} onPress={() => router.replace('/login')} style={styles.resend}>
                    <Text style={styles.resendText}>{t('auth.forgotPassword.backToLoginLink')}</Text>
                  </Pressable>
                </View>
              </>
            )}
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
    back: { width: 42, height: 42, borderRadius: 14, backgroundColor: Palette.card, alignItems: 'center', justifyContent: 'center', marginLeft: 16, marginTop: 4 },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 30, alignItems: 'center' },
    badge: { width: 92, height: 92, borderRadius: 28, backgroundColor: Tint.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    title: { fontFamily: FontFamily, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: Palette.ink, textAlign: 'center' },
    subtitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.muted, textAlign: 'center', marginTop: 10, marginBottom: 28, lineHeight: 22, paddingHorizontal: 10 },
    form: { width: '100%' },
    resend: { alignSelf: 'center', marginTop: 18 },
    resendText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.primary },
    resendTextDisabled: { color: Palette.muted },
  });
}
