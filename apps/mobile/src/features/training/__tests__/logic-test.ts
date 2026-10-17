import { EXERCISES } from '@/test/catalog';
import {
  allowedEquipment,
  alternativesFor,
  estimated1RM,
  estimateMinutes,
  exerciseProgress,
  generatePlan,
  mondayKey,
  nextDayIndex,
  sessionsThisWeek,
  splitFor,
  suggestNext,
} from '../logic';
import type { FitnessProfileInput } from '../types';

const base: FitnessProfileInput = {
  goal: 'gain_muscle',
  experience: 'beginner',
  days_per_week: 3,
  minutes_per_session: 45,
  equipment: [],
  limitations: null,
};
const byId = new Map(EXERCISES.map((e) => [e.id, e]));

describe('generatePlan', () => {
  it('solo usa ejercicios del equipo disponible y del nivel adecuado', () => {
    const plan = generatePlan(base, EXERCISES);
    expect(plan.day_labels).toEqual(['Cuerpo completo A', 'Cuerpo completo B', 'Cuerpo completo C']);
    for (const it of plan.items) {
      const ex = byId.get(it.exercise_id)!;
      expect(ex.equipment).toBe('bodyweight');
      expect(ex.level).toBe('beginner');
    }
  });

  it('cada día cabe en el tiempo disponible y no repite ejercicios', () => {
    for (const minutes of [20, 30, 45, 60, 90]) {
      for (const days of [1, 2, 3, 4, 5, 6]) {
        const plan = generatePlan({ ...base, days_per_week: days, minutes_per_session: minutes, experience: 'intermediate', equipment: ['dumbbells', 'pullup_bar', 'bench'] }, EXERCISES);
        expect(plan.day_labels).toHaveLength(days);
        for (let d = 0; d < days; d++) {
          const day = plan.items.filter((i) => i.day_index === d);
          expect(day.length).toBeGreaterThanOrEqual(2);
          expect(new Set(day.map((i) => i.exercise_id)).size).toBe(day.length);
          if (day.length > 2) expect(estimateMinutes(day)).toBeLessThanOrEqual(minutes);
        }
      }
    }
  });

  it('las variantes A/B rotan ejercicios', () => {
    const plan = generatePlan({ ...base, equipment: ['dumbbells', 'pullup_bar'] }, EXERCISES);
    const dayA = plan.items.filter((i) => i.day_index === 0).map((i) => i.exercise_id);
    const dayB = plan.items.filter((i) => i.day_index === 1).map((i) => i.exercise_id);
    expect(dayA).not.toEqual(dayB);
  });

  it('el objetivo define series, repeticiones y descanso', () => {
    const strength = generatePlan({ ...base, goal: 'strength', experience: 'intermediate', equipment: ['barbell'] }, EXERCISES);
    const squat = strength.items.find((i) => byId.get(i.exercise_id)!.code === 'barbell_back_squat');
    expect(squat).toMatchObject({ sets: 4, reps_min: 4, reps_max: 6, rest_seconds: 150 });
    const fat = generatePlan({ ...base, goal: 'lose_fat' }, EXERCISES);
    expect(fat.items.some((i) => byId.get(i.exercise_id)!.muscle_group === 'cardio')).toBe(true);
  });

  it('los ejercicios por tiempo usan segundos', () => {
    const plan = generatePlan({ ...base, minutes_per_session: 90 }, EXERCISES);
    const plank = plan.items.find((i) => ['plank', 'side_plank'].includes(byId.get(i.exercise_id)!.code!));
    expect(plank?.reps_min).toBeGreaterThanOrEqual(20);
  });

  it('nunca más de 6 días (al menos uno de descanso)', () => {
    expect(splitFor(6, 'advanced')).toHaveLength(6);
  });
});

