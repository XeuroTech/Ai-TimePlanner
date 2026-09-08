import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePremium } from '@/hooks/use-premium';
import { languageLabel } from '@/lib/services/locale';
import { useAuthStore } from '@/store/auth-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

type ItemId = 'account' | 'plan' | 'language' | 'security' | 'privacy' | 'terms' | 'about';
type Item = { id: ItemId; label: string; icon: IoniconName; colorKey: string; tintKey: string; value?: string };

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function SettingsScreen() {
  const router = useRouter();
  const { Palette, Tint, isDark } = useAppTheme();
  const profile = useAuthStore((s) => s.profile);
  const { isPremium } = usePremium();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const neutralTint = isDark ? '#26243D' : '#EEF0F4';

  const SECTIONS: { title: string; items: Item[] }[] = [
    {
      title: 'General',
      items: [
        { id: 'account', label: 'Account', icon: 'person-circle-outline', colorKey: 'primary', tintKey: 'primary', value: profile?.name ?? 'Guest' },
        { id: 'plan', label: 'Subscription', icon: 'diamond-outline', colorKey: 'primary', tintKey: 'primary', value: isPremium ? 'Premium' : 'Free' },
        { id: 'language', label: 'Language', icon: 'language-outline', colorKey: 'green', tintKey: 'green', value: languageLabel(profile?.preferences.language) },
      ],
    },
    {
      title: 'Privacy & Data',
      items: [
        { id: 'security', label: 'Security', icon: 'lock-closed-outline', colorKey: 'blue', tintKey: 'blue' },
        { id: 'privacy', label: 'Privacy', icon: 'shield-checkmark-outline', colorKey: 'secondary', tintKey: 'primary' },
        { id: 'terms', label: 'Terms & Conditions', icon: 'document-text-outline', colorKey: 'orange', tintKey: 'orange' },
      ],
    },
    {
      title: 'Support',
      items: [{ id: 'about', label: 'About', icon: 'information-circle-outline', colorKey: 'muted', tintKey: 'neutral', value: 'v1.0.0' }],
    },
  ];

  const ROUTES: Record<ItemId, '/profile' | '/premium' | '/language' | '/security' | '/privacy-policy' | '/terms' | '/about'> = {
    account: '/profile',
    plan: '/premium',
    language: '/language',
    security: '/security',
    privacy: '/privacy-policy',
    terms: '/terms',
    about: '/about',
  };

  const onPressItem = (id: ItemId) => router.push(ROUTES[id]);

  const colorFor = (key: string) => (Palette as unknown as Record<string, string>)[key];
  const tintFor = (key: string) => (key === 'neutral' ? neutralTint : (Tint as unknown as Record<string, string>)[key]);

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={22} color={Palette.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {SECTIONS.map((section) => (
            <View key={section.title}>
              <Text style={styles.sectionLabel}>{section.title}</Text>
              <View style={styles.card}>
                {section.items.map((item, i) => (
                  <Fragment key={item.id}>
                    <Pressable
                      onPress={() => onPressItem(item.id)}
                      android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                      <View style={[styles.rowIcon, { backgroundColor: tintFor(item.tintKey) }]}>
                        <Ionicons name={item.icon} size={20} color={colorFor(item.colorKey)} />
                      </View>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      {item.value ? <Text style={styles.rowValue}>{item.value}</Text> : null}
                      <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
                    </Pressable>
                    {i < section.items.length - 1 ? <View style={styles.divider} /> : null}
                  </Fragment>
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.footer}>Smart Planner · v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
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
    rowPressed: { opacity: 0.6 },
    rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    rowLabel: { flex: 1, fontFamily: FontFamily, fontSize: 16, fontWeight: '600', color: Palette.ink },
    rowValue: { fontFamily: FontFamily, fontSize: 14, fontWeight: '600', color: Palette.muted, marginRight: 6 },
    divider: { height: 1, backgroundColor: Palette.hairline, marginLeft: 54 },

    footer: { fontFamily: FontFamily, fontSize: 12, fontWeight: '500', color: Palette.subtle, textAlign: 'center', marginTop: 24 },
  });
}
