import { router, Stack } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, ErrorState, LoadingState, Screen, Text } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { spacing } from '@/theme';
import { useDeleteMeal, useDeleteMealItem, useMeals, useUpdateMealItem } from './api';
import { GramsRow, MacroLine } from './components';
import { hasEstimates, mealTypeLabels, sumMacros } from './logic';

export function MealScreen({ id }: { id: string }) {
  const tz = useUserTimeZone();
  const meals = useMeals();
  const update = useUpdateMealItem();
  const delItem = useDeleteMealItem();
  const del = useDeleteMeal();

  if (meals.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  const meal = meals.data?.find((m) => m.id === id);
  if (!meal) {
    return (
      <Screen edges={[]}>
        <ErrorState message="No se encontró la comida." onRetry={() => meals.refetch()} />
      </Screen>
    );
  }

  function remove() {
    Alert.alert('Eliminar comida', 'Se quitará de tu diario.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await del.mutateAsync(meal!);
            router.back();
          } catch {
            Alert.alert('No se pudo eliminar', 'Revisa tu conexión.');
          }
        },
      },
    ]);
  }

  return (
    <Screen testID="meal-screen" edges={[]}>
      <Stack.Screen options={{ title: mealTypeLabels[meal.meal_type] }} />
      <View style={styles.wrap}>
        <Badge label={new Intl.DateTimeFormat('es-PE', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(meal.eaten_at))} />
        <Badge label={meal.origin === 'photo' ? 'Desde foto' : 'Registro manual'} tone={meal.origin === 'photo' ? 'accent' : 'neutral'} />
        {hasEstimates(meal.items) ? <Badge label="Incluye estimaciones de IA" tone="warning" /> : null}
      </View>
      <Card>
        {meal.items.map((it) => (
          <GramsRow
            key={it.id}
            name={it.name}
            grams={it.grams}
            macros={it}
            estimated={it.is_ai_estimate && !it.user_edited}
            onGrams={(g) => {
              const f = g / it.grams;
              const r = (n: number) => Math.round(n * f * 10) / 10;
              update.mutate({ id: it.id, grams: g, kcal: r(it.kcal), protein_g: r(it.protein_g), carbs_g: r(it.carbs_g), fat_g: r(it.fat_g) });
            }}
            onRemove={meal.items.length > 1 ? () => delItem.mutate({ id: it.id, meal_id: meal.id }) : undefined}
            testID={`item-${it.id}`}
          />
        ))}
        <MacroLine m={sumMacros(meal.items)} prefix="Total: " />
      </Card>
      {update.isError ? (
        <Text variant="caption" color="danger">
          No se pudo guardar el cambio.
        </Text>
      ) : null}
      <Button label="Eliminar comida" variant="danger" onPress={remove} fullWidth testID="delete-meal" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
