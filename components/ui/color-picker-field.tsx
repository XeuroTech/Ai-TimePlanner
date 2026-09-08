/**
 * App-wide color selection control.
 *
 * Renders the caller's preset swatches plus one extra "custom" swatch at the
 * end. The custom swatch opens a picker with a hue strip, a shade strip for
 * the chosen hue, and a hex field — together they reach any of the 16
 * million RGB colors, not just the presets.
 *
 * Callers keep their own notion of "which preset is selected" (a palette key
 * for habits, the raw hex itself for classes) — this component never
 * resolves that, it only reports taps back via `onSelectPreset` /
 * `onSelectCustom`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { hslToHex, normalizeHex } from '@/lib/color';

export type ColorPreset = { key: string; color: string };

const HUE_STEPS = 12;
const SHADE_STEPS = 9;

function shadeSteps(hue: number): { l: number; hex: string }[] {
  return Array.from({ length: SHADE_STEPS }, (_, i) => {
    const l = 90 - (i * 80) / (SHADE_STEPS - 1); // 90 (light tint) -> 10 (dark shade)
    return { l, hex: hslToHex(hue, 70, l) };
  });
}

export function ColorPickerField({
  presets,
  selectedKey,
  customColor,
  onSelectPreset,
  onSelectCustom,
}: {
  presets: ColorPreset[];
  /** The preset `key` currently active, or `'custom'` when `customColor` is shown instead. */
  selectedKey: string;
  customColor?: string | null;
  onSelectPreset: (key: string) => void;
  onSelectCustom: (hex: string) => void;
}) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [open, setOpen] = useState(false);
  const isCustom = selectedKey === 'custom';

  return (
    <>
      <View style={styles.row}>
        {presets.map((p) => {
          const active = !isCustom && p.key === selectedKey;
          return (
            <Pressable key={p.key} onPress={() => onSelectPreset(p.key)} style={styles.hit} hitSlop={2}>
              <View style={[styles.ring, active && { borderColor: p.color }]}>
                <View style={[styles.dot, { backgroundColor: p.color }]}>
                  {active ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* Custom swatch — opens the full picker. */}
        <Pressable onPress={() => setOpen(true)} style={styles.hit} hitSlop={2}>
          <View style={[styles.ring, isCustom && customColor && { borderColor: customColor }]}>
            {isCustom && customColor ? (
              <View style={[styles.dot, { backgroundColor: customColor }]}>
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              </View>
            ) : (
              <View style={styles.customDot}>
                <View style={[styles.customSlice, { backgroundColor: '#FF5A5F', left: 0 }]} />
                <View style={[styles.customSlice, { backgroundColor: '#FFC542', left: 11 }]} />
                <View style={[styles.customSlice, { backgroundColor: '#3DDC97', left: 22 }]} />
                <Ionicons name="color-palette-outline" size={16} color="#FFFFFF" style={styles.customIcon} />
              </View>
            )}
          </View>
        </Pressable>
      </View>

      <CustomColorModal
        visible={open}
        initial={isCustom && customColor ? customColor : presets[0]?.color ?? '#6C4DFF'}
        onCancel={() => setOpen(false)}
        onConfirm={(hex) => {
          setOpen(false);
          onSelectCustom(hex);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Custom picker modal                                                       */
/* -------------------------------------------------------------------------- */

function CustomColorModal({
  visible,
  initial,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  initial: string;
  onCancel: () => void;
  onConfirm: (hex: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      {visible ? <ColorSheet initial={initial} onCancel={onCancel} onConfirm={onConfirm} /> : null}
    </Modal>
  );
}

function ColorSheet({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (hex: string) => void;
}) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

  const [hue, setHue] = useState(0);
  const [hex, setHex] = useState(normalizeHex(initial) ?? '#6C4DFF');
  const [hexInput, setHexInput] = useState(hex.replace('#', ''));

  const shades = useMemo(() => shadeSteps(hue), [hue]);

  const applyHex = (h: string) => {
    setHex(h);
    setHexInput(h.replace('#', ''));
  };

  const onHexSubmit = () => {
    const normalized = normalizeHex(hexInput);
    if (normalized) applyHex(normalized);
    else setHexInput(hex.replace('#', ''));
  };

  return (
    <Pressable style={styles.backdrop} onPress={onCancel}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <Text style={styles.sheetTitle}>Custom color</Text>

        <View style={[styles.preview, { backgroundColor: hex }]} />

        <Text style={styles.pickerLabel}>Hue</Text>
        <View style={styles.strip}>
          {Array.from({ length: HUE_STEPS }, (_, i) => (i * 360) / HUE_STEPS).map((h) => {
            const swatch = hslToHex(h, 75, 55);
            return (
              <Pressable
                key={h}
                onPress={() => {
                  setHue(h);
                  applyHex(swatch);
                }}
                style={[styles.stripCell, { backgroundColor: swatch }, Math.abs(h - hue) < 1 && styles.stripCellActive]}
              />
            );
          })}
        </View>

        <Text style={styles.pickerLabel}>Shade</Text>
        <View style={styles.strip}>
          {shades.map((s) => (
            <Pressable
              key={s.l}
              onPress={() => applyHex(s.hex)}
              style={[styles.stripCell, { backgroundColor: s.hex }, s.hex === hex && styles.stripCellActive]}
            />
          ))}
        </View>

        <Text style={styles.pickerLabel}>Hex</Text>
        <View style={styles.hexRow}>
          <Text style={styles.hexHash}>#</Text>
          <TextInput
            value={hexInput}
            onChangeText={setHexInput}
            onBlur={onHexSubmit}
            onSubmitEditing={onHexSubmit}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            placeholder="6C4DFF"
            placeholderTextColor={Palette.subtle}
            style={styles.hexInput}
          />
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}>
            <Text style={styles.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm(hex)}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryText}>Use color</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    hit: { padding: 2 },
    ring: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    customDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#8B7DFF',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    customSlice: { position: 'absolute', width: 20, height: 32, top: 0, opacity: 0.9 },
    customIcon: { position: 'absolute' },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(12,10,28,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: Palette.card,
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 18,
      shadowColor: '#000000',
      shadowOpacity: 0.28,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
      elevation: 16,
    },
    sheetTitle: { fontFamily: FontFamily, fontSize: 17, fontWeight: '800', color: Palette.ink, marginBottom: 14 },
    preview: {
      alignSelf: 'center',
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 3,
      borderColor: Palette.hairline,
      marginBottom: 16,
    },
    pickerLabel: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted, marginBottom: 8 },
    strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    stripCell: { width: 26, height: 26, borderRadius: 8 },
    stripCellActive: { borderWidth: 2.5, borderColor: Palette.ink },

    hexRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.bg,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      paddingHorizontal: 14,
      height: 48,
    },
    hexHash: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.subtle },
    hexInput: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink, letterSpacing: 1 },

    actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    ghostBtn: {
      flex: 1,
      height: 52,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: Palette.muted },
    primaryBtn: {
      flex: 1,
      height: 52,
      borderRadius: 16,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryPressed: { opacity: 0.9 },
    primaryText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  });
}
