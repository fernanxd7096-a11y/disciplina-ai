import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { colors, minTouchSize, radius, spacing } from '@/theme';
import type { Macros } from './types';

export function MacroBar({ label, value, target, color, unit = 'g' }: { label: string; value: number; target: number | null; color: string; unit?: string }) {
  const ratio = target ? Math.min(value / target, 1) : 0;
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${label}: ${Math.round(value)} ${unit}${target ? ` de ${target}` : ''}`}>
      <View style={styles.between}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="caption">
          {Math.round(value)}
          {target ? ` / ${target}` : ''} {unit}
        </Text>
      </View>
      {target ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
        </View>
      ) : null}
    </View>
  );
}

export function MacroLine({ m, prefix = '' }: { m: Macros; prefix?: string }) {
  return (
    <Text variant="caption" color="textSecondary">
      {prefix}
      {Math.round(m.kcal)} kcal · P {Math.round(m.protein_g)} g · C {Math.round(m.carbs_g)} g · G {Math.round(m.fat_g)} g
    </Text>
  );
}

/** Fila editable de un alimento: gramos en línea, quitar, y su origen (base o IA). */
export function GramsRow({
  name,
  grams,
  macros,
  estimated,
  onGrams,
  onRemove,
  testID,
}: {
  name: string;
  grams: number;
  macros: Macros;
  estimated: boolean;
  onGrams: (g: number) => void;
  onRemove?: () => void;
  testID?: string;
}) {
  const [text, setText] = useState(String(Math.round(grams)));
  const [prev, setPrev] = useState(grams);
  if (prev !== grams) {
    setPrev(grams);
    setText(String(Math.round(grams)));
  }
  function commit(t: string) {
    const g = Number(t.replace(',', '.'));
    if (Number.isFinite(g) && g >= 1 && g <= 3000) onGrams(Math.round(g));
    else setText(String(Math.round(grams)));
  }
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text variant="bodyStrong" style={styles.flex}>
            {name}
          </Text>
          {estimated ? <Badge label="Estimación IA" tone="warning" /> : null}
        </View>
        <MacroLine m={macros} />
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={(e) => commit(e.nativeEvent.text)}
        onSubmitEditing={(e) => commit(e.nativeEvent.text)}
        keyboardType="number-pad"
        style={styles.input}
        accessibilityLabel={`Gramos de ${name}`}
        testID={testID ? `${testID}-grams` : undefined}
      />
      <Text variant="caption" color="textSecondary">
        g
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Quitar ${name}`} style={styles.hit} testID={testID ? `${testID}-remove` : undefined}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  macro: { gap: spacing.xs },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
  input: { minWidth: 64, minHeight: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, textAlign: 'center', fontSize: 16, paddingHorizontal: spacing.sm },
  hit: { width: minTouchSize, height: minTouchSize, alignItems: 'center', justifyContent: 'center' },
});
