/**
 * Real circular clock time picker (Android / Material style).
 *
 * Replaces the scroll-list and +/- stepper time pickers that used to be
 * copy-pasted across add-class, daily-plan, daily-routine and the onboarding
 * wizard. Everything is drawn with plain React Native `View`s + rotation
 * transforms and driven by core `PanResponder` — no SVG, no gesture-handler
 * root view, no new dependencies.
 *
 * Exports
 *  - `ClockDial`            the bare dial (hour + minute rings, draggable hand)
 *  - `ClockTimePickerModal` dial in a modal with Cancel / OK and a draft value
 *  - `ClockTimeField`       labelled pressable that opens the modal
 *
 * Angles are measured in degrees clockwise from 12 o'clock.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppPalette, AppTint, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDuration, formatTime, fromClockParts, nowMinutes, Period, toClockParts } from '@/lib/time';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type ClockMode = 'hour' | 'minute';

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_SIZE = 268;
/** How far in from the dial edge the numbers (and the hand's knob) sit. */
const NUMBER_INSET = 30;
const KNOB_RADIUS = 20;
const LABEL_BOX = 40;

const HOUR_LABELS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const MINUTE_LABELS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

/** Position of ring slot `index` (0 = 12 o'clock, clockwise) inside a `size` box. */
function slotPosition(index: number, size: number) {
  const r = size / 2;
  const ringRadius = r - NUMBER_INSET;
  const a = (index * 30 * Math.PI) / 180;
  return { x: r + ringRadius * Math.sin(a), y: r - ringRadius * Math.cos(a) };
}

