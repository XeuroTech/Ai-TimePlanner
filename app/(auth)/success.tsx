import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function SuccessScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { Palette, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [scale, opacity]);

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Animated.View style={[styles.check, { transform: [{ scale }] }]}>
            <Ionicons name="checkmark" size={60} color="#FFFFFF" />
          </Animated.View>
          <Animated.View style={{ opacity, alignItems: 'center' }}>
            <Text style={styles.title}>{t('auth.success.title')}</Text>
            <Text style={styles.subtitle}>{t('auth.success.subtitle')}</Text>
          </Animated.View>
        </View>
        <View style={styles.footer}>
          <Button title={t('auth.success.continueButton')} icon="arrow-forward" onPress={() => router.replace('/category')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1 },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    check: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: Palette.green,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 30,
      shadowColor: Palette.green,
      shadowOpacity: 0.4,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 10,
    },
    title: { fontFamily: FontFamily, fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: Palette.ink },
    subtitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '500', color: Palette.muted, textAlign: 'center', marginTop: 12, lineHeight: 22 },
    footer: { paddingHorizontal: 24, paddingBottom: 12 },
  });
}
