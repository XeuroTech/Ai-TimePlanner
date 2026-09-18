import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { validateEmail, validatePassword } from '@/lib/validation';
import { useAuthStore } from '@/store/auth-store';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const login = useAuthStore((s) => s.login);
  const sendVerificationEmail = useAuthStore((s) => s.sendVerificationEmail);
  const loading = useAuthStore((s) => s.status === 'loading');
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const scrollRef = useRef<ScrollView>(null);

  const goNext = (onboarded: boolean) => router.replace(onboarded ? '/(tabs)' : '/category');

  /**
   * The sign-in itself succeeded, so `auth.currentUser` is set even though the
   * address is unverified — which is exactly what lets us resend from here
   * without sending the user back through the login form.
   */
  const resendVerification = async () => {
    const res = await sendVerificationEmail();
    if (res.ok) toast.success(t('auth.login.verificationSentToast'));
    else toast.error(res.error);
  };

  const promptForVerification = () => {
    Alert.alert(
      t('auth.login.verifyEmailAlertTitle'),
      t('auth.login.verifyEmailAlertMessage', { email: email.trim() }),
      [
        // `onPress` is sync, so the async resend is fired and left to report
        // itself through the toast.
        { text: t('auth.login.resendEmailAction'), onPress: () => void resendVerification() },
        { text: t('auth.login.continueAction'), style: 'cancel', onPress: () => router.replace('/verify-email') },
      ],
      { cancelable: true, onDismiss: () => router.replace('/verify-email') },
    );
  };

  const submit = async () => {
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);
    setErrors({ email: emailErr, password: passErr });
    if (emailErr || passErr) return;

    const res = await login(email, password, remember);
    if (res.ok) {
      if (res.emailVerified === false) {
        promptForVerification();
      } else {
        toast.success(t('auth.login.welcomeBackToast'));
        goNext(!!res.onboarded);
      }
    } else {
      toast.error(res.error ?? t('auth.login.loginFailedFallback'));
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.logo}>
              <Ionicons name="calendar-clear" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>{t('auth.login.title')}</Text>
            <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>

            <View style={styles.form}>
              <TextField label={t('common.email')} value={email} onChangeText={setEmail} placeholder={t('common.emailPlaceholder')} icon="mail-outline" keyboardType="email-address" error={errors.email} />
              <TextField
                label={t('common.password')}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.login.passwordPlaceholder')}
                icon="lock-closed-outline"
                secure
                error={errors.password}
                onSubmitEditing={submit}
                onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
              />

              <View style={styles.row}>
                <Pressable style={styles.remember} hitSlop={8} onPress={() => setRemember((r) => !r)}>
                  <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                    {remember ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={styles.rememberText}>{t('auth.login.rememberMe')}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => router.push('/forgot-password')}>
                  <Text style={styles.link}>{t('auth.login.forgotPassword')}</Text>
                </Pressable>
              </View>

              <Button title={t('auth.login.cta')} onPress={submit} loading={loading} style={styles.cta} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.login.footerText')}</Text>
              <Pressable hitSlop={8} onPress={() => router.replace('/register')}>
                <Text style={styles.footerLink}>{t('auth.login.footerLink')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1 },
    flex: { flex: 1 },
    scroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 30, flexGrow: 1 },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    title: { fontFamily: FontFamily, fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: Palette.ink },
    subtitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.muted, marginTop: 8, marginBottom: 28 },
    form: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 24 },
    remember: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: '#CFC7F0', alignItems: 'center', justifyContent: 'center' },
    checkboxOn: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    rememberText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: Palette.muted },
    link: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.primary },
    cta: { marginTop: 4 },

    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    footerText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted },
    footerLink: { fontFamily: FontFamily, fontSize: 14, fontWeight: '800', color: Palette.primary },
  });
}
