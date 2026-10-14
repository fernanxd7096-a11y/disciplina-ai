import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  DateTimeField,
  Notice,
  Screen,
  SectionHeader,
  SegmentedControl,
  Stepper,
  Text,
  TextField,
} from '@/components/ui';
import { validate, type FieldErrors } from '@/lib/validation';
import { spacing } from '@/theme';
import { useCreateHabit, useUpdateHabit } from './api';
import { categories, categoryMeta, habitPresets, scheduleLabel, weekDays } from './presets';
import type { Habit, HabitCategory, HabitFrequency } from './types';
import { habitSchema, toHabitInput } from './validation';

type FormValues = {
  name: string;
  category: HabitCategory;
  frequency: HabitFrequency;
  days_of_week: number[];
  target_per_period: number;
  unit: string;
  /** "HH:MM" o null si no quiere recordatorio. */
  reminder_time: string | null;
};

const blank: FormValues = {
  name: '',
  category: 'other',
  frequency: 'daily',
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  target_per_period: 1,
  unit: '',
  reminder_time: null,
};

function fromHabit(h: Habit): FormValues {
  return {
    name: h.name,
    category: h.category ?? 'other',
    frequency: h.frequency,
    days_of_week: h.days_of_week,
    target_per_period: h.target_per_period,
    unit: h.unit ?? '',
    reminder_time: h.reminder_time ? h.reminder_time.slice(0, 5) : null,
  };
}

export function HabitFormScreen({ habit }: { habit?: Habit }) {
  const editing = Boolean(habit);
  const [values, setValues] = useState<FormValues>(habit ? fromHabit(habit) : blank);
  const [errors, setErrors] = useState<FieldErrors<FormValues>>({});
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const saving = create.isPending || update.isPending;
  const failed = create.isError || update.isError;

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) => setValues((old) => ({ ...old, [k]: v }));

  function toggleDay(d: number) {
    set('days_of_week', values.days_of_week.includes(d) ? values.days_of_week.filter((x) => x !== d) : [...values.days_of_week, d]);
  }

  async function save() {
    const { data, errors: e } = validate(habitSchema, values);
    setErrors(e);
    if (!data) return;
    const input = toHabitInput(data);
    try {
      if (habit) await update.mutateAsync({ id: habit.id, patch: input });
      else await create.mutateAsync(input);
      if (router.canGoBack()) router.back();
      else router.replace('/habits');
    } catch {
      // El aviso de error se muestra con failed.
    }
  }

  const counter = values.frequency === 'daily';

  return (
    <Screen testID="habit-form-screen" edges={[]}>
      <Stack.Screen options={{ title: editing ? 'Editar hábito' : 'Nuevo hábito' }} />

      {!editing ? (
        <>
          <SectionHeader title="Plantillas" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
            {habitPresets.map((p) => (
              <Chip
                key={p.key}
                label={p.name}
                icon={categoryMeta[p.category ?? 'other'].icon}
                selected={values.name === p.name}
                onPress={() =>
                  setValues({
                    name: p.name,
                    category: p.category ?? 'other',
                    frequency: p.frequency,
                    days_of_week: p.days_of_week,
                    target_per_period: p.target_per_period,
                    unit: p.unit ?? '',
                    reminder_time: values.reminder_time,
                  })
                }
                testID={`preset-${p.key}`}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      <TextField
        label="Nombre"
        value={values.name}
        onChangeText={(t) => set('name', t)}
        error={errors.name}
        placeholder="Ej.: Leer 20 minutos"
        maxLength={80}
        testID="habit-name"
      />

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          Categoría
        </Text>
        <View style={styles.wrap}>
          {categories.map((c) => (
            <Chip
              key={c}
              label={categoryMeta[c].label}
              icon={categoryMeta[c].icon}
              selected={values.category === c}
              onPress={() => set('category', c)}
            />
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          Frecuencia
        </Text>
        <SegmentedControl
          accessibilityLabel="Frecuencia"
          value={values.frequency}
          onChange={(f) =>
            setValues((old) => ({ ...old, frequency: f, target_per_period: f === 'weekly' ? Math.min(Math.max(old.target_per_period, 3), 7) : 1 }))
          }
          options={[
            { value: 'daily', label: 'Días concretos' },
            { value: 'weekly', label: 'Veces por semana' },
          ]}
        />
      </View>

      {values.frequency === 'daily' ? (
        <View style={styles.block}>
          <Text variant="label" color="textSecondary">
            Días
          </Text>
          <View style={styles.days}>
            {weekDays.map((d) => (
              <Chip
                key={d.value}
                compact
                label={d.short}
                accessibilityLabel={d.long}
                selected={values.days_of_week.includes(d.value)}
                onPress={() => toggleDay(d.value)}
                testID={`day-${d.value}`}
              />
            ))}
          </View>
          {errors.days_of_week ? (
            <Text variant="caption" color="danger">
              {errors.days_of_week}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Stepper
        label={counter ? 'Meta por día' : 'Veces por semana'}
        value={values.target_per_period}
        min={1}
        max={counter ? 100 : 7}
        onChange={(n) => set('target_per_period', n)}
        suffix={counter ? (values.target_per_period > 1 ? values.unit || 'veces' : 'vez (hecho / no hecho)') : 'días'}
      />
      {errors.target_per_period ? (
        <Text variant="caption" color="danger">
          {errors.target_per_period}
        </Text>
      ) : null}

      {counter && values.target_per_period > 1 ? (
        <TextField
          label="Unidad (opcional)"
          value={values.unit}
          onChangeText={(t) => set('unit', t)}
          error={errors.unit}
          placeholder="vasos, páginas, minutos…"
          maxLength={20}
        />
      ) : null}

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          Recordatorio
        </Text>
        <View style={styles.wrap}>
          <Chip
            label={values.reminder_time ? 'Recordarme' : 'Sin recordatorio'}
            icon={values.reminder_time ? 'notifications' : 'notifications-off-outline'}
            selected={Boolean(values.reminder_time)}
            onPress={() => set('reminder_time', values.reminder_time ? null : '20:00')}
            testID="habit-reminder-toggle"
          />
        </View>
        {values.reminder_time ? (
          <DateTimeField
            label="Hora del aviso"
            mode="time"
            value={null}
            display={{ date: '', time: values.reminder_time }}
            onChange={(_day, time) => set('reminder_time', time)}
            testID="habit-reminder"
          />
        ) : null}
        <Text variant="caption" color="textMuted">
          Solo avisa los días que toca y no si ya lo cumpliste hoy.
        </Text>
      </View>

      <Card>
        <Text variant="caption" color="textSecondary">
          Resumen
        </Text>
        <Text variant="bodyStrong">
          {values.name.trim() || 'Tu hábito'} · {scheduleLabel(values)}
          {counter && values.target_per_period > 1 ? ` · ${values.target_per_period} ${values.unit || 'veces'} al día` : ''}
        </Text>
      </Card>

      {failed ? <Notice tone="error" message="No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." /> : null}

      <Button
        label={editing ? 'Guardar cambios' : 'Crear hábito'}
        icon="checkmark"
        onPress={save}
        loading={saving}
        fullWidth
        testID="save-habit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  presets: { gap: spacing.sm, paddingRight: spacing.lg },
  block: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
});
