import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button, Chip, DateTimeField, LoadingState, Notice, Screen, SectionHeader, SegmentedControl, Stepper, Text, TextField } from '@/components/ui';
import { useToday } from '@/features/habits/api';
import { useLogWeight, useWeights } from '@/features/nutrition/api';
import { useProfile, useUpdateProfile, type Sex } from '@/features/profile/api';
import { OFFLINE_SAVE_MESSAGE, useIsOnline } from '@/lib/network';
import { validate, type FieldErrors } from '@/lib/validation';
import { spacing } from '@/theme';
import { useFitnessProfile, useSaveFitnessProfile } from './api';
import { equipmentLabels, equipmentOptions, experienceLabels, goalLabels } from './constants';
import type { Equipment, Experience, FitnessProfile, Goal } from './types';

const MINUTES = [20, 30, 45, 60, 75, 90, 120];

const decimal = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), `${label} entre ${min} y ${max}.`);

const schema = z.object({
  goal: z.enum(['lose_fat', 'gain_muscle', 'strength', 'endurance', 'general']),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  days_per_week: z.number().int().min(1).max(6),
  minutes_per_session: z.number().int().min(15).max(180),
  equipment: z.array(z.string()),
  limitations: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  height_cm: decimal('Altura', 100, 250),
  weight_kg: decimal('Peso', 25, 350),
  birth_date: z.string().nullable(),
  sex: z.enum(['male', 'female']).nullable(),
});

type Values = {
  goal: Goal;
  experience: Experience;
  days_per_week: number;
  minutes_per_session: number;
  equipment: Equipment[];
  limitations: string;
  height_cm: string;
  weight_kg: string;
  birth_date: string | null;
  sex: Sex | null;
};

export function FitnessProfileScreen() {
  const profile = useFitnessProfile();
  const body = useProfile();
  const weights = useWeights();
  if (profile.isLoading || body.isLoading || weights.isLoading) {
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  }
  const lastWeight = weights.data?.at(-1)?.weight_kg ?? null;
  return <Form existing={profile.data ?? null} body={body.data ?? null} lastWeight={lastWeight} />;
}