/** Degrees clockwise from 12 o'clock for a touch at (x, y) inside a `size` box. */
function angleFromPoint(x: number, y: number, size: number): number {
  const r = size / 2;
  const deg = (Math.atan2(x - r, r - y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function haptic() {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => {});
}

/* -------------------------------------------------------------------------- */
/* Dial                                                                       */
/* -------------------------------------------------------------------------- */

export function ClockDial({
  value,
  onChange,
  mode,
  onModeChange,
  minuteStep = 1,
  size = DEFAULT_SIZE,
}: {
  /** Minutes from midnight. */
  value: number;
  onChange: (minutes: number) => void;
  mode: ClockMode;
  onModeChange: (mode: ClockMode) => void;
  /** Snap increment while dragging the minute ring. 1 = free, 5 = five-minute steps. */
  minuteStep?: number;
  size?: number;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const { hour12, minute, period } = toClockParts(value);

  /** Dial origin in window coordinates — pageX/pageY minus this gives local coords. */
  const originRef = useRef({ x: 0, y: 0 });
  const dialRef = useRef<View>(null);

  const measure = useCallback(() => {
    dialRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  const applyTouch = (evt: GestureResponderEvent) => {
    const localX = evt.nativeEvent.pageX - originRef.current.x;
    const localY = evt.nativeEvent.pageY - originRef.current.y;
    const angle = angleFromPoint(localX, localY, size);

    let next: number;
    if (mode === 'hour') {
      const slot = Math.round(angle / 30) % 12; // 0 == 12 o'clock
      next = fromClockParts(slot === 0 ? 12 : slot, minute, period);
    } else {
      const step = Math.max(1, minuteStep);
      const raw = Math.round(angle / 6); // 6 degrees per minute
      const snapped = (Math.round(raw / step) * step) % 60;
      next = fromClockParts(hour12, snapped, period);
    }

    // Compared against the live `value` prop rather than a remembered "last
    // emitted" value — otherwise changing AM/PM (which bypasses this handler)
    // would leave the memo stale and swallow the next drag to that same time.
    if (next !== value) {
      haptic();
      onChange(next);
    }
  };

  /*
   * Recreated every render on purpose: React Native reads the responder
   * callbacks off the View's *current* props for each touch event, so this is
   * what keeps the handlers closed over fresh `value`/`mode` without stashing
   * mutable state in a ref during render.
   */
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      measure();
      applyTouch(evt);
    },
    onPanResponderMove: applyTouch,
    onPanResponderRelease: () => {
      // Material behaviour: picking an hour hands off to the minute ring.
      if (mode === 'hour') onModeChange('minute');
    },
  });

  const handAngle = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const labels = mode === 'hour' ? HOUR_LABELS : MINUTE_LABELS;
  const activeIndex =
    mode === 'hour' ? hour12 % 12 : minute % 5 === 0 ? Math.round(minute / 5) % 12 : -1;
  const r = size / 2;
  const stemLength = r - NUMBER_INSET - KNOB_RADIUS;

  return (
    <View style={styles.dialArea}>
      {/* Digital readout + AM/PM */}
      <View style={styles.readout}>
        <Pressable onPress={() => onModeChange('hour')} hitSlop={6}>
          <Text style={[styles.readoutNum, mode === 'hour' && styles.readoutNumActive]}>
            {hour12.toString().padStart(2, '0')}
          </Text>
        </Pressable>
        <Text style={styles.readoutColon}>:</Text>
        <Pressable onPress={() => onModeChange('minute')} hitSlop={6}>
          <Text style={[styles.readoutNum, mode === 'minute' && styles.readoutNumActive]}>
            {minute.toString().padStart(2, '0')}
          </Text>
        </Pressable>

        <View style={styles.periodCol}>
          {(['AM', 'PM'] as Period[]).map((p) => {
            const on = period === p;
            return (
              <Pressable
                key={p}
                hitSlop={4}
                onPress={() => {
                  if (on) return;
                  haptic();
                  onChange(fromClockParts(hour12, minute, p));
                }}
                style={[styles.periodBtn, on && styles.periodBtnOn]}>
                <Text style={[styles.periodText, on && styles.periodTextOn]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.hint}>
        {mode === 'hour' ? 'Drag or tap to pick the hour' : 'Drag or tap to pick the minutes'}
      </Text>

      {/* The dial */}
      <View
        ref={dialRef}
        onLayout={measure}
        collapsable={false}
        style={[styles.dial, { width: size, height: size, borderRadius: r }]}
        {...pan.panHandlers}>
        {/* Hand (below the numbers so labels stay readable on top of the knob) */}
        <View
          pointerEvents="none"
          style={[
            styles.handWrap,
            { width: size, height: size, transform: [{ rotate: `${handAngle}deg` }] },
          ]}>
          <View
            style={[
              styles.handStem,
              { left: r - 1.25, top: NUMBER_INSET + KNOB_RADIUS, height: stemLength },
            ]}
          />
          <View
            style={[
              styles.handKnob,
              {
                left: r - KNOB_RADIUS,
                top: NUMBER_INSET - KNOB_RADIUS,
                width: KNOB_RADIUS * 2,
                height: KNOB_RADIUS * 2,
                borderRadius: KNOB_RADIUS,
              },
            ]}
          />
          {/* Off-label minutes get a small centre dot so the exact value is visible. */}
          {mode === 'minute' && minute % 5 !== 0 ? (
            <View style={[styles.handDot, { left: r - 3, top: NUMBER_INSET - 3 }]} />
          ) : null}
        </View>

        {/* Centre pin */}
        <View pointerEvents="none" style={[styles.centerPin, { left: r - 4.5, top: r - 4.5 }]} />

        {/* Numbers */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {labels.map((label, i) => {
            const { x, y } = slotPosition(i, size);
            const active = i === activeIndex;
            return (
              <View
                key={label}
                style={[styles.labelBox, { left: x - LABEL_BOX / 2, top: y - LABEL_BOX / 2 }]}>
                <Text style={[styles.labelText, active && styles.labelTextActive]}>{label}</Text>
              </View>
            );
          })}
        </View>

        {/* Minute tick marks between the 5-minute labels */}
        {mode === 'minute' ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: 60 }, (_, m) => m)
              .filter((m) => m % 5 !== 0)
              .map((m) => {
                const a = (m * 6 * Math.PI) / 180;
                const tickRadius = r - 8;
                return (
                  <View
                    key={m}
                    style={[
                      styles.tick,
                      {
                        left: r + tickRadius * Math.sin(a) - 1,
                        top: r - tickRadius * Math.cos(a) - 1,
                      },
                    ]}
                  />
                );
              })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

export function ClockTimePickerModal({
  visible,
  value,
  title = 'Select time',
  minuteStep = 1,
  confirmLabel = 'OK',
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  value: number;
  title?: string;
  minuteStep?: number;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}>
      {/*
       * The sheet is only mounted while `visible`, so its draft state is
       * naturally re-seeded from `value` on every open — no effects needed.
       */}
      {visible ? (
        <ClockSheet
          initial={value}
          title={title}
          minuteStep={minuteStep}
          confirmLabel={confirmLabel}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
}

function ClockSheet({
  initial,
  title,
  minuteStep,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  initial: number;
  title: string;
  minuteStep: number;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);

  const [draft, setDraft] = useState(initial);
  const [mode, setMode] = useState<ClockMode>('hour');

  return (
    <Pressable style={styles.backdrop} onPress={onCancel}>
      {/* Inner pressable swallows taps so they don't dismiss the sheet. */}
      <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptic();
              setDraft(nowMinutes());
            }}
            style={({ pressed }) => [styles.nowBtn, pressed && styles.pressed]}>
            <Ionicons name="time-outline" size={14} color={Palette.primary} />
            <Text style={styles.nowText}>Now</Text>
          </Pressable>
        </View>

        <ClockDial
          value={draft}
          onChange={setDraft}
          mode={mode}
          onModeChange={setMode}
          minuteStep={minuteStep}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}>
            <Text style={styles.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onConfirm(draft)}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryPressed]}>
            <Text style={styles.primaryText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `input`  — bordered box, matches the TextInputs on add-class / daily-plan.
 * `pill`   — compact tinted pill, matches the routine / wizard card rows.
 */
export type ClockFieldVariant = 'input' | 'pill';

export function ClockTimeField({
  label,
  value,
  onChange,
  title,
  minuteStep = 1,
  icon = 'time-outline',
  variant = 'input',
  tone = 'card',
  helper,
  compareTo,
}: {
  label?: string;
  value: number;
  onChange: (minutes: number) => void;
  title?: string;
  minuteStep?: number;
  icon?: IoniconName;
  variant?: ClockFieldVariant;
  /** `bg` when the field sits *inside* a card, so it doesn't blend into it. */
  tone?: 'card' | 'bg';
  helper?: string;
  /** When set, shows the duration from this value to `value` under the field. */
  compareTo?: number;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette, Tint), [Palette, Tint]);
  const [open, setOpen] = useState(false);

  const sub =
    helper ?? (compareTo != null && value > compareTo ? formatDuration(compareTo, value) : undefined);

  const trigger =
    variant === 'pill' ? (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <Ionicons name={icon} size={15} color={Palette.primary} />
        <Text style={styles.pillText}>{formatTime(value)}</Text>
      </Pressable>
    ) : (
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.fieldBox,
          tone === 'bg' && { backgroundColor: Palette.bg },
          pressed && styles.fieldBoxPressed,
        ]}>
        <Ionicons name={icon} size={18} color={Palette.subtle} style={styles.fieldIcon} />
        <Text style={styles.fieldValue}>{formatTime(value)}</Text>
        <Ionicons name="chevron-forward" size={16} color={Palette.subtle} />
      </Pressable>
    );

  return (
    <View style={variant === 'pill' ? undefined : styles.fieldWrap}>
      {label && variant !== 'pill' ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {trigger}
      {sub && variant !== 'pill' ? <Text style={styles.fieldHelper}>{sub}</Text> : null}

      <ClockTimePickerModal
        visible={open}
        value={value}
        title={title ?? label ?? 'Select time'}
        minuteStep={minuteStep}
        onCancel={() => setOpen(false)}
        onConfirm={(v) => {
          setOpen(false);
          onChange(v);
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

function createStyles(Palette: AppPalette, Tint: AppTint) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },

    /* Dial ------------------------------------------------------------- */
    dialArea: { alignItems: 'center' },

    readout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    readoutNum: {
      fontFamily: FontFamily,
      fontSize: 44,
      fontWeight: '800',
      letterSpacing: -1,
      color: Palette.subtle,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    readoutNumActive: { color: Palette.primary },
    readoutColon: {
      fontFamily: FontFamily,
      fontSize: 40,
      fontWeight: '800',
      color: Palette.subtle,
      marginTop: -4,
    },
    periodCol: { marginLeft: 12, gap: 4 },
    periodBtn: {
      width: 46,
      height: 30,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    periodBtnOn: { backgroundColor: Palette.primary, borderColor: Palette.primary },
    periodText: { fontFamily: FontFamily, fontSize: 13, fontWeight: '800', color: Palette.muted },
    periodTextOn: { color: '#FFFFFF' },

    hint: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '600',
      color: Palette.subtle,
      marginTop: 2,
      marginBottom: 14,
    },

    dial: { backgroundColor: Tint.primary, overflow: 'hidden' },
    handWrap: { position: 'absolute', left: 0, top: 0 },
    handStem: { position: 'absolute', width: 2.5, backgroundColor: Palette.primary },
    handKnob: { position: 'absolute', backgroundColor: Palette.primary },
    handDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
    centerPin: {
      position: 'absolute',
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: Palette.primary,
    },

    labelBox: {
      position: 'absolute',
      width: LABEL_BOX,
      height: LABEL_BOX,
      alignItems: 'center',
      justifyContent: 'center',
    },
    labelText: { fontFamily: FontFamily, fontSize: 17, fontWeight: '700', color: Palette.ink },
    labelTextActive: { color: '#FFFFFF', fontWeight: '800' },
    tick: {
      position: 'absolute',
      width: 2.5,
      height: 2.5,
      borderRadius: 1.5,
      backgroundColor: Palette.subtle,
      opacity: 0.55,
    },

    /* Modal ------------------------------------------------------------ */
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(12,10,28,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: Palette.card,
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
      shadowColor: '#000000',
      shadowOpacity: 0.28,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
      elevation: 16,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { fontFamily: FontFamily, fontSize: 15, fontWeight: '800', color: Palette.ink },
    nowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: Tint.primary,
      borderRadius: 10,
      paddingHorizontal: 10,
      height: 30,
    },
    nowText: { fontFamily: FontFamily, fontSize: 12, fontWeight: '800', color: Palette.primary },

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
    primaryPressed: { backgroundColor: Palette.primaryDark },
    primaryText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

    /* Field ------------------------------------------------------------ */
    fieldWrap: { marginBottom: 20 },
    fieldLabel: {
      fontFamily: FontFamily,
      fontSize: 14,
      fontWeight: '700',
      color: Palette.ink,
      marginBottom: 10,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Palette.card,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: Palette.hairline,
      paddingHorizontal: 14,
      height: 58,
    },
    fieldBoxPressed: { borderColor: Palette.primary },
    fieldIcon: { marginRight: 10 },
    fieldValue: { flex: 1, fontFamily: FontFamily, fontSize: 15, fontWeight: '700', color: Palette.ink },
    fieldHelper: {
      fontFamily: FontFamily,
      fontSize: 12,
      fontWeight: '600',
      color: Palette.muted,
      marginTop: 6,
      marginLeft: 4,
    },

    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: Tint.primary,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 44,
    },
    pillText: { fontFamily: FontFamily, fontSize: 16, fontWeight: '800', color: Palette.primary },
  });
}
