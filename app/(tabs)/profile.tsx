import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { CATEGORIES, CategoryId, getCategory } from '@/constants/categories';
import { SUPPORT_EMAIL } from '@/constants/company';
import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePremium } from '@/hooks/use-premium';
import { pickAvatar } from '@/lib/services/avatar';
import { languageLabel } from '@/lib/services/locale';
import { getNotificationPermission, requestNotificationPermission } from '@/lib/services/notifications';
import { reportError } from '@/lib/services/observability';
import { useAuthStore } from '@/store/auth-store';
import { useBackupStore } from '@/store/backup-store';
import { useThemeStore } from '@/store/theme-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

type ToggleId = 'notifications' | 'darkMode';

type Row =
  | {
      id: string;
      kind: 'nav';
      label: string;
      icon: IoniconName;
      colorKey: string;
      tintKey: string;
      route?: '/daily-routine' | '/habits' | '/settings' | '/backup' | '/language';
      /** Optional status text shown before the chevron (e.g. backup state). */
      value?: string;
    }
  | { id: ToggleId; kind: 'toggle'; label: string; icon: IoniconName; colorKey: string; tintKey: string };

type TFn = ReturnType<typeof useTranslation>['t'];

function getPreferences(t: TFn): Row[] {
  return [
    { id: 'routine', kind: 'nav', label: t('tabs.profile.preferences.dailyRoutine'), icon: 'alarm-outline', colorKey: 'primary', tintKey: 'primary', route: '/daily-routine' },
    { id: 'habits', kind: 'nav', label: t('tabs.profile.preferences.habitTracker'), icon: 'flame-outline', colorKey: 'pink', tintKey: 'pink', route: '/habits' },
    { id: 'notifications', kind: 'toggle', label: t('tabs.profile.preferences.notifications'), icon: 'notifications-outline', colorKey: 'orange', tintKey: 'orange' },
    { id: 'darkMode', kind: 'toggle', label: t('tabs.profile.preferences.darkMode'), icon: 'moon-outline', colorKey: 'secondary', tintKey: 'primary' },
    { id: 'language', kind: 'nav', label: t('tabs.profile.preferences.language'), icon: 'language-outline', colorKey: 'green', tintKey: 'green', route: '/language' },
  ];
}

