import type { SupabaseClient } from '../_shared/deps.ts';
import type { Privacy } from './handler.ts';

/** "AAAA-MM-DD HH:MM" en la zona del usuario. */
export function toLocal(iso: string, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

/**
 * Reúne el contexto que el asistente puede ver. Cada sección se incluye solo
 * si el usuario lo permite en Ajustes → Privacidad. Siempre con el cliente del
 * usuario (RLS): nunca se pueden mezclar datos de otra persona.
 */
export async function buildContext(sb: SupabaseClient, privacy: Privacy, now = new Date()) {
  const profile = (await sb.from('profiles').select('display_name, timezone').maybeSingle()).data;
  const tz = (profile?.timezone as string) || 'America/Lima';
  const nowLocal = toLocal(now.toISOString(), tz);
  const today = nowLocal.slice(0, 10);
  const weekday = WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
  const ctx: Record<string, unknown> = {
    name: profile?.display_name ?? null,
    timezone: tz,
    today,
    weekday,
    now_local: nowLocal,
    sections_not_shared: Object.entries(privacy).filter(([, v]) => !v).map(([k]) => k),
  };
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  if (privacy.planner) {
    const tasks = must(
      await sb.from('tasks').select('id, title, priority, due_at, status').neq('status', 'done').is('deleted_at', null).order('due_at', { ascending: true, nullsFirst: false }).limit(40),
      'tasks',
    ) as { id: string; title: string; priority: number; due_at: string | null; status: string }[];
    const done = must(
      await sb.from('tasks').select('id', { count: 'exact', head: false }).eq('status', 'done').gte('completed_at', daysAgo(7)).is('deleted_at', null),
      'tasks done',
    ) as unknown[];
    const events = must(
      await sb.from('events').select('title, starts_at, ends_at, all_day, location').is('deleted_at', null).gte('ends_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + 14 * 86_400_000).toISOString()).order('starts_at').limit(40),
      'events',
    ) as { title: string; starts_at: string; ends_at: string; all_day: boolean; location: string | null }[];
    ctx.pending_tasks = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      due_local: t.due_at ? toLocal(t.due_at, tz) : null,
      overdue: !!t.due_at && t.due_at < now.toISOString(),
    }));
    ctx.tasks_completed_last_7_days = done.length;
    ctx.events_next_14_days = events.map((e) => ({
      title: e.title,
      start_local: toLocal(e.starts_at, tz),
      end_local: toLocal(e.ends_at, tz),
      all_day: e.all_day,
      location: e.location,
    }));
  }

  if (privacy.habits) {
    const habits = must(
      await sb.from('habits').select('id, name, category, frequency, days_of_week, target_per_period, unit, status').is('deleted_at', null).eq('status', 'active'),
      'habits',
    ) as { id: string; name: string; category: string | null; frequency: string; days_of_week: number[]; target_per_period: number; unit: string | null }[];
    const since = toLocal(daysAgo(13), tz).slice(0, 10);
    const logs = must(
      await sb.from('habit_logs').select('habit_id, log_date, value').gte('log_date', since).is('deleted_at', null),
      'habit_logs',
    ) as { habit_id: string; log_date: string; value: number }[];
    ctx.habits = habits.map((h) => {
      const mine = logs.filter((l) => l.habit_id === h.id && l.value > 0);
      return {
        name: h.name,
        category: h.category,
        frequency: h.frequency === 'weekly' ? `${h.target_per_period} veces por semana` : `días ${h.days_of_week.map((d) => WEEKDAYS[d]).join(', ')}`,
        target: h.frequency === 'daily' && h.target_per_period > 1 ? `${h.target_per_period} ${h.unit ?? ''}`.trim() : null,
        today_value: logs.find((l) => l.habit_id === h.id && l.log_date === today)?.value ?? 0,
        days_done_last_14: new Set(mine.map((l) => l.log_date)).size,
      };
    });
  }

  if (privacy.training) {
    const fp = (await sb.from('fitness_profiles').select('goal, experience, days_per_week, minutes_per_session, equipment, limitations').maybeSingle()).data;
    const plan = (
      await sb.from('workout_plans').select('id, name, day_labels').eq('active', true).is('deleted_at', null).maybeSingle()
    ).data as { id: string; name: string; day_labels: string[] } | null;
    let planDays: unknown = null;
    if (plan) {
      const items = must(
        await sb.from('plan_exercises').select('day_index, sets, reps_min, reps_max, exercise:exercises(name_es)').eq('plan_id', plan.id).order('day_index').order('sort_order'),
        'plan_exercises',
      ) as unknown as { day_index: number; sets: number; reps_min: number; reps_max: number; exercise: { name_es: string } }[];
      planDays = plan.day_labels.map((label, i) => ({
        day: i + 1,
        label,
        exercises: items.filter((x) => x.day_index === i).map((x) => `${x.exercise.name_es} ${x.sets}×${x.reps_min}-${x.reps_max}`),
      }));
    }
    const sessions = must(
      await sb.from('workout_sessions').select('title, started_at, finished_at, perceived_effort, day_index').not('finished_at', 'is', null).is('deleted_at', null).order('started_at', { ascending: false }).limit(8),
      'sessions',
    ) as { title: string; started_at: string; perceived_effort: number | null; day_index: number | null }[];
    ctx.training = {
      profile: fp,
      active_plan: plan ? { name: plan.name, days: planDays } : null,
      recent_sessions: sessions.map((s) => ({ title: s.title, date_local: toLocal(s.started_at, tz), effort_1_10: s.perceived_effort, plan_day: s.day_index != null ? s.day_index + 1 : null })),
    };
  }

  if (privacy.nutrition) {
    const goal = (
      await sb.from('nutrition_goals').select('kcal_target, protein_g, carbs_g, fat_g, tdee_kcal, valid_from').lte('valid_from', today).order('valid_from', { ascending: false }).limit(1).maybeSingle()
    ).data;
    const meals = must(
      await sb.from('meals').select('eaten_at, meal_type, items:meal_items(name, grams, kcal, protein_g, carbs_g, fat_g, is_ai_estimate)').is('deleted_at', null).gte('eaten_at', daysAgo(7)).order('eaten_at'),
      'meals',
    ) as unknown as { eaten_at: string; meal_type: string; items: { name: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; is_ai_estimate: boolean }[] }[];
    const byDay = new Map<string, { kcal: number; protein_g: number; carbs_g: number; fat_g: number; meals: number }>();
    for (const m of meals) {
      const d = toLocal(m.eaten_at, tz).slice(0, 10);
      const acc = byDay.get(d) ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, meals: 0 };
      acc.meals++;
      for (const i of m.items) {
        acc.kcal += Number(i.kcal);
        acc.protein_g += Number(i.protein_g);
        acc.carbs_g += Number(i.carbs_g);
        acc.fat_g += Number(i.fat_g);
      }
      byDay.set(d, acc);
    }
    const round = (v: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; meals: number }) => ({
      kcal: Math.round(v.kcal),
      protein_g: Math.round(v.protein_g),
      carbs_g: Math.round(v.carbs_g),
      fat_g: Math.round(v.fat_g),
      meals: v.meals,
    });
    const weights = must(
      await sb.from('weight_logs').select('measured_on, weight_kg').order('measured_on', { ascending: false }).limit(6),
      'weights',
    ) as { measured_on: string; weight_kg: number }[];
    ctx.nutrition = {
      note: 'Totales registrados por el usuario; las calorías son aproximadas.',
      goal,
      today: byDay.get(today) ? round(byDay.get(today)!) : null,
      today_meals: meals
        .filter((m) => toLocal(m.eaten_at, tz).startsWith(today))
        .map((m) => ({ type: m.meal_type, foods: m.items.map((i) => `${i.name} ${Math.round(i.grams)} g`) })),
      last_7_days: [...byDay].filter(([d]) => d !== today).map(([d, v]) => ({ date: d, ...round(v) })),
      weights: weights.map((w) => ({ date: w.measured_on, kg: Number(w.weight_kg) })),
    };
  }

  return ctx;
}
