import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BarChart, LineChart } from '@/components/charts';
import { Badge, Card, LoadingState, ProgressRing, Screen, SectionHeader, SegmentedControl, Text } from '@/components/ui';
import { useHabitData, useToday } from '@/features/habits/api';
import { addDays, buildContext, streaks } from '@/features/habits/logic';
import { categoryMeta } from '@/features/habits/presets';
import { useMeals, useWeights } from '@/features/nutrition/api';
import { hasEstimates, sumMacros } from '@/features/nutrition/logic';
import { useUserTimeZone } from '@/features/profile/api';
import { useSessions, useSetLogs } from '@/features/training/api';
import { sessionVolume } from '@/features/training/logic';
import { localDayKey } from '@/lib/dates';
import { colors, spacing } from '@/theme';
import { useCompletedTasks } from './api';
import { change, habitAdherence, habitDailySeries, minutesByCategory, weeklyCounts, XP_RULES } from './logic';
import { useProgressOverview } from './useOverview';

type Period = '7' | '30' | '90';

function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <Text variant="caption" color={value >= 0 ? 'success' : 'warning'}>
      {value >= 0 ? '▲' : '▼'} {Math.abs(value)} % vs periodo anterior
    </Text>
  );
}

export function StatsScreen() {
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  const tz = useUserTimeZone();
  const today = useToday();
  const toDay = (iso: string) => localDayKey(new Date(iso), tz);
  const overview = useProgressOverview();
  const habits = useHabitData();
  const tasks = useCompletedTasks(days * 2);
  const sessions = useSessions();
  const sets = useSetLogs();
  const meals = useMeals();
  const weights = useWeights();

  if (overview.isLoading) {
    return (
      <Screen testID="stats-screen" edges={[]}>
        <LoadingState label="Calculando tus estadísticas…" />
      </Screen>
    );
  }

  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const weeks = Math.max(2, Math.ceil(days / 7));

  // Hábitos
  const adh = habitAdherence(habits.habits, habits.logs, habits.restDays, from, today);
  const adhPrev = habitAdherence(habits.habits, habits.logs, habits.restDays, prevFrom, prevTo);
  const series = habitDailySeries(habits.habits, habits.logs, habits.restDays, today, Math.min(days, 30));
  const topStreaks = habits.habits
    .filter((h) => h.status === 'active')
    .map((h) => ({ h, s: streaks(h, buildContext(h, habits.logs, habits.restDays), today) }))
    .sort((a, b) => b.s.current - a.s.current)
    .slice(0, 5);
  const minutes = minutesByCategory(habits.habits, habits.logs, from, today);

  // Tareas
  const doneDays = (tasks.data ?? []).map((t) => toDay(t.completed_at));
  const tasksNow = doneDays.filter((d) => inRange(d, from, today)).length;
  const tasksPrev = doneDays.filter((d) => inRange(d, prevFrom, prevTo)).length;
  const taskWeeks = weeklyCounts(doneDays, today, weeks);

  // Entrenamiento
  const finished = (sessions.data ?? []).filter((s) => s.finished_at);
  const trainDays = finished.map((s) => toDay(s.started_at));
  const trainNow = finished.filter((s) => inRange(toDay(s.started_at), from, today));
  const trainPrev = trainDays.filter((d) => inRange(d, prevFrom, prevTo)).length;
  const trainMinutes = Math.round(trainNow.reduce((a, s) => a + (new Date(s.finished_at!).getTime() - new Date(s.started_at).getTime()) / 60000, 0));
  const volume = sessionVolume((sets.data ?? []).filter((x) => trainNow.some((s) => s.id === x.session_id)));

  // Nutrición
  const mealDays = new Map<string, { kcal: number; est: boolean }>();
  for (const m of meals.data ?? []) {
    const d = toDay(m.eaten_at);
    if (!inRange(d, from, today)) continue;
    const prev = mealDays.get(d) ?? { kcal: 0, est: false };
    mealDays.set(d, { kcal: prev.kcal + sumMacros(m.items).kcal, est: prev.est || hasEstimates(m.items) });
  }
  const avgKcal = mealDays.size ? Math.round([...mealDays.values()].reduce((a, v) => a + v.kcal, 0) / mealDays.size) : null;
  const kcalBars = Array.from({ length: Math.min(days, 30) }, (_, i) => addDays(today, i - Math.min(days, 30) + 1)).map((d) => ({ label: d.slice(8), value: Math.round(mealDays.get(d)?.kcal ?? 0), estimated: mealDays.get(d)?.est }));

  const w = (weights.data ?? []).filter((x) => x.measured_on >= from);
  const d = overview.discipline;

  return (
    <Screen testID="stats-screen" edges={[]}>
      <SegmentedControl
        accessibilityLabel="Periodo"
        value={period}
        onChange={setPeriod}
        options={[
          { value: '7', label: '7 días' },
          { value: '30', label: '30 días' },
          { value: '90', label: '90 días' },
        ]}
      />

      <Card testID="discipline-card">
        <View style={styles.row}>
          <ProgressRing value={d.score ?? 0} total={100} size={88} accessibilityLabel={`Disciplina ${d.score ?? 'sin datos'}`}>
            <Text variant="metric">{d.score == null ? '—' : `${d.score}%`}</Text>
          </ProgressRing>
          <View style={styles.flex}>
            <Text variant="heading">Disciplina (últimos 7 días)</Text>
            <Text variant="caption" color="textSecondary">
              Promedio de los componentes activos. Es una regla fija, no una evaluación de tu personalidad.
            </Text>
          </View>
        </View>
        {d.parts.map((p) => (
          <View key={p.key} style={styles.between}>
            <Text variant="caption" color={p.enabled ? 'text' : 'textMuted'}>
              {p.label}
              {p.enabled ? '' : ' (no cuenta)'}: {p.value == null ? 'sin datos' : `${Math.round(p.value * 100)} %`}
            </Text>
            <Text variant="caption" color="textMuted" style={styles.flexRight}>
              {p.detail}
            </Text>
          </View>
        ))}
        <Text variant="caption" color="accent" onPress={() => router.push('/settings')} accessibilityRole="link">
          Elegir qué cuenta → Ajustes
        </Text>
      </Card>

      <Card testID="level-card">
        <View style={styles.between}>
          <Text variant="heading">Nivel {overview.level.level}</Text>
          <Text variant="bodyStrong" color="accent">
            {overview.xp.total} XP
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(overview.level.progress * 100)}%` }]} />
        </View>
        <Text variant="caption" color="textSecondary">
          {overview.level.to - overview.xp.total} XP para el nivel {overview.level.level + 1}. Los días de descanso nunca restan.
        </Text>
        {XP_RULES.map((r) => (
          <Text key={r.key} variant="caption" color="textMuted">
            +{r.points} · {r.label} ({overview.counts[r.key]})
          </Text>
        ))}
      </Card>

      <SectionHeader title={`Logros (${overview.achievements.filter((a) => a.done).length}/${overview.achievements.length})`} />
      <View style={styles.grid}>
        {overview.achievements.map((a) => (
          <Card key={a.code} style={[styles.badge, !a.done && styles.locked]} testID={`ach-${a.code}`}>
            <Ionicons name={a.icon} size={22} color={a.done ? colors.warning : colors.textMuted} />
            <Text variant="caption" color={a.done ? 'text' : 'textMuted'} align="center" style={styles.bold}>
              {a.title}
            </Text>
            <Text variant="caption" color="textMuted" align="center">
              {a.done ? (a.unlocked_at ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: tz }).format(new Date(a.unlocked_at)) : '¡Logrado!') : `${a.value}/${a.target}`}
            </Text>
          </Card>
        ))}
      </View>

      <SectionHeader title="Hábitos" />
      <Card testID="stats-habits">
        <View style={styles.between}>
          <Text variant="metric">{adh.rate == null ? '—' : `${Math.round(adh.rate * 100)} %`}</Text>
          <Badge label="Calculado" />
        </View>
        <Text variant="caption" color="textSecondary">
          Cumplimiento: {adh.done} de {adh.total} días programados (descansos excluidos)
        </Text>
        <Delta value={adh.rate != null && adhPrev.rate != null ? change(adh.rate, adhPrev.rate) : null} />
        <BarChart bars={series.map((s) => ({ label: s.day.slice(8), value: s.rate == null ? 0 : Math.round(s.rate * 100) }))} max={100} color={colors.habits} accessibilityLabel="Cumplimiento diario de hábitos" />
        {topStreaks.map(({ h, s }) => (
          <View key={h.id} style={styles.between}>
            <Text variant="caption">{h.name}</Text>
            <Text variant="caption" color="textSecondary">
              🔥 {s.current} {s.unit} · mejor {s.best}
            </Text>
          </View>
        ))}
      </Card>

      {minutes.size ? (
        <Card testID="stats-time">
          <Text variant="bodyStrong">Tiempo dedicado</Text>
          {[...minutes].map(([cat, min]) => (
            <View key={cat} style={styles.between}>
              <Text variant="caption">{categoryMeta[cat as keyof typeof categoryMeta]?.label ?? cat}</Text>
              <Text variant="caption" color="textSecondary">
                {min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`}
              </Text>
            </View>
          ))}
          <Text variant="caption" color="textMuted">
            Registrado por ti en hábitos medidos en minutos u horas.
          </Text>
        </Card>
      ) : null}

      <SectionHeader title="Tareas" />
      <Card testID="stats-tasks">
        <View style={styles.between}>
          <Text variant="metric">{tasksNow}</Text>
          <Badge label="Registrado" />
        </View>
        <Text variant="caption" color="textSecondary">
          tareas completadas en el periodo
        </Text>
        <Delta value={change(tasksNow, tasksPrev)} />
        <BarChart bars={taskWeeks.map((x) => ({ label: x.week.slice(5).replace('-', '/'), value: x.count }))} color={colors.tasks} accessibilityLabel="Tareas completadas por semana" />
      </Card>

      <SectionHeader title="Entrenamiento" />
      <Card testID="stats-training">
        <View style={styles.between}>
          <Text variant="metric">{trainNow.length}</Text>
          <Badge label="Registrado" />
        </View>
        <Text variant="caption" color="textSecondary">
          sesiones · {trainMinutes} min · volumen {volume} kg·reps
        </Text>
        <Delta value={change(trainNow.length, trainPrev)} />
        <BarChart bars={weeklyCounts(trainDays, today, weeks).map((x) => ({ label: x.week.slice(5).replace('-', '/'), value: x.count }))} color={colors.training} accessibilityLabel="Entrenamientos por semana" />
      </Card>

      <SectionHeader title="Nutrición" />
      <Card testID="stats-nutrition">
        <View style={styles.between}>
          <Text variant="metric">{avgKcal == null ? '—' : `${avgKcal} kcal`}</Text>
          <Badge label="Aproximado" />
        </View>
        <Text variant="caption" color="textSecondary">
          promedio en {mealDays.size} días con registro
        </Text>
        <BarChart bars={kcalBars} color={colors.nutrition} accessibilityLabel="Calorías por día" />
        <Text variant="caption" color="textMuted">
          Barras punteadas: días con estimaciones de IA sin corregir.
        </Text>
      </Card>

      <SectionHeader title="Peso" />
      <Card testID="stats-weight">
        <LineChart points={w.map((x) => ({ label: x.measured_on.slice(5).replace('-', '/'), value: x.weight_kg }))} color={colors.nutrition} unit="kg" accessibilityLabel="Evolución del peso en el periodo" />
        <Text variant="caption" color="textMuted">
          Medido por ti.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
  flexRight: { flex: 1, textAlign: 'right' },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { width: '31%', alignItems: 'center', padding: spacing.sm, gap: spacing.xxs },
  locked: { opacity: 0.55 },
  bold: { fontWeight: '600' },
});
