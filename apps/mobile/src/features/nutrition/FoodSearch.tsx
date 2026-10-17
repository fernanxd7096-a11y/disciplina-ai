import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Badge, Button, Card, Notice, Text, TextField } from '@/components/ui';
import { validate, type FieldErrors } from '@/lib/validation';
import { colors, minTouchSize, spacing } from '@/theme';
import { useCreateCustomFood, useFoodSearch } from './api';
import type { Food } from './types';

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const sourceLabel = (f: Food) => (f.source === 'usda' ? 'USDA' : f.source === 'peru_ins' ? 'INS Perú' : 'Propio');

/** Buscador de la base nutricional + creación de alimentos propios. */
export function FoodSearch({ onPick }: { onPick: (food: Food) => void }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q, 250);
  const search = useFoodSearch(term);
  const [creating, setCreating] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextField label="Buscar alimento" value={q} onChangeText={setQ} placeholder="arroz, pollo, palta…" autoCorrect={false} testID="food-search" />
      {term.trim().length >= 2 ? (
        search.isLoading ? (
          <Text variant="caption" color="textMuted">
            Buscando…
          </Text>
        ) : search.error ? (
          <Notice tone="error" message="No se pudo buscar. Revisa tu conexión." />
        ) : (search.data ?? []).length === 0 ? (
          <Text variant="caption" color="textMuted" testID="food-search-empty">
            Sin resultados. Puedes crear el alimento con los datos de su etiqueta.
          </Text>
        ) : (
          (search.data ?? []).map((f) => (
            <Pressable key={f.id} onPress={() => onPick(f)} accessibilityRole="button" accessibilityLabel={`Agregar ${f.name_es}`} style={({ pressed }) => [styles.result, pressed && styles.pressed]} testID={`food-${f.id}`}>
              <View style={styles.flex}>
                <Text variant="body">{f.name_es}</Text>
                <Text variant="caption" color="textSecondary">
                  {Math.round(f.kcal_100g)} kcal · P {f.protein_g} · C {f.carbs_g} · G {f.fat_g} por 100 g
                </Text>
              </View>
              <Badge label={sourceLabel(f)} />
            </Pressable>
          ))
        )
      ) : null}
      {creating ? (
        <CustomFoodForm
          initialName={q}
          onCreated={(f) => {
            setCreating(false);
            onPick(f);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <Button label="Crear alimento propio" variant="ghost" icon="create-outline" onPress={() => setCreating(true)} testID="create-food" />
      )}
    </View>
  );
}

const n = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Indica ${label}.`)
    .transform((v) => Number(v.replace(',', '.')))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= max, `${label} entre 0 y ${max}.`);

const customSchema = z
  .object({
    name_es: z.string().trim().min(2, 'Ponle un nombre.').max(120),
    kcal_100g: n('las kcal', 900),
    protein_g: n('la proteína', 100),
    carbs_g: n('los carbohidratos', 100),
    fat_g: n('las grasas', 100),
  })
  .refine((v) => v.protein_g + v.carbs_g + v.fat_g <= 100, { path: ['fat_g'], message: 'Proteína + carbohidratos + grasas no pueden superar 100 g por 100 g.' });

function CustomFoodForm({ initialName, onCreated, onCancel }: { initialName: string; onCreated: (f: Food) => void; onCancel: () => void }) {
  const create = useCreateCustomFood();
  const [v, setV] = useState({ name_es: initialName, kcal_100g: '', protein_g: '', carbs_g: '', fat_g: '' });
  const [errors, setErrors] = useState<FieldErrors<typeof v>>({});
  const set = (k: keyof typeof v, t: string) => setV((o) => ({ ...o, [k]: t }));

  async function submit() {
    const { data, errors: e } = validate(customSchema, v);
    setErrors(e as FieldErrors<typeof v>);
    if (!data) return;
    try {
      onCreated(await create.mutateAsync({ ...data, portion_g: null }));
    } catch {
      // aviso abajo
    }
  }

  return (
    <Card testID="custom-food-form">
      <Text variant="bodyStrong">Alimento propio (valores por 100 g)</Text>
      <Text variant="caption" color="textMuted">
        Cópialos de la etiqueta nutricional. Solo tú lo verás.
      </Text>
      <TextField label="Nombre" value={v.name_es} onChangeText={(t) => set('name_es', t)} error={errors.name_es} testID="custom-name" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="kcal" value={v.kcal_100g} onChangeText={(t) => set('kcal_100g', t)} keyboardType="decimal-pad" error={errors.kcal_100g} testID="custom-kcal" />
        </View>
        <View style={styles.flex}>
          <TextField label="Proteína g" value={v.protein_g} onChangeText={(t) => set('protein_g', t)} keyboardType="decimal-pad" error={errors.protein_g} testID="custom-protein" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Carbohidratos g" value={v.carbs_g} onChangeText={(t) => set('carbs_g', t)} keyboardType="decimal-pad" error={errors.carbs_g} testID="custom-carbs" />
        </View>
        <View style={styles.flex}>
          <TextField label="Grasas g" value={v.fat_g} onChangeText={(t) => set('fat_g', t)} keyboardType="decimal-pad" error={errors.fat_g} testID="custom-fat" />
        </View>
      </View>
      {create.isError ? <Notice tone="error" message="No se pudo crear. Revisa tu conexión." /> : null}
      <View style={styles.row}>
        <Button label="Cancelar" variant="ghost" onPress={onCancel} grow />
        <Button label="Crear y agregar" onPress={submit} loading={create.isPending} grow testID="custom-save" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: minTouchSize, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfacePressed },
  flex: { flex: 1, gap: spacing.xxs },
  row: { flexDirection: 'row', gap: spacing.md },
});
