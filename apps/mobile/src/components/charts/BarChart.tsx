import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import { colors } from '@/theme';
import { domain, formatTick, scale } from './scale';

export type Bar = { label: string; value: number; /** Barra con trazo punteado: dato estimado. */ estimated?: boolean };

type Props = {
  bars: Bar[];
  color?: string;
  height?: number;
  /** Línea de meta horizontal. */
  target?: number;
  /** Escala fija (p. ej. 0–100 %). */
  max?: number;
  accessibilityLabel: string;
  testID?: string;
};

const PAD = { top: 10, right: 8, bottom: 22, left: 34 };

export function BarChart({ bars, color = colors.accent, height = 150, target, max, accessibilityLabel, testID }: Props) {
  const [width, setWidth] = useState(0);
  if (bars.length === 0) {
    return (
      <Text variant="caption" color="textMuted" testID={testID}>
        Sin datos todavía.
      </Text>
    );
  }
  const d = max != null ? domain([0, max], { includeZero: true }) : domain(bars.map((b) => b.value), { includeZero: true, extra: target != null ? [target] : [] });
  const w = Math.max(width - PAD.left - PAD.right, 1);
  const h = height - PAD.top - PAD.bottom;
  const slot = w / bars.length;
  const barW = Math.max(Math.min(slot * 0.6, 28), 2);
  const y = (v: number) => PAD.top + scale(v, d.min, d.max, h, 0);
  const labelEvery = Math.max(1, Math.ceil(bars.length / 7));

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID={testID}>
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
          {bars.map((b, i) => {
            const top = y(Math.max(b.value, 0));
            const bh = Math.max(y(0) - top, b.value > 0 ? 2 : 0);
            const bx = PAD.left + i * slot + (slot - barW) / 2;
            return (
              <Rect
                key={i}
                x={bx}
                y={y(0) - bh}
                width={barW}
                height={bh}
                rx={3}
                fill={b.estimated ? 'transparent' : color}
                stroke={color}
                strokeWidth={b.estimated ? 1.5 : 0}
                strokeDasharray={b.estimated ? '3 3' : undefined}
              />
            );
          })}
          {target != null ? (
            <Line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} stroke={colors.warning} strokeDasharray="4 4" strokeWidth={1.5} />
          ) : null}
          {bars.map((b, i) =>
            i % labelEvery === 0 || i === bars.length - 1 ? (
              <SvgText key={`l${i}`} x={PAD.left + i * slot + slot / 2} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor="middle">
                {b.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

export { formatTick };
