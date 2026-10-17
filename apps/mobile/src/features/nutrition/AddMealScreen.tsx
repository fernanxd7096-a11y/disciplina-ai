import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Notice, Screen, SectionHeader, SegmentedControl, Text } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { localHour } from '@/lib/dates';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { spacing } from '@/theme';
import { useAddMeal } from './api';
import { GramsRow, MacroLine } from './components';
import { FoodSearch } from './FoodSearch';
import { defaultMealType, draftFromFood, mealOrder, mealTypeLabels, sumMacros, withGrams } from './logic';
import type { DraftItem, MealType } from './types';

export function MealTypePicker({ value, onChange }: { value: MealType; onChange: (t: MealType) => void }) {
  return <SegmentedControl accessibilityLabel="Tipo de comida" value={value} onChange={onChange} options={mealOrder.map((t) => ({ value: t, label: mealTypeLabels[t] }))} />;
}

export function AddMealScreen({ initialType }: { initialType?: MealType }) {
  const tz = useUserTimeZone();
  const online = useIsOnline();
  const add = useAddMeal();
  const [type, setType] = useState<MealType>(initialType ?? defaultMealType(localHour(new Date(), tz)));
  const [items, setItems] = useState<DraftItem[]>([]);
  const [tried, setTried] = useState(false);
  const total = sumMacros(items);

  async function save() {
    setTried(true);
    if (!online || !items.length) return;
    try {
      await add.mutateAsync({ eaten_at: new Date().toISOString(), meal_type: type, origin: 'manual', items });
      if (router.canGoBack()) router.back();
      else router.replace('/nutrition');
    } catch {
      // aviso abajo
    }
  }

  return (
    <Screen testID="add-meal-screen" edges={[]}>
      <Stack.Screen options={{ title: 'Agregar comida' }} />
      <MealTypePicker value={type} onChange={setType} />

      {items.length ? (
        <Card testID="draft-items">
          {items.map((it) => (
            <GramsRow
              key={it.key}
              name={it.name}
              grams={it.grams}
              macros={it}
              estimated={false}
              onGrams={(g) => setItems((o) => o.map((x) => (x.key === it.key ? withGrams(x, g) : x)))}
              onRemove={() => setItems((o) => o.filter((x) => x.key !== it.key))}
              testID={`draft-${it.food_id}`}
            />
          ))}
          <MacroLine m={total} prefix="Total: " />
        </Card>
      ) : (
        <Text variant="caption" color="textMuted">
          Busca y toca un alimento para agregarlo. Se propone una porción típica que puedes cambiar.
        </Text>
      )}

      <SectionHeader title="Alimentos" />
      <FoodSearch onPick={(f) => setItems((o) => [...o, draftFromFood(f)])} />

      {tried && !online ? <Notice tone="info" message={OFFLINE_SAVE_MESSAGE} /> : null}
      {tried && online && !items.length ? <Notice tone="info" message="Agrega al menos un alimento." /> : null}
      {add.isError ? <Notice tone="error" message="No se pudo guardar la comida. Inténtalo de nuevo." /> : null}
      <View style={styles.bottom}>
        <Button label={`Guardar ${mealTypeLabels[type].toLowerCase()}`} icon="checkmark" onPress={save} loading={add.isPending} fullWidth testID="save-meal" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bottom: { marginTop: spacing.md },
});
