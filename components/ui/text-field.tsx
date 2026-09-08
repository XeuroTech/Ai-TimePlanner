import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { KeyboardTypeOptions, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type Props = {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  icon,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  autoFocus,
  onSubmitEditing,
  onFocus,
}: Props) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [hidden, setHidden] = useState(!!secure);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        {icon ? <Ionicons name={icon} size={18} color={Palette.subtle} style={styles.icon} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Palette.subtle}
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoFocus={autoFocus}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          style={styles.input}
        />
        {secure ? (
          <Pressable hitSlop={10} onPress={() => setHidden((h) => !h)}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={Palette.subtle} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    wrap: { marginBottom: 16 },
    label: { fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink, marginBottom: 8 },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.card,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      paddingHorizontal: 14,
      height: 56,
    },
    fieldFocused: { borderColor: Palette.primary },
    fieldError: { borderColor: '#E5484D' },
    icon: { marginRight: 10 },
    input: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '600', color: Palette.ink, height: '100%' },
    errorText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '600', color: '#E5484D', marginTop: 6, marginLeft: 4 },
  });
}
