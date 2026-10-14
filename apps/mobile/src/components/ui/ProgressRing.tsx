import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';
import { progressRatio, ringGeometry } from './progress';

type ProgressRingProps = {
  value: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Contenido centrado dentro del anillo (p. ej. el porcentaje). */
  children?: ReactNode;
  accessibilityLabel: string;
};

/** Indicador circular de progreso. Con total 0 muestra el anillo vacío, nunca un valor inventado. */
export function ProgressRing({
  value,
  total,
  size = 96,
  strokeWidth = 8,
  color = colors.accent,
  children,
  accessibilityLabel,
}: ProgressRingProps) {
  const ratio = progressRatio(value, total);
  const { r, circumference, dashOffset } = ringGeometry(size, strokeWidth, ratio);
  const c = size / 2;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
