import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { CATEGORIES, CategoryDef, CategoryId } from '@/constants/categories';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuthStore } from '@/store/auth-store';

export default function CategoryScreen() {
  const router = useRouter();
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const profileName = useAuthStore((s) => s.profile?.name);
  const [selected, setSelected] = useState<CategoryId | null>(null);
  const [saving, setSaving] = useState(false);

  const onContinue = async () => {
    // Both conditions mirror the Continue button's own disabled={!selected}
    // and it is never re-clickable while saving, so this is unreachable
    // through the rendered UI (see category.test.tsx for the full rationale).
    /* v8 ignore start */
    if (!selected || saving) return;
    /* v8 ignore stop */
    setSaving(true);
    await updateProfile({ category: selected });
    // Skip the extra "set your plan" step — go straight to the app.
    await completeOnboarding({ name: profileName ?? undefined });
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>What best describes you?</Text>
          <Text style={styles.subtitle}>We&apos;ll tailor your planner to how you work.</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
          {CATEGORIES.map((c, i) => (
            <CategoryCard
              key={c.id}
              category={c}
              index={i}
              active={selected === c.id}
              onPress={() => setSelected(c.id)}
            />
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Button title="Continue" icon="arrow-forward" onPress={onContinue} disabled={!selected} loading={saving} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function CategoryCard({
  category,
  index,
  active,
  onPress,
}: {
  category: CategoryDef;
  index: number;
  active: boolean;
  onPress: () => void;
}) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay: index * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  const style = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  };

  return (
    <Animated.View style={[styles.cardWrap, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && styles.cardPressed]}>
        <View style={[styles.cardIcon, { backgroundColor: active ? category.color : category.tint }]}>
          <Ionicons name={category.icon} size={24} color={active ? '#FFFFFF' : category.color} />
        </View>
        <Text style={styles.cardLabel}>{category.label}</Text>
        <Text style={styles.cardBlurb} numberOfLines={2}>
          {category.blurb}
        </Text>
        {active ? (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1 },
    header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18 },
    title: { fontFamily: FontFamily, fontSize: 27, fontWeight: '800', letterSpacing: -0.6, color: Palette.ink },
    subtitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.muted, marginTop: 8 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20 },
    cardWrap: { width: '48%', marginBottom: 14 },
    card: {
      backgroundColor: Palette.card,
      borderRadius: 22,
      padding: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      minHeight: 140,
      shadowColor: '#3A2E7A',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    cardActive: { borderColor: Palette.primary },
    cardPressed: { transform: [{ scale: 0.98 }] },
    cardIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    cardLabel: { fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.ink },
    cardBlurb: { fontFamily: FontFamily, fontSize: 13, fontWeight: '500', color: Palette.muted, marginTop: 4, lineHeight: 18 },
    checkBadge: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  });
}
