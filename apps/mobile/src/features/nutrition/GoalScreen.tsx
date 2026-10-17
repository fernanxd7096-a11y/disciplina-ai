import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, DateTimeField, LoadingState, Notice, Screen, SectionHeader, SegmentedControl, Text, TextField } from '@/components/ui';
import { useToday } from '@/features/habits/api';
import { useProfile, useUpdateProfile, type ActivityLevel, type Sex } from '@/features/profile/api';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { spacing } from '@/theme';
import { useLogWeight, useNutritionGoal, useSaveGoal, useWeights } from './api';
import { ACTIVITY_FACTORS, missingBodyData, planGoal } from './logic';
import type { Pace, WeightGoal } from './types';

const goalOptions: { value: WeightGoal; label: string }[] = [
  { value: 'lose', label: 'Bajar grasa' },
  { value: 'maintain', label: 'Mantener' },
  { value: 'gain', label: 'Ganar masa' },
];

export function GoalScreen() {
  const profile = useProfile();
  const weights = useWeights();
  const goal = useNutritionGoal();
  if (profile.isLoading || weights.isLoading || goal.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  return <GoalForm profile={profile.data ?? null} lastWeight={weights.data?.at(-1)?.weight_kg ?? null} current={goal.data ?? null} />;
}

function num(t: string): number | null {
  const n = Number(t.replace(',', '.'));
  return t.trim() && Number.isFinite(n) ? n : null;
}

function GoalForm({ profile, lastWeight, current }: { profile: ReturnType<typeof useProfile>['data'] | null; lastWeight: number | null; current: ReturnType<typeof useNutritionGoal>['data'] | null }) {
  const online = useIsOnline();
  const today = useToday();
  const updateProfile = useUpdateProfile();
  const logWeight = useLogWeight();
  const saveGoal = useSaveGoal();
  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [birth, setBirth] = useState<string | null>(profile?.birth_date ?? null);
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [weight, setWeight] = useState(lastWeight ? String(lastWeight) : '');
  const [activity, setActivity] = useState<ActivityLevel | null>(profile?.activity_level ?? null);
  const [target, setTarget] = useState<WeightGoal>('maintain');
  const [pace, setPace] = useState<Pace>('gentle');
  const [failed, setFailed] = useState(false);

  const h = num(height);
  const w = num(weight);
  const rangeError = (h != null && (h < 100 || h > 250)) || (w != null && (w < 25 || w > 350));
  const body = { sex, birth_date: birth, height_cm: h, weight_kg: w, activity_level: activity };
  const missing = missingBodyData(body);
  const result = missing.length || rangeError ? null : planGoal(body as Parameters<typeof planGoal>[0], target, pace, today);
  const plan = result && !('reason' in result) ? result : null;

  async function save() {
    if (!plan || !sex) return;
    setFailed(false);
    if (!online) return setFailed(true);
    try {
      await updateProfile.mutateAsync({ sex, birth_date: birth, height_cm: h, activity_level: activity });
      if (w != null && w !== lastWeight) await logWeight.mutateAsync({ measured_on: today, weight_kg: w });
      await saveGoal.mutateAsync({ sex, tdee_kcal: plan.tdee, kcal_target: plan.kcal_target, protein_g: plan.protein_g, carbs_g: plan.carbs_g, fat_g: plan.fat_g, valid_from: today });
      if (router.canGoBack()) router.back();
      else router.replace('/nutrition');
    } catch {
      setFailed(true);
    }
  }

  const birthLabel = birth ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${birth}T12:00:00Z`)) : null;

  return (
    <Screen testID="goal-screen" edges={[]}>
      <Stack.Screen options={{ title: 'Objetivo nutricional' }} />
      {current ? (
        <Card>
          <Text variant="caption" color="textSecondary">
            Objetivo actual (desde {current.valid_from})
          </Text>
          <Text variant="bodyStrong">
            {current.kcal_target} kcal · P {current.protein_g} g · C {current.carbs_g} g · G {current.fat_g} g
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Tus datos" />
      <SegmentedControl
        accessibilityLabel="Sexo"
        value={sex ?? 'none'}
        onChange={(x) => setSex(x === 'none' ? null : (x as Sex))}
        options={[
          { value: 'none', label: 'Elegir' },
          { value: 'female', label: 'Mujer' },
          { value: 'male', label: 'Hombre' },
        ]}
      />
      <Text variant="caption" color="textMuted">
        La fórmula usa el sexo biológico porque cambia el metabolismo basal estimado.
      </Text>
      <DateTimeField label="Fecha de nacimiento" mode="date" value={null} display={birthLabel ? { date: birthLabel, time: '' } : null} onChange={(d) => setBirth(d)} testID="goal-birth" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Altura (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" testID="goal-height" error={h != null && (h < 100 || h > 250) ? 'Entre 100 y 250.' : undefined} />
        </View>
        <View style={styles.flex}>
          <TextField label="Peso actual (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" testID="goal-weight" error={w != null && (w < 25 || w > 350) ? 'Entre 25 y 350.' : undefined} />
        </View>
      </View>

      <SectionHeader title="Actividad diaria" />
      <View style={styles.list}>
        {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((a) => (
          <Chip key={a} label={`${ACTIVITY_FACTORS[a].label} — ${ACTIVITY_FACTORS[a].hint}`} selected={activity === a} onPress={() => setActivity(a)} testID={`activity-${a}`} />
        ))}
      </View>

      <SectionHeader title="¿Qué buscas?" />
      <SegmentedControl accessibilityLabel="Objetivo" value={target} onChange={setTarget} options={goalOptions} />
      {target !== 'maintain' ? (
        <SegmentedControl
          accessibilityLabel="Ritmo"
          value={pace}
          onChange={setPace}
          options={[
            { value: 'gentle', label: target === 'lose' ? 'Suave (−10 %)' : 'Suave (+5 %)' },
            { value: 'moderate', label: target === 'lose' ? 'Moderado (−20 %)' : 'Moderado (+10 %)' },
          ]}
        />
      ) : null}

      {missing.length ? (
        <Notice tone="info" message={`Para calcular necesito: ${missing.join(', ')}.`} testID="goal-missing" />
      ) : result && 'reason' in result ? (
        <Notice tone="info" message={result.reason} testID="goal-unsafe" />
      ) : plan ? (
        <Card testID="goal-result">
          <Text variant="caption" color="textSecondary">
            Metabolismo basal ≈ {plan.bmr} kcal · Gasto diario estimado ≈ {plan.tdee} kcal
          </Text>
          <Text variant="metric">{plan.kcal_target} kcal/día</Text>
          <Text variant="body">
            Proteína {plan.protein_g} g · Carbohidratos {plan.carbs_g} g · Grasas {plan.fat_g} g
          </Text>
          {plan.notes.map((n, i) => (
            <Text key={i} variant="caption" color="textMuted">
              {n}
            </Text>
          ))}
          <Text variant="caption" color="textMuted">
            Límites aplicados: nunca menos de {sex === 'male' ? 1500 : 1200} kcal, déficit máximo 25 % y superávit máximo 20 %.
          </Text>
        </Card>
      ) : null}

      {failed && !online ? <Notice tone="info" message={OFFLINE_SAVE_MESSAGE} /> : null}
      {failed && online ? <Notice tone="error" message="No se pudo guardar. Inténtalo de nuevo." /> : null}
      <Button label="Guardar objetivo" icon="checkmark" onPress={save} disabled={!plan} loading={saveGoal.isPending || updateProfile.isPending} fullWidth testID="save-goal" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  list: { gap: spacing.sm },
});
