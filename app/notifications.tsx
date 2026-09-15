import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { getNotificationDiagnostics, sendTestNotification } from '@/lib/services/notifications';
import { type InboxItem, useMyNotifications, useNotificationStore } from '@/store/notification-store';

type IoniconName = keyof typeof Ionicons.glyphMap;
type Group = 'Today' | 'Yesterday' | 'Earlier';
const GROUP_ORDER: Group[] = ['Today', 'Yesterday', 'Earlier'];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Buckets a delivery timestamp by calendar day (not by elapsed hours). */
function groupOf(at: number): Group {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (at >= startOfToday.getTime()) return 'Today';
  if (at >= startOfToday.getTime() - DAY_MS) return 'Yesterday';
  return 'Earlier';
}

/** `4:05 PM` for today/yesterday, `12 Mar` for anything older. */
function timeLabel(at: number, group: Group): string {
  const d = new Date(at);
  if (group === 'Earlier') {
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function NotificationsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { Palette, Tint, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

  const items = useMyNotifications();
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);
  const clear = useNotificationStore((s) => s.clear);

  const unread = items.filter((n) => !n.read).length;

  /**
   * Sends a real one-off notification so the user can confirm delivery
   * works. On failure, checks current permission to explain *why* rather
   * than showing a generic error.
   */
  const onSendTest = async () => {
    try {
      const ok = await sendTestNotification();
      if (ok) {
        toast.success('Test notification scheduled — it will arrive in about 5 seconds.');
        return;
      }
      const diag = await getNotificationDiagnostics();
      if (diag.permission === 'granted') {
        toast.show(
          'Permission is granted but the reminder could not be scheduled. Try again in a moment.',
          'error',
        );
      } else if (diag.permission === 'denied' && !diag.canAskAgain) {
        toast.show('Notifications are blocked. Enable them in system settings.', 'error');
      } else {
        toast.show('Notification permission is not granted yet.', 'error');
      }
    } catch {
      toast.show('Could not schedule the test reminder.', 'error');
    }
  };

  const onClearAll = () => {
    if (items.length === 0) return;
    Alert.alert('Clear all notifications', 'This removes every notification from your inbox.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: clear },
    ]);
  };

  /** Resolves the palette keys stored on each row into real colors. */
  const decorate = (n: InboxItem) => {
    const palette = Palette as unknown as Record<string, string>;
    const tint = Tint as unknown as Record<string, string>;
    return {
      icon: (n.icon as IoniconName) ?? 'notifications-outline',
      color: palette[n.colorKey] ?? Palette.primary,
      tint: tint[n.colorKey] ?? Tint.primary,
    };
  };

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
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unread > 0 ? <Text style={styles.headerSub}>{unread} unread</Text> : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              hitSlop={10}
              onPress={markAllRead}
              style={({ pressed }) => pressed && styles.pressed}>
              <Ionicons name="checkmark-done" size={22} color={Palette.primary} />
            </Pressable>
            <Pressable hitSlop={10} onPress={onClearAll} style={({ pressed }) => pressed && styles.pressed}>
              <Ionicons name="trash-outline" size={20} color={Palette.subtle} />
            </Pressable>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Pressable
            onPress={() => void onSendTest()}
            android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
            style={({ pressed }) => [styles.card, styles.testCard, pressed && styles.cardPressed]}>
            <View style={[styles.icon, { backgroundColor: Tint.primary }]}>
              <Ionicons name="paper-plane-outline" size={20} color={Palette.primary} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>Send a test notification</Text>
              <Text style={styles.message} numberOfLines={2}>
                See what a reminder looks like on this device.
              </Text>
            </View>
          </Pressable>

          {items.length === 0 ? (
            <EmptyState
              icon="notifications-off-outline"
              title="No notifications yet"
              message="Reminders for your classes, plans and daily check-in will show up here."
            />
          ) : null}
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((n) => groupOf(n.at) === group);
            if (groupItems.length === 0) return null;
            return (
              <View key={group}>
                <Text style={styles.groupLabel}>{group}</Text>
                {groupItems.map((n) => {
                  const look = decorate(n);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => markRead(n.id)}
                      android_ripple={{ color: 'rgba(108,77,255,0.06)' }}
                      style={({ pressed }) => [
                        styles.card,
                        !n.read && styles.cardUnread,
                        pressed && styles.cardPressed,
                      ]}>
                      <View style={[styles.icon, { backgroundColor: look.tint }]}>
                        <Ionicons name={look.icon} size={20} color={look.color} />
                      </View>
                      <View style={styles.body}>
                        <View style={styles.titleRow}>
                          <Text style={styles.title}>{n.title}</Text>
                          <Text style={styles.time}>{timeLabel(n.at, group)}</Text>
                        </View>
                        <Text style={styles.message} numberOfLines={2}>
                          {n.message}
                        </Text>
                      </View>
                      <Pressable
                        hitSlop={8}
                        onPress={() => remove(n.id)}
                        style={({ pressed }) => [styles.rowDelete, pressed && styles.pressed]}>
                        <Ionicons name="close" size={16} color={Palette.subtle} />
                      </Pressable>
                      {!n.read ? <View style={styles.unreadDot} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD_SHADOW = {
  shadowColor: '#3A2E7A',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

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
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontFamily: FontFamily, fontSize: 19, fontWeight: '800', color: Palette.ink },
  headerSub: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.primary, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },

  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },

  groupLabel: {
    fontFamily: FontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: Palette.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 12,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.card,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  cardUnread: { backgroundColor: '#FBFAFF', borderWidth: 1, borderColor: '#EAE6FB' },
  testCard: { marginTop: 4 },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: FontFamily, fontSize: 15, fontWeight: '800', color: Palette.ink, flex: 1 },
  time: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.subtle, marginLeft: 8 },
  message: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: Palette.muted, marginTop: 3, lineHeight: 19 },
  rowDelete: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Palette.primary,
  },
  });
}
