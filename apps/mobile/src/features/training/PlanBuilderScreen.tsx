import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Chip, EmptyState, IconButton, LoadingState, Notice, Screen, SectionHeader, Text, TextField } from '@/components/ui';
import { aiErrorMessage, providerLabel } from '@/lib/ai';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { spacing } from '@/theme';
import { useAIPlan, useExercises, useFitnessProfile, useSavePlan } from './api';
import { muscleLabels, repsUnit, SAFETY_NOTE } from './constants';
import { allowedEquipment, alternativesFor, estimateMinutes, generatePlan } from './logic';
import type { Exercise, PlanDraft } from './types';

export function PlanBuilderScreen({ mode }: { mode: 'basic' | 'ai' }) {
  const profile = useFitnessProfile();
  const exercises = useExercises();
  if (profile.isLoading || exercises.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  if (!profile.data) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="person-outline" title="Primero tu perfil" description="Necesito tu objetivo, días y equipo." actionLabel="Completar perfil" onAction={() => router.replace('/training/profile')} />
      </Screen>
    );
  }
  return <Builder mode={mode} profile={profile.data} catalog={exercises.data ?? []} />;
}

function Builder({ mode, profile, catalog }: { mode: 'basic' | 'ai'; profile: NonNullable<ReturnType<typeof useFitnessProfile>['data']>; catalog: Exercise[] }) {
  const online = useIsOnline();
  const ai = useAIPlan();
  const savePlan = useSavePlan();
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<PlanDraft | null>(() => (mode === 'basic' ? generatePlan(profile, catalog) : null));
  const [provider, setProvider] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);
  const equip = useMemo(() => allowedEquipment(profile), [profile]);

  async function askAI() {
    try {
      const r = await ai.mutateAsync(note.trim() || undefined);
      setDraft(r.draft);
      setProvider(r.provider);
    } catch {
      // se muestra con ai.error
    }
  }

  function replaceExercise(index: number, exerciseId: string) {
    setDraft((d) => d && { ...d, items: d.items.map((it, i) => (i === index ? { ...it, exercise_id: exerciseId, suggested_kg: null } : it)) });
    setEditing(null);
  }

  function removeExercise(index: number) {
    setDraft((d) => d && { ...d, items: d.items.filter((_, i) => i !== index).map((it, i, arr) => ({ ...it, sort_order: arr.slice(0, i).filter((x) => x.day_index === it.day_index).length })) });
  }

  async function save() {
    if (!draft) return;
    try {
      await savePlan.mutateAsync(draft);
      router.replace('/training');
    } catch {
      // aviso abajo
    }
  }

  return (
    <Screen testID="plan-builder-screen" edges={[]}>
      <Stack.Screen options={{ title: mode === 'ai' ? 'Rutina con IA' : 'Rutina base' }} />

      {mode === 'ai' && !draft ? (
        <Card>
          <Text variant="body">La IA arma la rutina con tu perfil, tu historial y solo con ejercicios del catálogo que tu equipo permite. La revisas antes de guardarla.</Text>
          <TextField label="¿Algo que deba considerar? (opcional)" value={note} onChangeText={setNote} placeholder="Ej.: quiero enfocarme en espalda" maxLength={300} testID="ai-plan-note" />
          {!online ? <Notice tone="info" message="Necesitas conexión para usar la IA." /> : null}
          {ai.error ? <Notice tone="error" message={aiErrorMessage(ai.error)} testID="ai-plan-error" /> : null}
          <Button label="Generar con IA" icon="sparkles" onPress={askAI} loading={ai.isPending} disabled={!online} fullWidth testID="ai-plan-generate" />
          {ai.error ? <Button label="Usar la rutina base (sin IA)" variant="secondary" onPress={() => setDraft(generatePlan(profile, catalog))} fullWidth testID="ai-plan-fallback" /> : null}
        </Card>
      ) : null}

      {draft ? (
        <>
          <Card>
            <View style={styles.between}>
              <Text variant="heading">{draft.name}</Text>
              <Badge label={draft.source === 'ai' ? providerLabel(provider ?? undefined) ?? 'IA' : 'Reglas fijas'} tone={draft.source === 'ai' ? 'accent' : 'neutral'} />
            </View>
            {draft.notes ? (
              <Text variant="caption" color="textSecondary">
                {draft.notes}
              </Text>
            ) : null}
          </Card>
          {draft.safety_notes.map((s, i) => (
            <Notice key={i} tone="info" message={`⚠ ${s}`} />
          ))}

          {draft.day_labels.map((label, d) => {
            const indexed = draft.items.map((it, i) => ({ it, i })).filter((x) => x.it.day_index === d);
            return (
              <View key={d} style={styles.day}>
                <SectionHeader title={`Día ${d + 1} · ${label} · ~${Math.round(estimateMinutes(indexed.map((x) => x.it)))} min`} />
                {indexed.map(({ it, i }) => {
                  const ex = byId.get(it.exercise_id);
                  if (!ex) return null;
                  const alt = alternativesFor(ex, catalog, equip);
                  const options = [...alt.similar, ...alt.easier, ...alt.harder];
                  const key = `${d}-${i}`;
                  return (
                    <Card key={key} testID={`draft-ex-${ex.code ?? ex.id}`}>
                      <View style={styles.between}>
                        <View style={styles.flex}>
                          <Text variant="bodyStrong">{ex.name_es}</Text>
                          <Text variant="caption" color="textSecondary">
                            {muscleLabels[ex.muscle_group]} · {it.sets}×{it.reps_min}–{it.reps_max} {repsUnit(ex)} · descanso {it.rest_seconds}s
                            {it.suggested_kg ? ` · ${it.suggested_kg} kg` : ''}
                          </Text>
                        </View>
                        {options.length ? <IconButton icon="swap-horizontal" accessibilityLabel={`Cambiar ${ex.name_es}`} onPress={() => setEditing(editing === key ? null : key)} testID={`swap-${ex.code ?? ex.id}`} /> : null}
                        {indexed.length > 2 ? <IconButton icon="trash-outline" accessibilityLabel={`Quitar ${ex.name_es}`} onPress={() => removeExercise(i)} /> : null}
                      </View>
                      {editing === key ? (
                        <View style={styles.wrap}>
                          {options.map((o) => (
                            <Chip key={o.id} label={`${o.name_es}${alt.easier.includes(o) ? ' (más fácil)' : alt.harder.includes(o) ? ' (más difícil)' : ''}`} selected={false} onPress={() => replaceExercise(i, o.id)} testID={`alt-${o.code ?? o.id}`} />
                          ))}
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            );
          })}

          <Notice tone="info" message={SAFETY_NOTE} />
          {!online ? <Notice tone="info" message={OFFLINE_SAVE_MESSAGE} /> : null}
          {savePlan.isError ? <Notice tone="error" message="No se pudo guardar la rutina. Inténtalo de nuevo." /> : null}
          <Button label="Guardar como mi rutina" icon="checkmark" onPress={save} loading={savePlan.isPending} disabled={!online} fullWidth testID="save-plan" />
          {mode === 'ai' ? <Button label="Pedir otra propuesta" variant="ghost" onPress={() => setDraft(null)} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  day: { gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
});
