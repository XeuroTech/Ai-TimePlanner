import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuthStore } from '@/store/auth-store';

export default function SecurityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const fbUser = useAuthStore((s) => s.fbUser);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const sendVerificationEmail = useAuthStore((s) => s.sendVerificationEmail);
  const refreshEmailVerified = useAuthStore((s) => s.refreshEmailVerified);

  const [sendingReset, setSendingReset] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [sendingVerify, setSendingVerify] = useState(false);
  const [verifyCooldown, setVerifyCooldown] = useState(0);

  useEffect(() => {
    void refreshEmailVerified();
  }, [refreshEmailVerified]);

  useEffect(() => {
    if (resetCooldown <= 0 && verifyCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResetCooldown((s) => Math.max(0, s - 1));
      setVerifyCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [resetCooldown, verifyCooldown]);

  const changePassword = async () => {
    if (!fbUser?.email || sendingReset || resetCooldown > 0) return;
    setSendingReset(true);
    const res = await forgotPassword(fbUser.email);
    setSendingReset(false);
    if (res.ok) {
      setResetCooldown(res.cooldownSeconds);
      toast.success(t('security.resetLinkSentToast', { email: fbUser.email }));
    } else {
      if (res.retryInSeconds) setResetCooldown(res.retryInSeconds);
      toast.show(res.error, 'error');
    }
  };

  const resendVerification = async () => {
    if (sendingVerify || verifyCooldown > 0) return;
    setSendingVerify(true);
    const res = await sendVerificationEmail();
    setSendingVerify(false);
    if (res.ok) {
      setVerifyCooldown(res.cooldownSeconds);
      toast.success(t('security.verificationSentToast'));
    } else {
      if (res.retryInSeconds) setVerifyCooldown(res.retryInSeconds);
      toast.show(res.error, 'error');
    }
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
          <Text style={styles.headerTitle}>{t('security.title')}</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionLabel}>{t('security.accountSection')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: Tint.primary }]}>
                <Ionicons name="mail-outline" size={20} color={Palette.primary} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{t('security.signedInAs')}</Text>
                <Text style={styles.rowSub}>{fbUser?.email ?? '—'}</Text>
              </View>
              {fbUser?.emailVerified ? (
                <View style={styles.verifiedChip}>
                  <Ionicons name="checkmark-circle" size={13} color={Palette.green} />
                  <Text style={styles.verifiedText}>{t('security.verified')}</Text>
                </View>
              ) : (
                <Pressable onPress={resendVerification} disabled={sendingVerify || verifyCooldown > 0} style={styles.pillBtn}>
                  <Text style={styles.pillBtnText}>
                    {sendingVerify ? t('auth.verifyEmail.resendSending') : verifyCooldown > 0 ? t('security.waitSeconds', { seconds: verifyCooldown }) : t('security.verifyAction')}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <Text style={styles.sectionLabel}>{t('security.passwordSection')}</Text>
          <Pressable
            onPress={changePassword}
            disabled={sendingReset || resetCooldown > 0}
            android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
            style={({ pressed }) => [styles.card, styles.row, pressed && styles.rowPressed]}>
            <View style={[styles.rowIcon, { backgroundColor: Tint.blue }]}>
              <Ionicons name="lock-closed-outline" size={20} color={Palette.blue} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>{t('security.changePasswordLabel')}</Text>
              <Text style={styles.rowSub}>
                {resetCooldown > 0 ? t('security.resendInSeconds', { seconds: resetCooldown }) : t('security.willEmailResetLink')}
              </Text>
            </View>
            {sendingReset ? null : <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />}
          </Pressable>

          <Text style={styles.footnote}>
            {t('security.footnote')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: Palette.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 20,
      marginBottom: 12,
      marginLeft: 4,
    },

    card: {
      backgroundColor: Palette.card,
      borderRadius: 22,
      paddingHorizontal: 16,
      shadowColor: '#3A2E7A',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    rowPressed: { opacity: 0.85 },
    rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    rowBody: { flex: 1 },
    rowLabel: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
    rowSub: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },

    verifiedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Tint.green,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    verifiedText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: Palette.green },

    pillBtn: {
      backgroundColor: Palette.primary,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    pillBtnText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

    footnote: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 20,
      lineHeight: 18,
      paddingHorizontal: 8,
    },
  });
}
