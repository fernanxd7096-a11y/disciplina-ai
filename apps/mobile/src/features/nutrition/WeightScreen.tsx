import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts';
import { Button, Card, Notice, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { useToday } from '@/features/habits/api';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { colors, minTouchSize, spacing } from '@/theme';
import { useDeleteWeight, useLogWeight, useNutritionGoal, useWeights } from './api';
import { trendWarning, weeklyTrend } from './logic';

export function WeightScreen() {
  const online = useIsOnline();
  const today = useToday();
  const weights = useWeights();
  const goal = useNutritionGoal();
  const log = useLogWeight();
  const del = useDeleteWeight();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = weights.data ?? [];
  const trend = weeklyTrend(list, today);
  const warning = trendWarning(trend, list.at(-1)?.weight_kg ?? null);

  async function save() {
    const w = Number(value.replace(',', '.'));
    if (!Number.isFinite(w) || w < 25 || w > 350) return setError('Escribe un peso entre 25 y 350 kg.');
    setError(null);
    if (!online) return setError(OFFLINE_SAVE_MESSAGE);
    try {
      await log.mutateAsync({ measured_on: today, weight_kg: Math.round(w * 100) / 100 });
      setValue('');
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.');
    }
  }

  return (
    <Screen testID="weight-screen" edges={[]}>
      <Stack.Screen options={{ title: 'Peso' }} />
      <Card>
        <TextField label="Peso de hoy (kg)" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="Ej.: 78,4" error={error ?? undefined} testID="weight-input" />
        <Text variant="caption" color="textMuted">
          Pésate a la misma hora (idealmente en ayunas). El peso varía 1–2 kg de un día a otro por agua; mira la tendencia, no un día suelto.
        </Text>
        <Button label="Guardar" icon="checkmark" onPress={save} loading={log.isPending} fullWidth testID="save-weight" />
      </Card>

      <SectionHeader title="Evolución" />
      <Card>
        <LineChart
          points={list.map((w) => ({ label: w.measured_on.slice(5).replace('-', '/'), value: w.weight_kg }))}
          color={colors.nutrition}
          height={200}
          unit="kg"
          accessibilityLabel={`Evolución del peso: ${list.length} registros`}
          testID="weight-chart"
        />
        {trend != null ? (
          <Text variant="caption" color="textSecondary" testID="weight-trend">
            Tendencia últimas 4 semanas: {trend > 0 ? '+' : ''}
            {trend} kg por semana (calculado con tus registros).
          </Text>
        ) : null}
        {goal.data ? (
          <Text variant="caption" color="textMuted">
            Si en 2–3 semanas la tendencia no va hacia tu objetivo, ajusta tu meta calórica unas 100–200 kcal.
          </Text>
        ) : null}
      </Card>
      {warning ? <Notice tone="info" message={warning} /> : null}

      <SectionHeader title="Registros" />
      {[...list].reverse().map((w) => (
        <View key={w.id} style={styles.row}>
          <Text variant="body" style={styles.flex}>
            {w.measured_on}
          </Text>
          <Text variant="bodyStrong">{w.weight_kg} kg</Text>
          <Pressable
            onPress={() =>
              Alert.alert('Eliminar registro', `¿Borrar ${w.weight_kg} kg del ${w.measured_on}?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: () => del.mutate(w.id) },
              ])
            }
            accessibilityRole="button"
            accessibilityLabel={`Eliminar registro del ${w.measured_on}`}
            style={styles.hit}>
            <Text variant="caption" color="danger">
              Borrar
            </Text>
          </Pressable>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: minTouchSize, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  flex: { flex: 1 },
  hit: { minHeight: minTouchSize, justifyContent: 'center', paddingHorizontal: spacing.sm },
});
