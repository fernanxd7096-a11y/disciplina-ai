import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, LoadingState, Notice, Screen, SectionHeader, Text } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { aiErrorMessage, providerLabel } from '@/lib/ai';
import { localHour } from '@/lib/dates';
import { useIsOnline } from '@/lib/network';
import { PhotoPermissionError, pickFoodPhoto } from '@/lib/photo';
import { radius, spacing } from '@/theme';
import { useAddMeal, useAnalyzePhoto, type Analysis, type AnalysisItem } from './api';
import { MealTypePicker } from './AddMealScreen';
import { GramsRow, MacroLine } from './components';
import { FoodSearch } from './FoodSearch';
import { defaultMealType, draftFromFood, per100Of, scaleMacros, sumMacros, withGrams } from './logic';
import type { DraftItem, Food, MealType } from './types';

type Editable = DraftItem & { ai: AnalysisItem | null };

const confidenceLabel = { low: 'Confianza baja', medium: 'Confianza media', high: 'Confianza alta' } as const;
const confidenceTone = { low: 'warning', medium: 'neutral', high: 'success' } as const;

let seq = 0;
function fromAnalysis(it: AnalysisItem): Editable {
  const per100 = it.food ? per100Of(it.food) : it.ai_per_100g;
  seq += 1;
  return {
    key: `a${seq}`,
    ai: it,
    food_id: it.food?.id ?? null,
    name: it.food?.name_es ?? it.name,
    grams: it.grams,
    per100,
    ...scaleMacros(per100, it.grams),
    is_ai_estimate: !it.food,
    user_edited: false,
  };
}

