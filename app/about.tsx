import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COMPANY_NAME, SUPPORT_EMAIL } from '@/constants/company';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;
type Row = { id: string; label: string; icon: IoniconName; onPress: () => void };

export default function AboutScreen() {
  const router = useRouter();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const LEGAL: Row[] = [
    { id: 'privacy', label: 'Privacy Policy', icon: 'shield-checkmark-outline', onPress: () => router.push('/privacy-policy') },
    { id: 'terms', label: 'Terms & Conditions', icon: 'document-text-outline', onPress: () => router.push('/terms') },
  ];

  const CONTACT: Row[] = [
    { id: 'email', label: SUPPORT_EMAIL, icon: 'mail-outline', onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`) },
  ];

  const renderRow = (row: Row, isLast: boolean) => (
    <Fragment key={row.id}>
      <Pressable
        onPress={row.onPress}
        android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={[styles.rowIcon, { backgroundColor: Tint.primary }]}>
          <Ionicons name={row.icon} size={18} color={Palette.primary} />
        </View>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
      </Pressable>
      {!isLast ? <View style={styles.divider} /> : null}
    </Fragment>
  );

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
          <Text style={styles.headerTitle}>About</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <View style={styles.appIcon}>
              <Ionicons name="calendar" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.appName}>Smart Planner</Text>
            <Text style={styles.appTagline}>AI Timetable & Study Planner</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
          </View>

          <Text style={styles.sectionLabel}>Legal</Text>
          <View style={styles.card}>{LEGAL.map((r, i) => renderRow(r, i === LEGAL.length - 1))}</View>

          <Text style={styles.sectionLabel}>Contact</Text>
          <View style={styles.card}>{CONTACT.map((r, i) => renderRow(r, i === CONTACT.length - 1))}</View>

          <Text style={styles.footnote}>Made with care for students, professionals and everyone in between.</Text>
          <Text style={styles.copyright}>© {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</Text>
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

    hero: { alignItems: 'center', paddingVertical: 24 },
    appIcon: {
      width: 84,
      height: 84,
      borderRadius: 26,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    appName: { fontFamily: FontFamily, fontSize: 22, fontWeight: '800', color: Palette.ink },
    appTagline: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, marginTop: 4 },
    appVersion: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.subtle, marginTop: 10 },

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
    rowPressed: { opacity: 0.6 },
    rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    rowLabel: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink },
    divider: { height: 1, backgroundColor: Palette.hairline, marginLeft: 50 },

    footnote: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 24,
    },
    copyright: {
      fontFamily: FontFamily,
      fontSize: 11,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 8,
    },
  });
}
