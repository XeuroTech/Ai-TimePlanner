/**
 * Chart primitives drawn with plain React Native `View`s.
 *
 * Deliberately dependency-free, in the same spirit as `components/progress-ring`
 * and `components/ui/clock-time-picker`: no react-native-svg, no chart package,
 * nothing that would force a fresh native build. Everything is rectangles,
 * border radii and flexbox.
 *
 *  - `BarChart`        vertical bars with labels + optional value callouts
 *  - `StackedBar`      one horizontal bar split into proportional segments
 *  - `Sparkline`       compact trend strip built from stepped columns
 *  - `LegendRow`       colour swatch + label + value, for breakdown lists
 *  - `StatTile`        small labelled metric card
 */
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { AppPalette, FontFamily } from '@/constants/palette';
import { useAppTheme } from '@/hooks/use-app-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* -------------------------------------------------------------------------- */
/* Bar chart                                                                  */
/* -------------------------------------------------------------------------- */

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  /** Renders in the accent colour instead of the muted one. */
  highlight?: boolean;
};

/**
 * Vertical bar chart.
 *
 * Bars are sized as a fraction of the largest value rather than of a fixed
 * scale, so a week with a max of 3 still reads clearly. A zero-value day keeps
 * a 3px stub so the axis never looks broken.
 */
export function BarChart({
  data,
  height = 132,
  color,
  mutedColor,
  showValues = true,
  style,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  mutedColor?: string;
  showValues?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { Palette, Tint } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);

  const accent = color ?? Palette.primary;
  const muted = mutedColor ?? Tint.primary;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={[styles.barWrap, style]}>
      <View style={[styles.barRow, { height }]}>
        {data.map((d) => {
          const ratio = d.value / max;
          // 3px stub keeps empty days visible; the rest scales into the space
          // left over after the value label.
          const barHeight = Math.max(3, ratio * (height - (showValues ? 22 : 6)));
          return (
            <View key={d.key} style={styles.barColumn}>
              {showValues ? (
                <Text style={[styles.barValue, d.value === 0 && styles.barValueEmpty]}>
                  {d.value}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: d.highlight ? accent : d.value > 0 ? accent + 'AA' : muted,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {data.map((d) => (
          <View key={d.key} style={styles.barColumn}>
            <Text style={[styles.barLabel, d.highlight && { color: accent, fontWeight: '800' }]}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Stacked bar                                                                */
/* -------------------------------------------------------------------------- */

export type StackSegment = { key: string; value: number; color: string };

/** Horizontal proportional bar. Segments under ~2% are dropped so they don't render as slivers. */
export function StackedBar({
  segments,
  height = 14,
  style,
}: {
  segments: StackSegment[];
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { Palette } = useAppTheme();
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  if (total <= 0) {
    return (
      <View
        style={[{ height, borderRadius: height / 2, backgroundColor: Palette.hairline }, style]}
      />
    );
  }

  const visible = segments.filter((s) => s.value / total >= 0.02);

  return (
    <View style={[{ height, borderRadius: height / 2, overflow: 'hidden', flexDirection: 'row' }, style]}>
      {visible.map((s) => (
        <View key={s.key} style={{ flex: s.value, backgroundColor: s.color }} />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compact trend strip for longer ranges (e.g. 30 days) where a labelled bar
 * chart would be unreadable. Rendered as thin stepped columns.
 */
export function Sparkline({
  values,
  height = 56,
  color,
  style,
}: {
  values: number[];
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { Palette, Tint } = useAppTheme();
  const accent = color ?? Palette.primary;
  const max = Math.max(1, ...values);

  return (
    <View style={[{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }, style]}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(2, (v / max) * height),
            borderRadius: 2,
            backgroundColor: v > 0 ? accent + 'CC' : Tint.primary,
          }}
        />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Legend row                                                                 */
/* -------------------------------------------------------------------------- */

export function LegendRow({
  color,
  label,
  value,
  caption,
  progress,
}: {
  color: string;
  label: string;
  value: string;
  caption?: string;
  /** Draws an inline track underneath when provided (0..1). */
  progress?: number;
}) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={styles.legendBody}>
        <View style={styles.legendTop}>
          <Text style={styles.legendLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.legendValue}>{value}</Text>
        </View>
        {typeof progress === 'number' ? (
          <View style={styles.legendTrack}>
            <View
              style={[
                styles.legendFill,
                { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, backgroundColor: color },
              ]}
            />
          </View>
        ) : null}
        {caption ? <Text style={styles.legendCaption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat tile                                                                  */
/* -------------------------------------------------------------------------- */

export function StatTile({
  icon,
  color,
  tint,
  value,
  label,
  style,
}: {
  icon: IoniconName;
  color: string;
  tint: string;
  value: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { Palette } = useAppTheme();
  const styles = useMemo(() => createStyles(Palette), [Palette]);
  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const CARD_SHADOW = {
  shadowColor: '#3A2E7A',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

function createStyles(Palette: AppPalette) {
  return StyleSheet.create({
    barWrap: { width: '100%' },
    barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    barColumn: { flex: 1, alignItems: 'center' },
    bar: { width: '100%', maxWidth: 30, borderRadius: 8 },
    barValue: {
      fontFamily: FontFamily,
      fontSize: 11,
      fontWeight: '800',
      color: Palette.muted,
      marginBottom: 4,
    },
    barValueEmpty: { color: Palette.subtle, opacity: 0.55 },
    barLabels: { flexDirection: 'row', gap: 6, marginTop: 8 },
    barLabel: { fontFamily: FontFamily, fontSize: 11, fontWeight: '600', color: Palette.subtle },

    legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
    legendDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
    legendBody: { flex: 1 },
    legendTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    legendLabel: { flex: 1, fontFamily: FontFamily, fontSize: 14, fontWeight: '700', color: Palette.ink },
    legendValue: { fontFamily: FontFamily, fontSize: 13, fontWeight: '700', color: Palette.muted },
    legendTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: Palette.hairline,
      marginTop: 8,
      overflow: 'hidden',
    },
    legendFill: { height: '100%', borderRadius: 3 },
    legendCaption: { fontFamily: FontFamily, fontSize: 12, fontWeight: '500', color: Palette.subtle, marginTop: 5 },

    tile: {
      flex: 1,
      backgroundColor: Palette.card,
      borderRadius: 20,
      padding: 14,
      ...CARD_SHADOW,
    },
    tileIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    tileValue: { fontFamily: FontFamily, fontSize: 22, fontWeight: '800', color: Palette.ink, letterSpacing: -0.5 },
    tileLabel: { fontFamily: FontFamily, fontSize: 12, fontWeight: '600', color: Palette.muted, marginTop: 2 },
  });
}