export function PhotoMealScreen() {
  const tz = useUserTimeZone();
  const online = useIsOnline();
  const analyze = useAnalyzePhoto();
  const add = useAddMeal();
  const [uri, setUri] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [items, setItems] = useState<Editable[]>([]);
  const [type, setType] = useState<MealType>(defaultMealType(localHour(new Date(), tz)));
  const [adding, setAdding] = useState(false);

  async function take(source: 'camera' | 'library') {
    setPickError(null);
    setAnalysis(null);
    analyze.reset();
    try {
      const photo = await pickFoodPhoto(source);
      if (!photo) return;
      setUri(photo.uri);
      const r = await analyze.mutateAsync(photo.base64);
      setAnalysis(r);
      setItems(r.items.map(fromAnalysis));
    } catch (e) {
      if (e instanceof PhotoPermissionError) setPickError(e.message);
      // los errores del análisis se muestran con analyze.error
    }
  }

  function update(key: string, fn: (x: Editable) => Editable) {
    setItems((o) => o.map((x) => (x.key === key ? fn(x) : x)));
  }

  function chooseFood(key: string, food: Food) {
    update(key, (x) => ({ ...x, food_id: food.id, name: food.name_es, per100: per100Of(food), ...scaleMacros(per100Of(food), x.grams), is_ai_estimate: false, user_edited: true }));
  }

  function chooseAIEstimate(key: string) {
    update(key, (x) => (x.ai ? { ...x, food_id: null, name: x.ai.name, per100: x.ai.ai_per_100g, ...scaleMacros(x.ai.ai_per_100g, x.grams), is_ai_estimate: true, user_edited: true } : x));
  }

  async function save() {
    if (!analysis || !items.length) return;
    try {
      await add.mutateAsync({
        eaten_at: new Date().toISOString(),
        meal_type: type,
        origin: 'photo',
        analysis_id: analysis.analysis_id,
        photo_path: analysis.photo_kept ? analysis.photo_path : null,
        items,
      });
      router.replace('/nutrition');
    } catch {
      // aviso abajo
    }
  }

  const total = sumMacros(items);
  const range = items.reduce(
    (a, x) => {
      const lo = x.ai && !x.user_edited ? x.ai.grams_min : x.grams;
      const hi = x.ai && !x.user_edited ? x.ai.grams_max : x.grams;
      return { min: a.min + scaleMacros(x.per100, lo).kcal, max: a.max + scaleMacros(x.per100, hi).kcal };
    },
    { min: 0, max: 0 },
  );

  return (
    <Screen testID="photo-meal-screen" edges={[]}>
      <Stack.Screen options={{ title: 'Foto de comida' }} />

      {!analysis && !analyze.isPending ? (
        <Card>
          <Text variant="body">Toma una foto de tu plato desde arriba, con buena luz y, si puedes, con un cubierto al lado como referencia de tamaño.</Text>
          {!online ? <Notice tone="info" message="Necesitas conexión para analizar la foto. Puedes registrar a mano mientras tanto." /> : null}
          {pickError ? <Notice tone="error" message={pickError} testID="photo-permission" /> : null}
          {analyze.error ? <Notice tone="error" message={aiErrorMessage(analyze.error)} testID="photo-error" /> : null}
          <View style={styles.row}>
            <Button label="Cámara" icon="camera" onPress={() => take('camera')} disabled={!online} grow testID="photo-camera" />
            <Button label="Galería" icon="images-outline" variant="secondary" onPress={() => take('library')} disabled={!online} grow testID="photo-library" />
          </View>
          <Button label="Registrar a mano" variant="ghost" onPress={() => router.replace('/nutrition/add')} />
          <Text variant="caption" color="textMuted">
            La foto se sube a tu carpeta privada y se borra al terminar el análisis (puedes cambiarlo en Ajustes → Privacidad).
          </Text>
        </Card>
      ) : null}

      {uri ? <Image source={{ uri }} style={styles.photo} accessibilityLabel="Foto de tu comida" /> : null}
      {analyze.isPending ? <LoadingState label="Analizando la foto…" /> : null}

      {analysis ? (
        analysis.is_food ? (
          <>
            <Notice tone="info" message="Esto es una estimación: una foto no muestra el peso exacto, el aceite ni los ingredientes ocultos. Revisa y corrige antes de guardar." />
            {analysis.warnings.map((w, i) => (
              <Notice key={i} tone="info" message={`⚠ ${w}`} />
            ))}
            {providerLabel(analysis.provider) ? <Badge label={`Analizado con ${providerLabel(analysis.provider)}`} tone={analysis.provider === 'mock' ? 'warning' : 'accent'} /> : null}

            {items.map((x) => (
              <Card key={x.key} testID={`photo-item-${x.key}`}>
                <GramsRow name={x.name} grams={x.grams} macros={x} estimated={x.is_ai_estimate} onGrams={(g) => update(x.key, (o) => ({ ...withGrams(o, g), ai: o.ai }))} onRemove={() => setItems((o) => o.filter((y) => y.key !== x.key))} testID={`photo-${x.food_id ?? 'ai'}`} />
                {x.ai ? (
                  <>
                    <View style={styles.wrap}>
                      <Badge label={confidenceLabel[x.ai.confidence]} tone={confidenceTone[x.ai.confidence]} />
                      {!x.user_edited ? <Badge label={`${x.ai.grams_min}–${x.ai.grams_max} g`} /> : null}
                      {x.ai.preparation ? <Badge label={x.ai.preparation} /> : null}
                    </View>
                    <Text variant="caption" color="textMuted">
                      {x.is_ai_estimate ? 'Sin coincidencia en la base: macros estimados por la IA.' : 'Macros de la base nutricional (USDA).'} La IA lo identificó como «{x.ai.name}».
                    </Text>
                    {x.ai.candidates.length > 1 || (x.ai.candidates.length && x.is_ai_estimate) ? (
                      <View style={styles.wrap}>
                        {x.ai.candidates.map((c) => (
                          <Chip key={c.id} label={c.name_es} selected={x.food_id === c.id} onPress={() => chooseFood(x.key, c)} />
                        ))}
                        <Chip label="Usar estimación IA" selected={x.is_ai_estimate} onPress={() => chooseAIEstimate(x.key)} />
                      </View>
                    ) : null}
                  </>
                ) : null}
              </Card>
            ))}

            {adding ? (
              <Card>
                <FoodSearch
                  onPick={(f) => {
                    setItems((o) => [...o, { ...draftFromFood(f), ai: null }]);
                    setAdding(false);
                  }}
                />
              </Card>
            ) : (
              <Button label="¿Falta algo? Agregar alimento" variant="ghost" icon="add" onPress={() => setAdding(true)} testID="photo-add-missing" />
            )}

            <Card testID="photo-total">
              <Text variant="label" color="textSecondary">
                TOTAL ESTIMADO
              </Text>
              <Text variant="metric">~{Math.round(total.kcal)} kcal</Text>
              <Text variant="caption" color="textSecondary">
                Rango probable: {Math.round(range.min)}–{Math.round(range.max)} kcal
              </Text>
              <MacroLine m={total} />
            </Card>

            <SectionHeader title="¿Qué comida es?" />
            <MealTypePicker value={type} onChange={setType} />
            {add.isError ? <Notice tone="error" message="No se pudo guardar la comida. Inténtalo de nuevo." /> : null}
            <Button label="Guardar en mi diario" icon="checkmark" onPress={save} loading={add.isPending} disabled={!items.length} fullWidth testID="save-photo-meal" />
            <Button label="Otra foto" variant="ghost" onPress={() => take('camera')} />
          </>
        ) : (
          <Card testID="photo-not-food">
            <Text variant="body">No se reconoció comida en la foto. Prueba con otra o regístrala a mano.</Text>
            <View style={styles.row}>
              <Button label="Otra foto" icon="camera" onPress={() => take('camera')} grow />
              <Button label="A mano" variant="secondary" onPress={() => router.replace('/nutrition/add')} grow />
            </View>
          </Card>
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
});
