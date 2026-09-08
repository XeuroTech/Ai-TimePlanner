import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { validateMatch, validateName, validatePassword, validateSignupEmail } from '@/lib/validation';
import { useAuthStore } from '@/store/auth-store';

export default function RegisterScreen() {
  const router = useRouter();
  const toast = useToast();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.status === 'loading');
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const scrollRef = useRef<ScrollView>(null);

  const submit = async () => {
    const next = {
      name: validateName(name),
      // Sign-up specific: also rejects addresses that provably cannot receive
      // the verification email (typo'd providers, placeholder and disposable
      // domains), so nobody ends up locked out of an unverifiable account.
      email: validateSignupEmail(email),
      password: validatePassword(password),
      confirm: validateMatch(password, confirm),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const res = await register({ name, email, password });
    if (res.ok) {
      // The account can exist while the verification email failed to send —
      // never point the user at an inbox that will stay empty.
      if (res.verificationSent === false) {
        toast.error(
          res.verificationError
            ? `Account created, but the verification email failed: ${res.verificationError}`
            : 'Account created, but the verification email could not be sent. Tap "Resend email".',
        );
      } else {
        toast.success('Account created! Check your inbox (and spam) to verify your email.');
      }
      router.replace('/verify-email');
    } else {
      toast.error(res.error ?? 'Could not create account.');
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
              <Ionicons name="sparkles" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>Your AI planner, tailored to you.</Text>

            <View style={styles.form}>
              <TextField label="Full Name" value={name} onChangeText={setName} placeholder="Jane Doe" icon="person-outline" autoCapitalize="words" error={errors.name} />
              <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" icon="mail-outline" keyboardType="email-address" error={errors.email} />
              <TextField label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" icon="lock-closed-outline" secure error={errors.password} />
              <TextField
                label="Confirm Password"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter password"
                icon="lock-closed-outline"
                secure
                error={errors.confirm}
                onSubmitEditing={submit}
                onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
              />

              <Button title="Create Account" onPress={submit} loading={loading} style={styles.cta} />
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Pressable hitSlop={8} onPress={() => router.replace('/login')}>
                <Text style={styles.footerLink}>Log in</Text>
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
    scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 30, flexGrow: 1 },
    logo: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    title: { fontFamily: FontFamily, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: Palette.ink },
    subtitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.muted, marginTop: 8, marginBottom: 24 },
    form: { flex: 1 },
    cta: { marginTop: 8 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    footerText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted },
    footerLink: { fontFamily: FontFamily, fontSize: 14, fontWeight: '800', color: Palette.primary },
  });
}
