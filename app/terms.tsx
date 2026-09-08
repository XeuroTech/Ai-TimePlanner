import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COMPANY_NAME, SUPPORT_EMAIL } from '@/constants/company';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

const LAST_UPDATED = 'September 2026';

export default function TermsScreen() {
  const router = useRouter();
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

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
          <Text style={styles.headerTitle}>Terms &amp; Conditions</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

          <P styles={styles}>
            By creating an account or using Smart Planner ({'"'}the app{'"'}), developed and operated by{' '}
            {COMPANY_NAME}, you agree to these terms. If you don&apos;t agree, please don&apos;t use the app.
          </P>

          <H styles={styles}>The service</H>
          <P styles={styles}>
            Smart Planner helps you organize classes, tasks, habits and daily plans, and offers an AI Assistant
            for study/schedule suggestions. It&apos;s a personal productivity tool — it doesn&apos;t replace
            professional academic, medical or financial advice.
          </P>

          <H styles={styles}>Your account</H>
          <P styles={styles}>
            You&apos;re responsible for the accuracy of the information you provide and for keeping your login
            credentials safe. Let us know if you believe your account has been accessed without permission.
          </P>

          <H styles={styles}>AI-generated content</H>
          <P styles={styles}>
            Study plans, schedules and replies from the AI Assistant are generated automatically and may be
            incomplete or inaccurate. Review anything the assistant suggests before relying on it — you&apos;re
            responsible for how you use it.
          </P>

          <H styles={styles}>Premium subscription</H>
          <P styles={styles}>
            Some features may be offered under a paid Premium plan. Pricing, billing cycle and cancellation
            terms are shown at the time of purchase. Refunds, where applicable, follow the policy of the store
            you purchased through.
          </P>

          <H styles={styles}>Acceptable use</H>
          <Bullet styles={styles}>Don&apos;t use the app for anything illegal or that infringes others&apos; rights.</Bullet>
          <Bullet styles={styles}>Don&apos;t try to disrupt, reverse-engineer or abuse the app or its AI features.</Bullet>
          <Bullet styles={styles}>Don&apos;t misuse the AI Assistant to generate harmful or abusive content.</Bullet>

          <H styles={styles}>Third-party services</H>
          <P styles={styles}>
            The app relies on Firebase (authentication, analytics, crash reporting), Groq (AI Assistant) and,
            if you enable it, Google Drive (backup). Your use of those features is also subject to those
            providers&apos; own terms.
          </P>

          <H styles={styles}>Termination</H>
          <P styles={styles}>
            You can delete your account at any time from the Profile screen. We may suspend or terminate access
            for accounts that violate these terms.
          </P>

          <H styles={styles}>Disclaimer &amp; limitation of liability</H>
          <P styles={styles}>
            The app is provided {'"'}as is{'"'}, without warranties of any kind. To the extent permitted by law,
            we aren&apos;t liable for missed deadlines, lost data or other damages arising from your use of the
            app.
          </P>

          <H styles={styles}>Changes to these terms</H>
          <P styles={styles}>
            If these terms change in a meaningful way, we&apos;ll update the date above so you can tell at a
            glance.
          </P>

          <H styles={styles}>Contact</H>
          <P styles={styles}>
            Questions about these terms? Reach {COMPANY_NAME} at {SUPPORT_EMAIL}.
          </P>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function H({ children, styles }: { children: ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <Text style={styles.h2}>{children}</Text>;
}
function P({ children, styles }: { children: ReactNode; styles: ReturnType<typeof createStyles> }) {
  return <Text style={styles.p}>{children}</Text>;
}
function Bullet({ children, styles }: { children: ReactNode; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

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

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    updated: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.subtle, marginBottom: 16 },

    h2: { fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.ink, marginTop: 20, marginBottom: 8 },
    p: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, lineHeight: 21 },

    bulletRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Palette.subtle, marginTop: 8 },
    bulletText: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, lineHeight: 21 },
  });
}
