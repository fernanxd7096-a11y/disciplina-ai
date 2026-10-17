import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { useToday } from '@/features/habits/api';
import { useMeals, useNutritionGoal } from '@/features/nutrition/api';
import { hasEstimates, sumMacros } from '@/features/nutrition/logic';
import { useUserTimeZone } from '@/features/profile/api';
import { useProgressOverview } from '@/features/progress/useOverview';
import { useActivePlan, useFitnessProfile, useSessions } from '@/features/training/api';
import { nextDayIndex, sessionsThisWeek } from '@/features/training/logic';
import { localDayKey } from '@/lib/dates';
import { colors, spacing } from '@/theme';

function Icon({ name, color }: { name: React.ComponentProps<typeof Ionicons>['name']; color: string }) {
  return (
    <View style={[styles.icon, { borderColor: color }]}>
      <Ionicons name={name} size={18} color={color} />
    </View>
  );
}

export function TrainingSummary() {
  const tz = useUserTimeZone();
  const today = useToday();
  const profile = useFitnessProfile();
  const plan = useActivePlan();
  const sessions = useSessions();
  const all = sessions.data ?? [];
  const toDay = (iso: string) => localDayKey(new Date(iso), tz);
  const doneToday = all.find((s) => s.finished_at && toDay(s.started_at) === today);
  const inProgress = all.find((s) => !s.finished_at);
  const week = sessionsThisWeek(all, today, toDay);

  let title = 'Configura tu entrenamiento';
  let detail = 'Completa tu perfil y genera una rutina.';
  if (profile.isLoading || plan.isLoading) {
    title = 'Entrenamiento';
    detail = 'Cargando…';
  } else if (inProgress) {
    title = `En curso: ${inProgress.title}`;
    detail = 'Toca para seguir registrando series.';
  } else if (doneToday) {
    title = `Hecho hoy: ${doneToday.title}`;
    detail = `${week} de ${profile.data?.days_per_week ?? '?'} esta semana. Buen trabajo.`;
  } else if (plan.data && profile.data) {
    const next = nextDayIndex(plan.data.plan.day_labels.length, plan.data.plan.id, all);
    const met = week >= profile.data.days_per_week;
    title = met ? 'Semana cumplida · toca descanso' : `Te toca: ${plan.data.plan.day_labels[next]}`;
    detail = `${week} de ${profile.data.days_per_week} entrenamientos esta semana · ${plan.data.items.filter((i) => i.day_index === next).length} ejercicios`;
  } else if (profile.data) {
    title = 'Sin rutina activa';
    detail = 'Genera una rutina base o con IA.';
  }

  return (
    <Card onPress={() => router.push(inProgress ? `/training/session/${inProgress.id}` : '/training')} accessibilityLabel={`Entrenamiento: ${title}`} testID="dash-training">
      <View style={styles.row}>
        <Icon name="barbell-outline" color={colors.training} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export function NutritionSummary() {
  const tz = useUserTimeZone();
  const today = useToday();
  const meals = useMeals();
  const goal = useNutritionGoal();
  const items = (meals.data ?? []).filter((m) => localDayKey(new Date(m.eaten_at), tz) === today).flatMap((m) => m.items);
  const t = sumMacros(items);
  const g = goal.data;
  return (
    <Card onPress={() => router.push('/nutrition')} accessibilityLabel={`Nutrición: ${Math.round(t.kcal)} kilocalorías hoy`} testID="dash-nutrition">
      <View style={styles.row}>
        <Icon name="nutrition-outline" color={colors.nutrition} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">
            {meals.isLoading ? 'Nutrición' : `${Math.round(t.kcal)}${g ? ` de ${g.kcal_target}` : ''} kcal hoy`}
          </Text>
          <Text variant="caption" color="textSecondary">
            {items.length ? `Proteína ${Math.round(t.protein_g)}${g ? `/${g.protein_g}` : ''} g · Carbs ${Math.round(t.carbs_g)} g · Grasas ${Math.round(t.fat_g)} g` : 'Sin comidas registradas hoy.'}
          </Text>
        </View>
        {hasEstimates(items) ? <Badge label="Aprox." tone="warning" /> : null}
      </View>
    </Card>
  );
}

export function ProgressSummary() {
  const o = useProgressOverview();
  if (o.isLoading) return null;
  return (
    <Card onPress={() => router.push('/stats')} accessibilityLabel={`Disciplina ${o.discipline.score ?? 'sin datos'}, nivel ${o.level.level}`} testID="dash-progress">
      <View style={styles.row}>
        <Icon name="trophy-outline" color={colors.warning} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">
            Disciplina {o.discipline.score == null ? '—' : `${o.discipline.score}%`} · Nivel {o.level.level}
          </Text>
          <Text variant="caption" color="textSecondary">
            {o.xp.total} XP · {o.achievements.filter((a) => a.done).length} logros · últimos 7 días
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
  icon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
