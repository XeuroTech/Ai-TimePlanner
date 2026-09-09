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

export default function PrivacyPolicyScreen() {
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
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

          <P styles={styles}>
            Smart Planner ({'"'}the app{'"'}) is a personal timetable and study-planning tool, developed and
            operated by {COMPANY_NAME}. This policy explains what data the app handles and why.
          </P>

          <H styles={styles}>What&apos;s stored on your device</H>
          <P styles={styles}>
            Your classes, tasks, daily plans, habits, reminders and AI chat history are stored locally in a
            database on your device. They are not uploaded to our servers, and we cannot see them.
          </P>

          <H styles={styles}>Your account</H>
          <P styles={styles}>
            Signing in uses Firebase Authentication. We keep your name, email address and a securely hashed
            password to identify your account — never your plain password. This is the only personal data that
            leaves your device by default.
          </P>

          <H styles={styles}>AI Assistant</H>
          <P styles={styles}>
            Messages you send to the AI Assistant are sent to Groq, our AI provider, to generate a reply. Groq
            processes that text under its own privacy terms; we don&apos;t send it anywhere else, and your other
            app data (tasks, classes, habits) is never included unless you type it yourself.
          </P>

          <H styles={styles}>Cloud Backup (optional)</H>
          <P styles={styles}>
            If you connect Google Drive under Backup &amp; Sync, a copy of your local data is uploaded to a
            backup file in your own Google Drive — a place only you control. We never see or store that file
            ourselves. Turning the feature off, or disconnecting, stops all future uploads.
          </P>

          <H styles={styles}>Analytics &amp; crash reports</H>
          <P styles={styles}>
            On devices where it&apos;s available, the app uses Firebase Analytics and Crashlytics to see which
            features are used and to catch crashes — this is anonymized usage data, not the content of your
            tasks or notes.
          </P>

          <H styles={styles}>What we don&apos;t do</H>
          <Bullet styles={styles}>We don&apos;t sell your data.</Bullet>
          <Bullet styles={styles}>We don&apos;t show ads.</Bullet>
          <Bullet styles={styles}>We don&apos;t read your tasks, classes or habits — they stay on your device.</Bullet>

          <H styles={styles}>Deleting your data</H>
          <P styles={styles}>
            {'Delete Account'} on your Profile screen permanently removes your Firebase account, your AI chat
            history and your local profile. Uninstalling the app removes everything else stored on the device.
            If you have a cloud backup, delete it separately from the Backup &amp; Sync screen.
          </P>

          <H styles={styles}>Changes to this policy</H>
          <P styles={styles}>
            If this policy changes in a meaningful way, we&apos;ll update the date above so you can tell at a
            glance.
          </P>

          <H styles={styles}>Contact</H>
          <P styles={styles}>
            Questions about privacy? Reach {COMPANY_NAME} at {SUPPORT_EMAIL}.
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
