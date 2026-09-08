import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  ctaLabel?: string;
  onPress?: () => void;
  compact?: boolean;
  accent?: string;
  tint?: string;
};

/** Premium empty-state block: illustration bubble, title, message, optional CTA. */
export function EmptyState({
  icon,
  title,
  message,
  ctaLabel,
  onPress,
  compact,
  accent,
  tint,
}: Props) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const resolvedAccent = accent ?? Palette.primary;
  const resolvedTint = tint ?? Tint.primary;

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={[styles.bubble, compact && styles.bubbleCompact, { backgroundColor: resolvedTint }]}>
        <Ionicons name={icon} size={compact ? 30 : 40} color={resolvedAccent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {ctaLabel && onPress ? (
        <Button title={ctaLabel} onPress={onPress} style={styles.cta} />
      ) : null}
    </View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    compact: { paddingVertical: 28 },
    bubble: { width: 92, height: 92, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    bubbleCompact: { width: 68, height: 68, borderRadius: 22, marginBottom: 14 },
    title: { fontFamily: FontFamily, fontSize: 18, fontWeight: '800', color: Palette.ink, textAlign: 'center' },
    message: {
      fontFamily: FontFamily,
      fontSize: 14,
      fontWeight: '500',
      color: Palette.muted,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
      maxWidth: 280,
    },
    cta: { marginTop: 22, paddingHorizontal: 28 },
  });
}
