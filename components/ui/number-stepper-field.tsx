/**
 * A +/- stepper whose value is also directly editable.
 *
 * Plain steppers (like the old daily-routine sliders) only move in fixed
 * increments — fine for nudging, useless if you actually want "37 minutes".
 * Tapping the value here opens a small numeric-entry sheet so any exact
 * number in range can be typed in, while +/- stay for quick nudges.
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

export function NumberStepperField({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  title,
  formatValue,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Appended after the number, e.g. "h", "min". */
  unit?: string;
  /** Numeric-entry sheet title. Defaults to a generic "Set value". */
  title?: string;
  /** Overrides the default `${value} ${unit}` display. */
  formatValue?: (v: number) => string;
}) {
  const { t } = useTranslation();
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [open, setOpen] = useState(false);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const display = formatValue ? formatValue(value) : unit ? `${value} ${unit}` : `${value}`;

  return (
    <>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, { backgroundColor: Tint.primary }, pressed && styles.pressed]}>
          <Ionicons name="remove" size={18} color={Palette.primary} />
        </Pressable>
        <Pressable onPress={() => setOpen(true)} hitSlop={4} style={styles.valueHit}>
          <Text style={styles.stepValue}>{display}</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(clamp(value + step))}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, { backgroundColor: Tint.primary }, pressed && styles.pressed]}>
          <Ionicons name="add" size={18} color={Palette.primary} />
        </Pressable>
      </View>

      <NumberEntrySheet
        visible={open}
        initial={value}
        min={min}
        max={max}
        title={title ?? t('numberStepper.setValue')}
        unit={unit}
        onCancel={() => setOpen(false)}
        onConfirm={(v) => {
          setOpen(false);
          onChange(clamp(v));
        }}
      />
    </>
  );
}

function NumberEntrySheet({
  visible,
  initial,
  min,
  max,
  title,
  unit,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  initial: number;
  min: number;
  max: number;
  title: string;
  unit?: string;
  onCancel: () => void;
  onConfirm: (v: number) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      {visible ? (
        <EntrySheetBody
          initial={initial}
          min={min}
          max={max}
          title={title}
          unit={unit}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
}

function EntrySheetBody({
  initial,
  min,
  max,
  title,
  unit,
  onCancel,
  onConfirm,
}: {
  initial: number;
  min: number;
  max: number;
  title: string;
  unit?: string;
  onCancel: () => void;
  onConfirm: (v: number) => void;
}) {
  const { t } = useTranslation();
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  const [text, setText] = useState(`${initial}`);

  const parsed = parseInt(text, 10);
  const valid = Number.isFinite(parsed) && parsed >= min && parsed <= max;

  return (
    <Pressable style={styles.backdrop} onPress={onCancel}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            style={styles.input}
            onSubmitEditing={() => valid && onConfirm(parsed)}
          />
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        </View>
        <Text style={styles.range}>
          {t('numberStepper.between', { min, max })}
        </Text>

        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}>
            <Text style={styles.ghostText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            onPress={() => valid && onConfirm(parsed)}
            disabled={!valid}
            style={({ pressed }) => [styles.primaryBtn, !valid && styles.primaryDisabled, pressed && valid && styles.primaryPressed]}>
            <Text style={styles.primaryText}>{t('numberStepper.set')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    valueHit: { minWidth: 54, paddingVertical: 4 },
    stepValue: { fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.ink, textAlign: 'center' },

    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(12,10,28,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: Palette.card,
      borderRadius: 26,
      padding: 22,
      shadowColor: '#000000',
      shadowOpacity: 0.28,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
      elevation: 16,
    },
    sheetTitle: { fontFamily: FontFamily, fontSize: 17, fontWeight: '800', color: Palette.ink, marginBottom: 14 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Palette.bg,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      paddingHorizontal: 16,
      height: 56,
    },
    input: { flex: 1, fontFamily: FontFamily, fontSize: 22, fontWeight: '800', color: Palette.ink },
    unit: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.muted },
    range: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.subtle, marginTop: 8, marginLeft: 4 },

    actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    ghostBtn: {
      flex: 1,
      height: 50,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ghostText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.muted },
    primaryBtn: {
      flex: 1,
      height: 50,
      borderRadius: 16,
      backgroundColor: Palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryDisabled: { opacity: 0.4 },
    primaryPressed: { backgroundColor: Palette.primaryDark },
    primaryText: { fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  });
}