describe('alternativas y progresión', () => {
  it('ofrece variantes más fáciles y más difíciles del mismo grupo muscular', () => {
    const pushUp = EXERCISES.find((e) => e.code === 'push_up')!;
    const alt = alternativesFor(pushUp, EXERCISES, allowedEquipment({ equipment: ['dip_bars'] }));
    expect(alt.similar.map((e) => e.code)).toEqual(expect.arrayContaining(['knee_push_up', 'incline_push_up']));
    expect(alt.harder.map((e) => e.code)).toContain('dip');
    expect([...alt.easier, ...alt.similar, ...alt.harder].every((e) => e.muscle_group === 'chest')).toBe(true);
  });

  const pe = { sets: 3, reps_min: 8, reps_max: 12, suggested_kg: null };
  const db = { equipment: 'dumbbells' as const, code: 'dumbbell_press' };

  it('sin historial no inventa un peso', () => {
    expect(suggestNext(pe, db, []).weight_kg).toBeNull();
  });

  it('mantiene el peso hasta completar el rango en todas las series', () => {
    const s = suggestNext(pe, db, [
      { reps: 12, weight_kg: 10 },
      { reps: 10, weight_kg: 10 },
      { reps: 9, weight_kg: 10 },
    ]);
    expect(s).toMatchObject({ weight_kg: 10, reps: 12 });
  });

  it('sube la carga al completar todas las series', () => {
    expect(suggestNext(pe, db, [{ reps: 12, weight_kg: 10 }, { reps: 12, weight_kg: 10 }, { reps: 12, weight_kg: 10 }])).toMatchObject({ weight_kg: 11, reps: 8 });
    expect(suggestNext(pe, db, [{ reps: 12, weight_kg: 40 }, { reps: 12, weight_kg: 40 }, { reps: 13, weight_kg: 40 }]).weight_kg).toBe(42.5);
  });

  it('con peso corporal sugiere una variante más difícil', () => {
    const s = suggestNext(pe, { equipment: 'bodyweight', code: 'push_up' }, [{ reps: 12, weight_kg: 0 }, { reps: 12, weight_kg: 0 }, { reps: 12, weight_kg: 0 }]);
    expect(s.weight_kg).toBeNull();
    expect(s.reason).toMatch(/variante más difícil/);
  });
});

describe('calendario y progreso', () => {
  const day = (iso: string) => iso.slice(0, 10);

  it('el siguiente día es el que sigue al último terminado', () => {
    const sessions = [
      { plan_id: 'p', day_index: 0, finished_at: 'x', started_at: '2026-10-12T10:00:00Z' },
      { plan_id: 'p', day_index: 1, finished_at: 'x', started_at: '2026-10-14T10:00:00Z' },
      { plan_id: 'p', day_index: 2, finished_at: null, started_at: '2026-10-15T10:00:00Z' },
      { plan_id: 'otro', day_index: 0, finished_at: 'x', started_at: '2026-10-16T10:00:00Z' },
    ];
    expect(nextDayIndex(3, 'p', sessions)).toBe(2);
    expect(nextDayIndex(2, 'p', sessions)).toBe(0);
    expect(nextDayIndex(3, 'nuevo', sessions)).toBe(0);
  });

  it('cuenta entrenamientos de la semana actual (lunes a hoy)', () => {
    expect(mondayKey('2026-10-16')).toBe('2026-10-12');
    expect(mondayKey('2026-10-12')).toBe('2026-10-12');
    const s = [
      { finished_at: 'x', started_at: '2026-10-11T10:00:00Z' },
      { finished_at: 'x', started_at: '2026-10-13T10:00:00Z' },
      { finished_at: null, started_at: '2026-10-14T10:00:00Z' },
    ];
    expect(sessionsThisWeek(s, '2026-10-16', day)).toBe(1);
  });

  it('1RM estimado y evolución por sesión', () => {
    expect(estimated1RM(100, 5)).toBe(116.7);
    expect(estimated1RM(0, 10)).toBe(0);
    const sessions = [
      { id: 's1', started_at: '2026-10-01T10:00:00Z', finished_at: 'x' },
      { id: 's2', started_at: '2026-10-08T10:00:00Z', finished_at: 'x' },
    ];
    const sets = [
      { session_id: 's1', exercise_id: 'e', reps: 10, weight_kg: 20 },
      { session_id: 's2', exercise_id: 'e', reps: 8, weight_kg: 25 },
      { session_id: 's2', exercise_id: 'otro', reps: 8, weight_kg: 90 },
    ];
    expect(exerciseProgress(sessions, sets, 'e', day)).toEqual({
      metric: 'e1rm',
      points: [
        { date: '2026-10-01', value: 26.7 },
        { date: '2026-10-08', value: 31.7 },
      ],
    });
  });
});
