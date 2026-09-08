/**
 * Backup & Sync — reached from the Profile screen's "Backup & Sync" row.
 *
 * The screen is deliberately explicit about *where* the data goes: users are
 * rightly suspicious of a "sync" button, so the copy names the Google Drive
 * folder, links straight to the file, and shows the account e-mail once
 * connected. All the real work lives in `store/backup-store.ts`; this file is
 * presentation plus confirmation dialogs for the destructive paths.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { BACKUP_FOLDER_NAME, driveConfigError } from '@/lib/services/google-drive';
import { useAuthStore } from '@/store/auth-store';
import { useBackupStore } from '@/store/backup-store';
import { useMyHabits } from '@/store/habits-store';
import { useMyClasses, useMyPlans, useMyTasks } from '@/store/planner-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * "just now" / "12 minutes ago" / "3 Aug 2026, 14:05".
 *
 * Relative for the first day (that is when "is my data safe?" is actually being
 * asked) and absolute after, because "17 days ago" is harder to act on than a
 * date.
 */
function formatWhen(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'Never';
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return 'Never';

  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function formatSize(bytes: number | undefined): string | null {
  if (!bytes || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                    */
/* -------------------------------------------------------------------------- */

export default function BackupScreen() {
  const router = useRouter();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const signedIn = useAuthStore((s) => !!s.fbUser);

  const connected = useBackupStore((s) => s.connected);
  const connectedEmail = useBackupStore((s) => s.connectedEmail);
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt);
  const lastRestoreAt = useBackupStore((s) => s.lastRestoreAt);
  const autoSync = useBackupStore((s) => s.autoSync);
  const phase = useBackupStore((s) => s.phase);
  const lastError = useBackupStore((s) => s.lastError);
  const cloud = useBackupStore((s) => s.cloud);

  const hydrate = useBackupStore((s) => s.hydrate);
  const refreshCloudInfo = useBackupStore((s) => s.refreshCloudInfo);
  const connectDrive = useBackupStore((s) => s.connect);
  const disconnectDrive = useBackupStore((s) => s.disconnect);
  const setAutoSync = useBackupStore((s) => s.setAutoSync);
  const backupNow = useBackupStore((s) => s.backupNow);
  const restoreNow = useBackupStore((s) => s.restoreNow);
  const deleteCloudBackup = useBackupStore((s) => s.deleteCloudBackup);

  const classes = useMyClasses();
  const tasks = useMyTasks();
  const plans = useMyPlans();
  const habits = useMyHabits();

  const configError = driveConfigError();
  const busy = phase !== 'idle';

  // Re-read the stored token on mount: the app may have been restarted, or the
  // grant revoked from the user's Google account page since last time.
  useEffect(() => {
    void hydrate().then(() => refreshCloudInfo());
  }, [hydrate, refreshCloudInfo]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                               */
  /* ---------------------------------------------------------------------- */

  const onConnect = async () => {
    if (configError) {
      toast.show(configError, 'error');
      return;
    }
    const res = await connectDrive();
    if (res.ok) toast.show('Google Drive connected.', 'success');
    else if (res.error) toast.show(res.error, 'error');
  };

  const onBackup = async () => {
    if (!signedIn) {
      toast.show('Sign in to your Smart Planner account first.', 'error');
      return;
    }
    const res = await backupNow();
    if (res.ok) toast.show('Backup saved to your Google Drive.', 'success');
    else if (res.error) toast.show(res.error, 'error');
  };

  const onRestore = () => {
    Alert.alert(
      'Restore from cloud',
      'This replaces the timetable, tasks, habits, chats and settings on this ' +
        'device with the copy stored in your Google Drive. Anything you added ' +
        'here since the last backup will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            const res = await restoreNow();
            if (res.ok) toast.show('Your data has been restored.', 'success');
            else if (res.error) toast.show(res.error, 'error');
          },
        },
      ],
    );
  };

  const onDeleteCloud = () => {
    Alert.alert(
      'Delete cloud backup',
      'The backup file in your Google Drive will be deleted. The data on this device is not touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteCloudBackup();
            if (res.ok) toast.show('Cloud backup deleted.', 'success');
            else if (res.error) toast.show(res.error, 'error');
          },
        },
      ],
    );
  };

  /**
   * `Linking` rather than an in-app browser: the Drive URL deep-links into the
   * Google Drive app when it is installed, which is where a user who wants to
   * "see the file" expects to land.
   */
  const onOpenInDrive = async () => {
    const url = cloud?.webViewLink;
    /* v8 ignore next */
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      toast.show('Could not open Google Drive on this device.', 'error');
    }
  };

  const onDisconnect = () => {
    Alert.alert(
      'Disconnect Google account',
      'Smart Planner will stop backing up and will forget your Google account. ' +
        'The backup already in your Drive is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnectDrive();
            toast.show('Google account disconnected.', 'info');
          },
        },
      ],
    );
  };

  /* ---------------------------------------------------------------------- */
  /* Rows                                                                  */
  /* ---------------------------------------------------------------------- */

  const included: { icon: IoniconName; label: string; count: number; colorKey: string; tintKey: string }[] = [
    { icon: 'calendar-outline', label: 'Timetable classes', count: classes.length, colorKey: 'primary', tintKey: 'primary' },
    { icon: 'checkbox-outline', label: 'Tasks', count: tasks.length, colorKey: 'blue', tintKey: 'blue' },
    { icon: 'today-outline', label: 'Daily plan items', count: plans.length, colorKey: 'green', tintKey: 'green' },
    { icon: 'flame-outline', label: 'Habits & history', count: habits.length, colorKey: 'pink', tintKey: 'pink' },
    { icon: 'chatbubbles-outline', label: 'AI chats', count: cloud?.summary?.chats ?? 0, colorKey: 'orange', tintKey: 'orange' },
  ];

  const colorFor = (key: string) => (Palette as unknown as Record<string, string>)[key];
  const tintFor = (key: string) => (Tint as unknown as Record<string, string>)[key];

  const phaseLabel =
    phase === 'connecting'
      ? 'Connecting to Google…'
      : phase === 'backing-up'
        ? 'Uploading your data…'
        : phase === 'restoring'
          ? 'Restoring your data…'
          : phase === 'checking'
            ? 'Checking your Drive…'
            : null;

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
          <Text style={styles.headerTitle}>Backup & Sync</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Setup warning — only when no OAuth client is configured in the build */}
          {configError ? (
            <View style={styles.warn}>
              <Ionicons name="warning-outline" size={18} color={Palette.orange} />
              <Text style={styles.warnText}>{configError}</Text>
            </View>
          ) : null}

          {/* Connection hero */}
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: connected ? Tint.green : Tint.primary }]}>
              <Ionicons
                name={connected ? 'cloud-done' : 'cloud-offline-outline'}
                size={26}
                color={connected ? Palette.green : Palette.primary}
              />
            </View>
            <Text style={styles.heroTitle}>
              {connected ? 'Google Drive connected' : 'Not connected'}
            </Text>
            <Text style={styles.heroSub}>
              {connected
                ? connectedEmail ?? 'Signed in with Google'
                : 'Save your timetable, tasks and habits to your own Google Drive so you can get them back on any phone.'}
            </Text>

            {connected ? (
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Last backup</Text>
                  <Text style={styles.statValue}>{formatWhen(lastBackupAt)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>In Drive</Text>
                  <Text style={styles.statValue}>
                    {cloud
                      ? formatSize(cloud.size) ?? formatWhen(cloud.modifiedTime)
                      : 'No backup yet'}
                  </Text>
                </View>
              </View>
            ) : null}

            {phaseLabel ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={Palette.primary} />
                <Text style={styles.busyText}>{phaseLabel}</Text>
              </View>
            ) : null}

            {lastError && !busy ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color="#E5484D" />
                <Text style={styles.errorText}>{lastError}</Text>
              </View>
            ) : null}

            {connected ? (
              <View style={styles.actions}>
                <Button
                  title="Back up now"
                  icon="cloud-upload-outline"
                  onPress={onBackup}
                  loading={phase === 'backing-up'}
                  disabled={busy}
                />
                <Button
                  title="Restore from cloud"
                  icon="cloud-download-outline"
                  variant="secondary"
                  onPress={onRestore}
                  loading={phase === 'restoring'}
                  disabled={busy || !cloud}
                />
                {!cloud && !busy ? (
                  <Text style={styles.hint}>
                    Nothing to restore yet — take your first backup above.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  title="Connect Google Drive"
                  icon="logo-google"
                  onPress={onConnect}
                  loading={phase === 'connecting'}
                  disabled={busy}
                />
              </View>
            )}
          </View>

          {/* Auto-sync */}
          {connected ? (
            <>
              <Text style={styles.sectionLabel}>Sync</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: Tint.blue }]}>
                    <Ionicons name="sync-outline" size={20} color={Palette.blue} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>Auto backup</Text>
                    <Text style={styles.rowSub}>
                      Upload quietly in the background after you make changes
                    </Text>
                  </View>
                  <Switch
                    value={autoSync}
                    onValueChange={setAutoSync}
                    trackColor={{ false: isDark ? '#3A3660' : '#D9D5EA', true: Palette.primary }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor={isDark ? '#3A3660' : '#D9D5EA'}
                  />
                </View>
                <View style={styles.divider} />
                <Pressable
                  onPress={() => void refreshCloudInfo()}
                  disabled={busy}
                  android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.rowIcon, { backgroundColor: Tint.primary }]}>
                    <Ionicons name="refresh-outline" size={20} color={Palette.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>Check cloud backup</Text>
                    <Text style={styles.rowSub}>
                      {cloud?.modifiedTime
                        ? `Drive copy updated ${formatWhen(cloud.modifiedTime)}`
                        : 'No backup file found in Drive'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
                </Pressable>
                {cloud?.webViewLink ? (
                  <>
                    <View style={styles.divider} />
                    <Pressable
                      onPress={() => void onOpenInDrive()}
                      android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                      <View style={[styles.rowIcon, { backgroundColor: Tint.green }]}>
                        <Ionicons name="open-outline" size={20} color={Palette.green} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>View in Google Drive</Text>
                        <Text style={styles.rowSub}>{`Saved in your "${BACKUP_FOLDER_NAME}" folder`}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
                    </Pressable>
                  </>
                ) : null}
                {lastRestoreAt ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                      <View style={[styles.rowIcon, { backgroundColor: Tint.green }]}>
                        <Ionicons name="time-outline" size={20} color={Palette.green} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowLabel}>Last restore</Text>
                        <Text style={styles.rowSub}>{formatWhen(lastRestoreAt)}</Text>
                      </View>
                    </View>
                  </>
                ) : null}
              </View>
            </>
          ) : null}

          {/* What gets backed up */}
          <Text style={styles.sectionLabel}>What gets backed up</Text>
          <View style={styles.card}>
            {included.map((item, i) => (
              <Fragment key={item.label}>
                <View style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: tintFor(item.tintKey) }]}>
                    <Ionicons name={item.icon} size={20} color={colorFor(item.colorKey)} />
                  </View>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowCount}>{item.count}</Text>
                </View>
                {i < included.length - 1 ? <View style={styles.divider} /> : null}
              </Fragment>
            ))}
          </View>
          <Text style={styles.note}>
            Your profile, preferences and app settings are included too. Passwords are never
            backed up.
          </Text>

          {/* Privacy explainer */}
          <View style={styles.privacy}>
            <Ionicons name="lock-closed-outline" size={18} color={Palette.primary} />
            <Text style={styles.privacyText}>
              {`The backup is saved as one file in a "${BACKUP_FOLDER_NAME}" folder in your own ` +
                'Google Drive, so you can open it there any time. Only you can see it — Smart ' +
                'Planner has no access to the rest of your Drive.'}
            </Text>
          </View>

          {/* Danger zone */}
          {connected ? (
            <>
              <Text style={styles.sectionLabel}>Manage</Text>
              <View style={styles.card}>
                <Pressable
                  onPress={onDeleteCloud}
                  disabled={busy || !cloud}
                  android_ripple={{ color: 'rgba(229,72,77,0.08)' }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.rowIcon, { backgroundColor: '#FDE7E8' }]}>
                    <Ionicons name="trash-outline" size={20} color="#E5484D" />
                  </View>
                  <Text style={[styles.rowLabel, !cloud && styles.rowLabelDim]}>
                    Delete cloud backup
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
                </Pressable>
                <View style={styles.divider} />
                <Pressable
                  onPress={onDisconnect}
                  disabled={busy}
                  android_ripple={{ color: 'rgba(229,72,77,0.08)' }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.rowIcon, { backgroundColor: '#FDE7E8' }]}>
                    <Ionicons name="log-out-outline" size={20} color="#E5484D" />
                  </View>
                  <Text style={styles.rowLabel}>Disconnect Google account</Text>
                  <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
                </Pressable>
              </View>
            </>
          ) : null}

          <Text style={styles.footer}>Smart Planner · Backup v1</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette, Tint: AppTint) {
  const CARD_SHADOW = {
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  } as const;

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

    warn: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      backgroundColor: Tint.orange,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
    },
    warnText: {
      flex: 1,
      fontFamily: FontFamily,
      fontSize: 12.5,
      fontWeight: '600',
      lineHeight: 18,
      color: Palette.ink,
    },

    hero: {
      backgroundColor: Palette.card,
      borderRadius: 24,
      padding: 20,
      alignItems: 'center',
      ...CARD_SHADOW,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    heroTitle: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: Palette.ink },
    heroSub: {
      fontFamily: FontFamily,
      fontSize: 13.5,
      fontWeight: '500',
      color: Palette.muted,
      textAlign: 'center',
      lineHeight: 19,
      marginTop: 6,
    },

    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: Tint.primary,
      borderRadius: 18,
      paddingVertical: 12,
      marginTop: 16,
    },
    stat: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 8 },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Palette.hairline },
    statLabel: {
      fontFamily: FontFamily,
      fontSize: 11,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    statValue: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.ink,
      textAlign: 'center',
    },

    busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    busyText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: Palette.muted },

    errorRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      alignSelf: 'stretch',
      marginTop: 14,
    },
    errorText: {
      flex: 1,
      fontFamily: FontFamily,
      fontSize: 12.5,
      fontWeight: '600',
      lineHeight: 18,
      color: '#E5484D',
    },

    actions: { alignSelf: 'stretch', gap: 10, marginTop: 18 },
    hint: {
      fontFamily: FontFamily,
      fontSize: 12.5,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
    },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 24,
      marginBottom: 12,
      marginLeft: 4,
    },

    card: {
      backgroundColor: Palette.card,
      borderRadius: 22,
      paddingHorizontal: 16,
      ...CARD_SHADOW,
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    rowPressed: { opacity: 0.6 },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    rowText: { flex: 1, gap: 2, marginRight: 10 },
    rowLabel: { flex: 1, fontFamily: FontFamily, fontSize: 15.5, fontWeight: '600', color: Palette.ink },
    rowLabelDim: { color: Palette.subtle },
    rowSub: { fontFamily: FontFamily, fontSize: 12.5, fontWeight: '500', color: Palette.muted, lineHeight: 17 },
    rowCount: { fontFamily: FontFamily, fontSize: 15, fontWeight: '800', color: Palette.primary },
    divider: { height: 1, backgroundColor: Palette.hairline, marginLeft: 54 },

    note: {
      fontFamily: FontFamily,
      fontSize: 12.5,
      fontWeight: '500',
      color: Palette.subtle,
      lineHeight: 18,
      marginTop: 10,
      marginHorizontal: 4,
    },

    privacy: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
      backgroundColor: Tint.primary,
      borderRadius: 18,
      padding: 14,
      marginTop: 18,
    },
    privacyText: {
      flex: 1,
      fontFamily: FontFamily,
      fontSize: 12.5,
      fontWeight: '500',
      lineHeight: 18,
      color: Palette.ink,
    },

    footer: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '500',
      color: Palette.subtle,
      textAlign: 'center',
      marginTop: 26,
    },
  });
}
