import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { domain, formatTick, scale } from './scale';

export type LinePoint = { label: string; value: number };

type Props = {
  points: LinePoint[];
  color?: string;
  height?: number;
  /** Línea horizontal de referencia (p. ej. meta). */
  target?: { value: number; label: string };
  unit?: string;
  accessibilityLabel: string;
  testID?: string;
};

const PAD = { top: 12, right: 12, bottom: 22, left: 36 };

export function LineChart({ points, color = colors.accent, height = 160, target, unit = '', accessibilityLabel, testID }: Props) {
  const [width, setWidth] = useState(0);
  if (points.length === 0) {
    return (
      <Text variant="caption" color="textMuted" testID={testID}>
        Sin datos todavía.
      </Text>
    );
  }
  const d = domain(
    points.map((p) => p.value),
    { extra: target ? [target.value] : [] },
  );
  const w = Math.max(width - PAD.left - PAD.right, 1);
  const h = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => PAD.top + scale(v, d.min, d.max, h, 0);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(points.length / 5));

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {d.ticks.map((t) => (
            <Line key={`g${t}`} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={colors.border} strokeWidth={1} />
          ))}
          {d.ticks.map((t) => (
            <SvgText key={`t${t}`} x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={colors.textMuted} textAnchor="end">
              {formatTick(t)}
            </SvgText>
          ))}
          {target ? (
            <Line x1={PAD.left} x2={width - PAD.right} y1={y(target.value)} y2={y(target.value)} stroke={colors.warning} strokeDasharray="4 4" strokeWidth={1.5} />
          ) : null}
          <Path d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <Circle key={i} cx={x(i)} cy={y(p.value)} r={points.length > 30 ? 0 : 3.5} fill={color} />
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <SvgText key={`l${i}`} x={x(i)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
      {target ? (
        <View style={styles.legend}>
          <View style={[styles.dash, { backgroundColor: colors.warning }]} />
          <Text variant="caption" color="textMuted">
            {target.label}
            {unit ? ` (${formatTick(target.value)} ${unit})` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { position: 'absolute', right: PAD.right, top: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dash: { width: 12, height: 2 },
});
