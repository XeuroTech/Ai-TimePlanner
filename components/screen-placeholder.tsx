import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type Props = {
  title: string;
  subtitle?: string;
  icon: IoniconName;
  accent?: string;
  tint?: string;
};

/**
 * On-brand placeholder for tab screens that are not built out yet.
 * Keeps the app shell navigable while the individual screens are designed.
 */
export function ScreenPlaceholder({
  title,
  subtitle = 'Coming soon',
  icon,
  accent,
  tint,
}: Props) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const resolvedAccent = accent ?? Palette.primary;
  const resolvedTint = tint ?? Tint.primary;

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.blob, { backgroundColor: 'rgba(139,125,255,0.12)' }]} />
      </View>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.header}>{title}</Text>
        <View style={styles.center}>
          <View style={[styles.iconWrap, { backgroundColor: resolvedTint }]}>
            <Ionicons name={icon} size={44} color={resolvedAccent} />
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.hint}>This screen is next on the roadmap.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: Palette.bg },
    safe: { flex: 1, paddingHorizontal: 24 },
    blob: {
      position: 'absolute',
      width: 300,
      height: 300,
      borderRadius: 150,
      top: -100,
      right: -90,
    },
    header: {
      fontFamily: FontFamily,
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: -0.5,
      color: Palette.ink,
      marginTop: 12,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: -40,
    },
    iconWrap: {
      width: 104,
      height: 104,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },
    subtitle: {
      fontFamily: FontFamily,
      fontSize: 20,
      fontWeight: '700',
      color: Palette.ink,
    },
    hint: {
      fontFamily: FontFamily,
      fontSize: 15,
      fontWeight: '500',
      color: Palette.muted,
      marginTop: 8,
    },
  });
}
