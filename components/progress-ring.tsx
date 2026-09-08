import { ReactNode } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * Pure-RN circular progress ring (no SVG dependency).
 *
 * Each colored arc is a right-half-clipped semicircle rotated with
 * `transformOrigin` so it renders correctly regardless of paint order.
 * Arcs greater than 180° are split into two chunks.
 */
type Slice = { key: string; phi: number; theta: number; color: string };

function buildSlices(segments: { value: number; color: string }[]): Slice[] {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const slices: Slice[] = [];
  let acc = 0;
  segments.forEach((seg, idx) => {
    const sweep = (seg.value / total) * 360;
    let start = acc;
    let remaining = sweep;
    let part = 0;
    while (remaining > 0.001) {
      const chunk = Math.min(remaining, 180);
      slices.push({ key: `${idx}-${part}`, phi: start, theta: chunk, color: seg.color });
      start += chunk;
      remaining -= chunk;
      part += 1;
    }
    acc += sweep;
  });
  return slices;
}

export function ProgressRing({
  size,
  thickness,
  progress,
  color,
  trackColor,
  holeColor,
  children,
}: {
  size: number;
  thickness: number;
  progress: number; // 0..1
  color?: string;
  trackColor?: string;
  holeColor?: string;
  children?: ReactNode;
}) {
  const { Palette } = useAppTheme();
  const resolvedColor = color ?? Palette.primary;
  const resolvedTrackColor = trackColor ?? Palette.hairline;
  const resolvedHoleColor = holeColor ?? Palette.card;
  const R = size / 2;
  const pct = Math.max(0, Math.min(1, progress));
  const holeSize = size - thickness * 2;

  const slices = buildSlices([
    { value: pct, color: resolvedColor },
    { value: 1 - pct, color: resolvedTrackColor },
  ]);

  return (
    <View style={{ width: size, height: size }}>
      {slices.map((s) => (
        <View
          key={s.key}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ rotate: `${s.phi + s.theta - 180}deg` }],
          }}>
          <View
            style={{
              position: 'absolute',
              left: R,
              top: 0,
              width: R,
              height: size,
              borderTopRightRadius: R,
              borderBottomRightRadius: R,
              overflow: 'hidden',
            }}>
            <View
              style={{
                width: R,
                height: size,
                borderTopRightRadius: R,
                borderBottomRightRadius: R,
                backgroundColor: s.color,
                transformOrigin: '0% 50%',
                transform: [{ rotate: `${180 - s.theta}deg` }],
              }}
            />
          </View>
        </View>
      ))}
      <View
        style={{
          position: 'absolute',
          left: thickness,
          top: thickness,
          width: holeSize,
          height: holeSize,
          borderRadius: holeSize / 2,
          backgroundColor: resolvedHoleColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {children}
      </View>
    </View>
  );
}
