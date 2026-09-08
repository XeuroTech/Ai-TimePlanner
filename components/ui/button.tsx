import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style }: Props) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const isDisabled = disabled || loading;
  const textColor = variant === 'primary' ? '#FFFFFF' : Palette.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      android_ripple={{ color: variant === 'primary' ? 'rgba(255,255,255,0.2)' : 'rgba(108,77,255,0.12)' }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={18} color={textColor} /> : null}
          <Text style={[styles.label, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
    base: { height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    primary: {
      backgroundColor: Palette.primary,
      shadowColor: Palette.primary,
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    secondary: { backgroundColor: Tint.primary },
    ghost: { backgroundColor: 'transparent', height: 44 },
    disabled: { backgroundColor: '#C9C2EC', shadowOpacity: 0, elevation: 0 },
    pressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },
    label: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700' },
  });
}