function getGeneral(t: TFn): Row[] {
  return [
    { id: 'backup', kind: 'nav', label: t('tabs.profile.general.backupAndSync'), icon: 'cloud-outline', colorKey: 'blue', tintKey: 'blue', route: '/backup' },
    { id: 'help', kind: 'nav', label: t('tabs.profile.general.helpAndSupport'), icon: 'help-circle-outline', colorKey: 'pink', tintKey: 'pink', value: SUPPORT_EMAIL },
    { id: 'settings', kind: 'nav', label: t('tabs.profile.general.settings'), icon: 'settings-outline', colorKey: 'muted', tintKey: 'neutral', route: '/settings' },
  ];
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const toast = useToast();
  const tabBarSpace = 60 + (insets.bottom > 0 ? insets.bottom : 12);

  const { Palette, Tint, isDark } = useAppTheme();
  const setDarkMode = useThemeStore((s) => s.setDarkMode);
  const notificationsEnabled = useThemeStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useThemeStore((s) => s.setNotificationsEnabled);
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const neutralTint = isDark ? '#26243D' : '#EEF0F4';

  const fbUser = useAuthStore((s) => s.fbUser);
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const name = profile?.name ?? t('tabs.profile.guestFallback');
  const email = fbUser?.email ?? '';
  const category = getCategory(profile?.category);
  const avatarUri = profile?.preferences?.avatarUri;
  const { isPremium } = usePremium();

  const [showCatPicker, setShowCatPicker] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [nameSaving, setNameSaving] = useState(false);

  /*
   * Backup state on the row itself, so the user can tell at a glance whether
   * their data is actually going anywhere without opening the screen.
   */
  const preferences = useMemo<Row[]>(
    () =>
      getPreferences(t).map((row) =>
        row.id === 'language' && row.kind === 'nav'
          ? { ...row, value: languageLabel(profile?.preferences.language) }
          : row,
      ),
    [t, profile?.preferences.language],
  );

  const driveConnected = useBackupStore((s) => s.connected);
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt);
  const hydrateBackup = useBackupStore((s) => s.hydrate);
  const general = useMemo<Row[]>(
    () =>
      getGeneral(t).map((row) =>
        row.id === 'backup' && row.kind === 'nav'
          ? {
              ...row,
              value: driveConnected
                ? lastBackupAt
                  ? t('tabs.profile.backupSynced')
                  : t('tabs.profile.backupConnected')
                : t('tabs.profile.backupOff'),
            }
          : row,
      ),
    [t, driveConnected, lastBackupAt],
  );

  // `connected` is derived from the stored OAuth token, not persisted state, so
  // it has to be re-read once per app run for the row above to be truthful.
  useEffect(() => {
    void hydrateBackup();
  }, [hydrateBackup]);

  // Reconcile with the real OS permission: if it was revoked from system
  // settings behind our back, don't keep showing the switch as "on".
  useEffect(() => {
    if (!notificationsEnabled) return;
    getNotificationPermission().then((status) => {
      if (status !== 'granted') setNotificationsEnabled(false);
    });
  }, [notificationsEnabled, setNotificationsEnabled]);

  const onPickCategory = async (id: CategoryId) => {
    setShowCatPicker(false);
    if (id !== profile?.category) await updateProfile({ category: id });
  };

  const onPickAvatar = async () => {
    const uid = fbUser?.uid;
    if (!uid || avatarBusy) return;
    setAvatarBusy(true);
    try {
      const res = await pickAvatar(uid, avatarUri);
      if (res.ok) {
        await updateProfile({ preferences: { avatarUri: res.uri } });
        toast.success(t('tabs.profile.avatarUpdatedToast'));
      } else if (!res.canceled) {
        toast.show(res.error, 'error');
      }
    } finally {
      setAvatarBusy(false);
    }
  };

  const openNameEdit = () => {
    setNameDraft(name);
    setShowNameEdit(true);
  };

  const onSaveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || nameSaving) return;
    if (trimmed === name) {
      setShowNameEdit(false);
      return;
    }
    setNameSaving(true);
    try {
      await updateProfile({ name: trimmed });
      setShowNameEdit(false);
      toast.success(t('tabs.profile.nameUpdatedToast'));
    } catch (e) {
      reportError(e, 'profile/rename');
      toast.show(t('tabs.profile.nameUpdateFailedToast'), 'error');
    } finally {
      setNameSaving(false);
    }
  };

  const onToggleNotifications = async (value: boolean) => {
    if (!value) {
      setNotificationsEnabled(false);
      return;
    }
    const status = await requestNotificationPermission();
    if (status === 'granted') {
      setNotificationsEnabled(true);
    } else {
      setNotificationsEnabled(false);
      toast.show(t('tabs.profile.notificationsDeniedToast'), 'error');
    }
  };

  const onLogout = () => {
    Alert.alert(t('tabs.profile.logoutTitle'), t('tabs.profile.logoutMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tabs.profile.logoutTitle'),
        style: 'destructive',
        onPress: async () => {
          // Just clear the session; the auth gate in app/_layout.tsx
          // redirects to /login once fbUser/profile become null.
          // (Navigating here too caused a double-navigation race.)
          await logout();
        },
      },
    ]);
  };

  const onDeleteAccount = () => {
    Alert.alert(
      t('tabs.profile.deleteAccountTitle'),
      t('tabs.profile.deleteAccountMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            // On success the auth gate handles the redirect to /login.
            const res = await deleteAccount();
            if (!res.ok) Alert.alert(t('tabs.profile.deleteAccountFailedTitle'), res.error ?? t('tabs.profile.deleteAccountFailedFallback'));
          },
        },
      ],
    );
  };

  const colorFor = (key: string) => (Palette as unknown as Record<string, string>)[key];
  const tintFor = (key: string) => (key === 'neutral' ? neutralTint : (Tint as unknown as Record<string, string>)[key]);

  const renderRow = (row: Row, isLast: boolean) => (
    <View key={row.id}>
      <Pressable
        onPress={() => {
          if (row.kind !== 'nav') return;
          if (row.id === 'help') {
            Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
            return;
          }
          if (row.route) router.push(row.route);
        }}
        disabled={row.kind === 'toggle'}
        style={({ pressed }) => [styles.row, pressed && row.kind !== 'toggle' && styles.rowPressed]}>
        <View style={[styles.rowIcon, { backgroundColor: tintFor(row.tintKey) }]}>
          <Ionicons name={row.icon} size={20} color={colorFor(row.colorKey)} />
        </View>
        <Text style={styles.rowLabel}>{row.label}</Text>
        {row.kind === 'toggle' ? (
          <Switch
            value={row.id === 'darkMode' ? isDark : notificationsEnabled}
            onValueChange={row.id === 'darkMode' ? setDarkMode : onToggleNotifications}
            trackColor={{ false: isDark ? '#3A3660' : '#D9D5EA', true: Palette.primary }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={isDark ? '#3A3660' : '#D9D5EA'}
          />
        ) : row.value ? (
          <View style={styles.rowRight}>
            <Text style={styles.rowValue} numberOfLines={1}>
              {row.value}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
        )}
      </Pressable>
      {!isLast ? <View style={styles.divider} /> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarSpace + 28 }]}>
        {/* Purple header */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <View pointerEvents="none" style={styles.headerBlobTop} />
          <View pointerEvents="none" style={styles.headerBlobBottom} />

          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <Pressable
              onPress={onPickAvatar}
              disabled={avatarBusy}
              hitSlop={4}
              style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
              {avatarBusy ? (
                <ActivityIndicator size="small" color={Palette.primary} />
              ) : (
                <Ionicons name="pencil" size={14} color={Palette.primary} />
              )}
            </Pressable>
          </View>
          <Pressable
            onPress={openNameEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}>
            <Text style={styles.name}>{name}</Text>
            <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.85)" />
            {isPremium ? (
              <View style={styles.proBadge}>
                <Ionicons name="diamond" size={10} color={Palette.primary} />
                <Text style={styles.proBadgeText}>{t('tabs.profile.proBadge')}</Text>
              </View>
            ) : null}
          </Pressable>
          {email ? <Text style={styles.email}>{email}</Text> : null}
          <Pressable
            onPress={() => setShowCatPicker(true)}
            style={({ pressed }) => [styles.catChip, pressed && styles.pressed]}>
            <Ionicons name={category.icon} size={13} color="#FFFFFF" />
            <Text style={styles.catChipText}>{category.label}</Text>
            <Ionicons name="chevron-down" size={13} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Premium / upgrade banner */}
        <Pressable
          onPress={() => router.push('/premium')}
          android_ripple={{ color: 'rgba(108,77,255,0.12)' }}
          style={({ pressed }) => [styles.premium, pressed && styles.premiumPressed]}>
          <View style={styles.premiumIcon}>
            <Ionicons name="diamond" size={20} color="#FFFFFF" />
          </View>
          <View style={styles.premiumText}>
            <Text style={styles.premiumTitle}>{isPremium ? t('tabs.profile.premiumMember') : t('tabs.profile.upgradeToPremium')}</Text>
            <Text style={styles.premiumSub}>
              {isPremium
                ? t('tabs.profile.premiumSubActive')
                : t('tabs.profile.premiumSubInactive')}
            </Text>
          </View>
          {isPremium ? (
            <Ionicons name="checkmark-circle" size={20} color={Palette.green} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={Palette.primary} />
          )}
        </Pressable>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>{t('tabs.profile.preferencesSection')}</Text>
        <View style={styles.card}>{preferences.map((r, i) => renderRow(r, i === preferences.length - 1))}</View>

        {/* General */}
        <Text style={styles.sectionLabel}>{t('tabs.profile.generalSection')}</Text>
        <View style={styles.card}>{general.map((r, i) => renderRow(r, i === general.length - 1))}</View>

        {/* Logout */}
        <Pressable
          onPress={onLogout}
          android_ripple={{ color: 'rgba(229,72,77,0.1)' }}
          style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}>
          <Ionicons name="log-out-outline" size={20} color="#E5484D" />
          <Text style={styles.logoutText}>{t('tabs.profile.logoutButton')}</Text>
        </Pressable>

        <Pressable onPress={onDeleteAccount} hitSlop={8} style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>{t('tabs.profile.deleteAccountButton')}</Text>
        </Pressable>

        <Text style={styles.version}>{t('tabs.profile.version')}</Text>
      </ScrollView>

      {/* Category / persona picker */}
      <Modal
        visible={showCatPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCatPicker(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowCatPicker(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('tabs.profile.chooseCategoryTitle')}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {CATEGORIES.map((c) => {
              const active = c.id === profile?.category;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onPickCategory(c.id)}
                  style={({ pressed }) => [styles.catRow, pressed && styles.rowPressed]}>
                  <View style={[styles.catRowIcon, { backgroundColor: c.tint }]}>
                    <Ionicons name={c.icon} size={20} color={c.color} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.catRowLabel}>{c.label}</Text>
                    <Text style={styles.catRowBlurb}>{c.blurb}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={Palette.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Name editor */}
      <Modal
        visible={showNameEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameEdit(false)}>
        <Pressable style={styles.blurBackdrop} onPress={() => setShowNameEdit(false)}>
          <BlurView
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
        <View pointerEvents="box-none" style={styles.dialogWrap}>
          <View style={styles.dialogCard}>
            <Text style={styles.sheetTitle}>{t('tabs.profile.editNameTitle')}</Text>
            <TextField
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder={t('tabs.profile.namePlaceholder')}
              autoCapitalize="words"
              autoFocus
              onSubmitEditing={onSaveName}
            />
            <View style={styles.dialogActions}>
              <Button
                title={t('common.cancel')}
                variant="secondary"
                onPress={() => setShowNameEdit(false)}
                style={styles.dialogBtn}
              />
              <Button
                title={t('common.save')}
                onPress={onSaveName}
                loading={nameSaving}
                disabled={!nameDraft.trim()}
                style={styles.dialogBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette, Tint: AppTint) {
  const CARD_SHADOW = {
    shadowColor: '#3A2E7A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  } as const;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    pressed: { opacity: 0.6 },
    scroll: { paddingBottom: 40 },

    /* header */
    header: {
      alignItems: 'center',
      backgroundColor: Palette.primary,
      borderBottomLeftRadius: 34,
      borderBottomRightRadius: 34,
      paddingBottom: 30,
      overflow: 'hidden',
    },
    headerBlobTop: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(255,255,255,0.12)',
      top: -60,
      right: -40,
    },
    headerBlobBottom: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: 'rgba(0,0,0,0.08)',
      bottom: -70,
      left: -30,
    },
    avatarWrap: { marginBottom: 14 },
    avatar: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: 'rgba(255,255,255,0.5)',
      overflow: 'hidden',
    },
    // `overflow: 'hidden'` on the parent alone doesn't reliably clip an
    // <Image> to the circle on iOS — rounding the image itself is the fix.
    avatarImg: { width: '100%', height: '100%', borderRadius: 46 },
    avatarText: { fontFamily: FontFamily, fontSize: 38, fontWeight: '800', color: Palette.primary },
    editBtn: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: Palette.primary,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { fontFamily: FontFamily, fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
    proBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      height: 20,
      borderRadius: 7,
      backgroundColor: '#FFFFFF',
    },
    proBadgeText: { fontFamily: FontFamily, fontSize: 10, fontWeight: '800', color: Palette.primary, letterSpacing: 0.5 },
    email: { fontFamily: FontFamily, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.85)', marginTop: 4 },

    premium: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: Tint.primary,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: Palette.primary,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginHorizontal: 20,
      marginTop: 18,
    },
    premiumPressed: { opacity: 0.7 },
    premiumIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    premiumText: { flex: 1, gap: 2 },
    premiumTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '800', color: Palette.ink },
    premiumSub: { fontFamily: FontFamily, fontSize: 12.5, fontWeight: '500', color: Palette.muted, lineHeight: 17 },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      marginTop: 12,
    },
    catChipText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

    flex: { flex: 1 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      maxHeight: '75%',
      backgroundColor: Palette.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: Palette.hairline,
      marginBottom: 14,
    },
    sheetTitle: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: Palette.ink, marginBottom: 12 },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 12,
    },
    catRowIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catRowLabel: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
    catRowBlurb: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 2 },

    blurBackdrop: { ...StyleSheet.absoluteFillObject },
    dialogWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    dialogCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: Palette.card,
      borderRadius: 26,
      padding: 22,
      ...CARD_SHADOW,
    },
    dialogActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    dialogBtn: { flex: 1 },

    sectionLabel: {
      fontFamily: FontFamily,
      fontSize: 13,
      fontWeight: '700',
      color: Palette.subtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 24,
      marginBottom: 12,
      marginHorizontal: 24,
    },

    card: {
      backgroundColor: Palette.card,
      borderRadius: 22,
      marginHorizontal: 20,
      paddingHorizontal: 16,
      ...CARD_SHADOW,
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
    rowPressed: { opacity: 0.6 },
    rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    rowLabel: { flex: 1, fontFamily: FontFamily, fontSize: 16, fontWeight: '600', color: Palette.ink },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 150 },
    rowValue: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.muted, flexShrink: 1 },
    divider: { height: 1, backgroundColor: Palette.hairline, marginLeft: 54 },

    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#FDE7E8',
      borderRadius: 20,
      marginHorizontal: 20,
      marginTop: 24,
      height: 56,
    },
    logoutPressed: { opacity: 0.85 },
    logoutText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: '#E5484D' },

    deleteBtn: { alignSelf: 'center', marginTop: 16 },
    deleteText: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: '#E5484D' },
    version: { fontFamily: FontFamily, fontSize: 12, fontWeight: '500', color: Palette.subtle, textAlign: 'center', marginTop: 18 },
  });
}
