import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { deviceLanguages } from '@/lib/services/locale';
import { useAuthStore } from '@/store/auth-store';

export default function LanguageScreen() {
  const router = useRouter();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [saving, setSaving] = useState<string | null>(null);

  // Every language this device is actually configured with — the same list
  // iOS/Android's own "Preferred Languages" picker would show.
  const languages = useMemo(() => deviceLanguages(), []);
  const selected = profile?.preferences.language;

  const choose = async (code: string) => {
    if (saving) return;
    setSaving(code);
    await updateProfile({ preferences: { language: code } });
    setSaving(null);
    toast.success('Language preference saved.');
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
          <Text style={styles.headerTitle}>Language</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.banner}>
            <Ionicons name="information-circle" size={18} color={Palette.primary} />
            <Text style={styles.bannerText}>
              This saves which language you&apos;d like Smart Planner in. Full in-app translation is on the
              roadmap — for now the app stays in English while we roll it out.
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Languages on this device</Text>
          <View style={styles.card}>
            {languages.map((lang, i) => {
              const active = lang.code === selected;
              return (
                <Fragment key={lang.code}>
                  <Pressable
                    onPress={() => choose(lang.code)}
                    disabled={!!saving}
                    android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowLabel}>{lang.nativeLabel}</Text>
                      {lang.nativeLabel !== lang.label ? <Text style={styles.rowSub}>{lang.label}</Text> : null}
                    </View>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={22} color={Palette.primary} />
                    ) : (
                      <View style={styles.radio} />
                    )}
                  </Pressable>
                  {i < languages.length - 1 ? <View style={styles.divider} /> : null}
                </Fragment>
              );
            })}
          </View>
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

    banner: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: Tint.primary,
      borderRadius: 18,
      padding: 14,
      marginBottom: 8,
    },
    bannerText: { flex: 1, fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.ink, lineHeight: 19 },

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
    rowBody: { flex: 1 },
    rowLabel: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.ink },
    rowSub: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Palette.hairline },
    divider: { height: 1, backgroundColor: Palette.hairline },
  });
}