function Form({ existing, body, lastWeight }: { existing: FitnessProfile | null; body: ReturnType<typeof useProfile>['data'] | null; lastWeight: number | null }) {
  const online = useIsOnline();
  const today = useToday();
  const save = useSaveFitnessProfile();
  const updateProfile = useUpdateProfile();
  const logWeight = useLogWeight();
  const [errors, setErrors] = useState<FieldErrors<Values>>({});
  const [failed, setFailed] = useState(false);
  const [v, setV] = useState<Values>({
    goal: existing?.goal ?? 'general',
    experience: existing?.experience ?? 'beginner',
    days_per_week: existing?.days_per_week ?? 3,
    minutes_per_session: existing?.minutes_per_session ?? 45,
    equipment: existing?.equipment.filter((e) => e !== 'bodyweight') ?? [],
    limitations: existing?.limitations ?? '',
    height_cm: body?.height_cm ? String(body.height_cm) : '',
    weight_kg: lastWeight ? String(lastWeight) : '',
    birth_date: body?.birth_date ?? null,
    sex: body?.sex ?? null,
  });
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((o) => ({ ...o, [k]: val }));
  const busy = save.isPending || updateProfile.isPending || logWeight.isPending;

  async function submit() {
    setFailed(false);
    if (!online) return setFailed(true);
    const { data, errors: e } = validate(schema, v);
    setErrors(e as FieldErrors<Values>);
    if (!data) return;
    try {
      await save.mutateAsync({
        goal: data.goal,
        experience: data.experience,
        days_per_week: data.days_per_week,
        minutes_per_session: data.minutes_per_session,
        equipment: data.equipment as Equipment[],
        limitations: data.limitations || null,
      });
      await updateProfile.mutateAsync({ height_cm: data.height_cm, birth_date: data.birth_date, sex: data.sex });
      if (data.weight_kg != null && data.weight_kg !== lastWeight) await logWeight.mutateAsync({ measured_on: today, weight_kg: data.weight_kg });
      if (router.canGoBack()) router.back();
      else router.replace('/training');
    } catch {
      setFailed(true);
    }
  }

  const birthLabel = v.birth_date ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${v.birth_date}T12:00:00Z`)) : null;

  return (
    <Screen testID="fitness-profile-screen" edges={[]}>
      <Stack.Screen options={{ title: 'Perfil de entrenamiento' }} />

      <SectionHeader title="Objetivo" />
      <View style={styles.wrap}>
        {(Object.keys(goalLabels) as Goal[]).map((g) => (
          <Chip key={g} label={goalLabels[g]} selected={v.goal === g} onPress={() => set('goal', g)} testID={`goal-${g}`} />
        ))}
      </View>

      <SectionHeader title="Experiencia" />
      <SegmentedControl
        accessibilityLabel="Experiencia"
        value={v.experience}
        onChange={(x) => set('experience', x)}
        options={(Object.keys(experienceLabels) as Experience[]).map((x) => ({ value: x, label: experienceLabels[x] }))}
      />

      <Stepper label="Días por semana" value={v.days_per_week} min={1} max={6} onChange={(n) => set('days_per_week', n)} suffix={v.days_per_week === 1 ? 'día' : 'días'} />
      <Text variant="caption" color="textMuted">
        Máximo 6: al menos un día de descanso por semana.
      </Text>

      <SectionHeader title="Minutos por sesión" />
      <View style={styles.wrap}>
        {MINUTES.map((m) => (
          <Chip key={m} compact label={`${m}`} accessibilityLabel={`${m} minutos`} selected={v.minutes_per_session === m} onPress={() => set('minutes_per_session', m)} testID={`minutes-${m}`} />
        ))}
      </View>

      <SectionHeader title="Equipo disponible" />
      <Text variant="caption" color="textMuted">
        El peso corporal siempre se incluye.
      </Text>
      <View style={styles.wrap}>
        {equipmentOptions.map((e) => (
          <Chip
            key={e}
            label={equipmentLabels[e]}
            selected={v.equipment.includes(e)}
            onPress={() => set('equipment', v.equipment.includes(e) ? v.equipment.filter((x) => x !== e) : [...v.equipment, e])}
            testID={`equip-${e}`}
          />
        ))}
      </View>

      <TextField
        label="Lesiones o ejercicios que no puedes hacer (opcional)"
        value={v.limitations}
        onChangeText={(t) => set('limitations', t)}
        error={errors.limitations}
        placeholder="Ej.: dolor de rodilla al saltar"
        multiline
        maxLength={500}
        testID="limitations"
      />

      <SectionHeader title="Datos corporales (opcional)" />
      <Text variant="caption" color="textMuted">
        Sirven para personalizar la rutina y estimar tu gasto calórico. Puedes dejarlos vacíos.
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Altura (cm)" value={v.height_cm} onChangeText={(t) => set('height_cm', t)} keyboardType="decimal-pad" error={errors.height_cm} testID="height" />
        </View>
        <View style={styles.flex}>
          <TextField label="Peso (kg)" value={v.weight_kg} onChangeText={(t) => set('weight_kg', t)} keyboardType="decimal-pad" error={errors.weight_kg} testID="weight" />
        </View>
      </View>
      <SegmentedControl
        accessibilityLabel="Sexo"
        value={v.sex ?? 'none'}
        onChange={(x) => set('sex', x === 'none' ? null : (x as Sex))}
        options={[
          { value: 'none', label: 'Sin indicar' },
          { value: 'female', label: 'Mujer' },
          { value: 'male', label: 'Hombre' },
        ]}
      />
      <DateTimeField label="Fecha de nacimiento" mode="date" value={null} display={birthLabel ? { date: birthLabel, time: '' } : null} onChange={(day) => set('birth_date', day)} testID="birth-date" />

      {failed && !online ? <Notice tone="info" message={OFFLINE_SAVE_MESSAGE} /> : null}
      {failed && online ? <Notice tone="error" message="No se pudo guardar. Inténtalo de nuevo." /> : null}
      <Button label="Guardar perfil" icon="checkmark" onPress={submit} loading={busy} fullWidth testID="save-fitness-profile" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
