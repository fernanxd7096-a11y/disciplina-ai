import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { BarChart, LineChart } from '@/components/charts';
import { Badge, Button, Card, ErrorState, IconButton, LoadingState, Notice, ProgressRing, Screen, ScreenHeader, SectionHeader, Text } from '@/components/ui';
import { addDays } from '@/features/habits/logic';
import { useToday } from '@/features/habits/api';
import { useUserTimeZone } from '@/features/profile/api';
import { localDayKey } from '@/lib/dates';
import { colors, spacing } from '@/theme';
import { useCatalogFoods, useMeals, useNutritionGoal, useWeights } from './api';
import { MacroBar, MacroLine } from './components';
import { hasEstimates, mealOrder, mealTypeLabels, suggestFoods, sumMacros, trendWarning, weeklyTrend } from './logic';
import type { Meal } from './types';

export function NutritionScreen() {
  const tz = useUserTimeZone();
  const today = useToday();
  const meals = useMeals();
  const goal = useNutritionGoal();
  const weights = useWeights();
  const foods = useCatalogFoods();

  const dayOf = (m: Pick<Meal, 'eaten_at'>) => localDayKey(new Date(m.eaten_at), tz);
  const all = useMemo(() => meals.data ?? [], [meals.data]);
  const todayMeals = all.filter((m) => dayOf(m) === today);
  const totals = sumMacros(todayMeals.flatMap((m) => m.items));
  const g = goal.data;
  const remaining = g ? { kcal: g.kcal_target - totals.kcal, protein_g: g.protein_g - totals.protein_g, carbs_g: g.carbs_g - totals.carbs_g, fat_g: g.fat_g - totals.fat_g } : null;
  const estimated = hasEstimates(todayMeals.flatMap((m) => m.items));

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => {
    const items = all.filter((m) => dayOf(m) === d).flatMap((m) => m.items);
    return { label: d.slice(8), value: Math.round(sumMacros(items).kcal), estimated: hasEstimates(items) };
  });

  const w = weights.data ?? [];
  const lastW = w.at(-1);
  const trend = weeklyTrend(w, today);
  const warning = trendWarning(trend, lastW?.weight_kg ?? null);

  const header = (
    <ScreenHeader
      title="Nutrición"
      right={<IconButton icon="flag-outline" accessibilityLabel="Objetivo nutricional" onPress={() => router.push('/nutrition/goal')} testID="open-goal" />}
    />
  );

  if (meals.isLoading || goal.isLoading) {
    return (
      <Screen testID="nutrition-screen">
        {header}
        <LoadingState label="Cargando tu diario…" />
      </Screen>
    );
  }
  if (meals.error && !meals.data) {
    return (
      <Screen testID="nutrition-screen">
        {header}
        <ErrorState message="No se pudo cargar tu diario. Revisa tu conexión." onRetry={() => meals.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen
      testID="nutrition-screen"
      refreshControl={<RefreshControl refreshing={meals.isRefetching} onRefresh={() => Promise.all([meals.refetch(), goal.refetch(), weights.refetch()])} tintColor={colors.accent} />}>
      {header}

      <Card testID="nutrition-today">
        <View style={styles.summary}>
          <ProgressRing value={totals.kcal} total={g?.kcal_target ?? Math.max(totals.kcal, 1)} size={104} color={colors.nutrition} accessibilityLabel={`Hoy ${Math.round(totals.kcal)} kcal${g ? ` de ${g.kcal_target}` : ''}`}>
            <Text variant="metric">{Math.round(totals.kcal)}</Text>
            <Text variant="caption" color="textSecondary">
              {g ? `de ${g.kcal_target}` : 'kcal'}
            </Text>
          </ProgressRing>
          <View style={styles.flex}>
            <MacroBar label="Proteína" value={totals.protein_g} target={g?.protein_g ?? null} color={colors.training} />
            <MacroBar label="Carbohidratos" value={totals.carbs_g} target={g?.carbs_g ?? null} color={colors.events} />
            <MacroBar label="Grasas" value={totals.fat_g} target={g?.fat_g ?? null} color={colors.tasks} />
          </View>
        </View>
        <View style={styles.wrap}>
          <Badge label="Valores aproximados" />
          {estimated ? <Badge label="Incluye estimaciones de IA" tone="warning" /> : null}
        </View>
        {!g ? (
          <Button label="Calcular mi objetivo" variant="secondary" icon="calculator-outline" onPress={() => router.push('/nutrition/goal')} fullWidth testID="setup-goal" />
        ) : null}
      </Card>

      <View style={styles.actions}>
        <Button label="Foto de comida" icon="camera" onPress={() => router.push('/nutrition/photo')} grow testID="add-photo" />
        <Button label="Agregar a mano" icon="add" variant="secondary" onPress={() => router.push('/nutrition/add')} grow testID="add-manual" />
      </View>

      <SectionHeader title="Hoy" />
      {todayMeals.length === 0 ? (
        <Text variant="caption" color="textMuted" testID="no-meals-today">
          Aún no registraste comidas hoy.
        </Text>
      ) : (
        mealOrder.map((type) =>
          todayMeals
            .filter((m) => m.meal_type === type)
            .map((m) => (
              <Card key={m.id} onPress={() => router.push(`/nutrition/meal/${m.id}`)} accessibilityLabel={`${mealTypeLabels[m.meal_type]}: ${m.items.map((i) => i.name).join(', ')}`} testID={`meal-${m.id}`}>
                <View style={styles.between}>
                  <Text variant="bodyStrong">{mealTypeLabels[m.meal_type]}</Text>
                  <View style={styles.wrap}>
                    {m.origin === 'photo' ? <Badge label="Foto" tone="accent" /> : null}
                    {hasEstimates(m.items) ? <Badge label="Estimado" tone="warning" /> : null}
                  </View>
                </View>
                <Text variant="caption" color="textSecondary" numberOfLines={2}>
                  {m.items.map((i) => `${i.name} (${Math.round(i.grams)} g)`).join(', ')}
                </Text>
                <MacroLine m={sumMacros(m.items)} />
              </Card>
            )),
        )
      )}

      {remaining && foods.data ? (
        <SuggestionCard remaining={remaining} foods={foods.data} />
      ) : null}

      <SectionHeader title="Últimos 7 días (kcal)" />
      <Card>
        <BarChart bars={week} color={colors.nutrition} target={g?.kcal_target} accessibilityLabel={`Calorías de los últimos 7 días: ${week.map((d) => d.value).join(', ')}`} testID="week-kcal" />
        <Text variant="caption" color="textMuted">
          Barras punteadas: el día incluye estimaciones de IA sin corregir.{g ? ' Línea: tu meta.' : ''}
        </Text>
      </Card>

      <SectionHeader title="Peso" actionLabel="Registrar" onAction={() => router.push('/nutrition/weight')} />
      <Card onPress={() => router.push('/nutrition/weight')} accessibilityLabel="Ver evolución del peso" testID="weight-card">
        {lastW ? (
          <>
            <View style={styles.between}>
              <Text variant="metric">{lastW.weight_kg} kg</Text>
              <Text variant="caption" color="textSecondary">
                {trend == null ? 'Registra al menos 2 semanas para ver la tendencia' : `${trend > 0 ? '+' : ''}${trend} kg/semana`}
              </Text>
            </View>
            <LineChart points={w.slice(-12).map((x) => ({ label: x.measured_on.slice(5).replace('-', '/'), value: x.weight_kg }))} color={colors.nutrition} height={110} accessibilityLabel="Evolución del peso" />
          </>
        ) : (
          <Text variant="caption" color="textMuted">
            Sin registros de peso. Toca para agregar el primero.
          </Text>
        )}
      </Card>
      {warning ? <Notice tone="info" message={warning} /> : null}
    </Screen>
  );
}

function SuggestionCard({ remaining, foods }: { remaining: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }; foods: NonNullable<ReturnType<typeof useCatalogFoods>['data']> }) {
  const s = suggestFoods(remaining, foods);
  return (
    <Card testID="suggestions">
      <Text variant="label" color="textSecondary">
        IDEAS PARA LO QUE QUEDA DEL DÍA
      </Text>
      <Text variant="body">{s.message}</Text>
      {s.items.map((i) => (
        <Text key={i.food.id} variant="caption" color="textSecondary">
          • {i.food.name_es} — {i.food.portion_label ?? `${i.grams} g`} (~{Math.round(i.macros.kcal)} kcal, {Math.round(i.macros.protein_g)} g proteína)
        </Text>
      ))}
      <Text variant="caption" color="textMuted">
        Sugerencias calculadas con la base nutricional, no con IA.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  flex: { flex: 1, gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
});
