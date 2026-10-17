import { categoryMeta, weekDays } from '@/features/habits/presets';
import { zonedToUtcIso } from '@/features/tasks/logic';
import type { Proposal } from './types';

type P = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');

function dateLabel(day: string) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
}

const PRIORITY = ['', 'urgente', 'alta', 'normal', 'baja'];

/** Texto claro de lo que se hará al confirmar (se muestra antes de aplicar nada). */
export function describeProposal(p: Pick<Proposal, 'action_type' | 'payload'>, taskTitles: Map<string, string>): { title: string; lines: string[] } {
  const x = p.payload as P;
  switch (p.action_type) {
    case 'create_task':
      return {
        title: `Crear tarea: ${s(x.title)}`,
        lines: [
          x.due_date ? `Para el ${dateLabel(s(x.due_date))}${x.due_time ? ` a las ${s(x.due_time)}` : ''}` : 'Sin fecha',
          `Prioridad ${PRIORITY[Number(x.priority ?? 3)] ?? 'normal'}`,
          ...(x.description ? [s(x.description)] : []),
        ],
      };
    case 'create_event':
      return {
        title: `Crear evento: ${s(x.title)}`,
        lines: [`${dateLabel(s(x.date))}, ${s(x.start_time)}–${s(x.end_time)}`, ...(x.location ? [`En ${s(x.location)}`] : []), ...(x.notes ? [s(x.notes)] : [])],
      };
    case 'create_habit': {
      const days = (x.days_of_week as number[] | undefined) ?? [];
      const freq =
        x.frequency === 'weekly'
          ? `${Number(x.target_per_period ?? 1)} veces por semana`
          : days.length === 7
            ? 'Todos los días'
            : days.map((d) => weekDays.find((w) => w.value === d)?.short ?? '').join(' ');
      const cat = categoryMeta[(x.category as keyof typeof categoryMeta) ?? 'other']?.label ?? 'Otro';
      return { title: `Crear hábito: ${s(x.name)}`, lines: [`${cat} · ${freq}`, ...(x.reminder_time ? [`Aviso a las ${s(x.reminder_time)}`] : [])] };
    }
    case 'reschedule_tasks': {
      const ids = (x.task_ids as string[]) ?? [];
      return {
        title: `Mover ${ids.length} tarea${ids.length === 1 ? '' : 's'} al ${dateLabel(s(x.due_date))}${x.due_time ? ` ${s(x.due_time)}` : ''}`,
        lines: ids.map((id) => `• ${taskTitles.get(id) ?? 'Tarea'}`),
      };
    }
    case 'complete_task':
      return { title: `Marcar como hecha: ${taskTitles.get(s(x.task_id)) ?? 'tarea'}`, lines: [] };
  }
}

/** Instante de vencimiento: si no hay hora, fin del día (igual que el formulario de tareas). */
export function dueAt(day: string, time: string | undefined | null, tz: string) {
  return zonedToUtcIso(day, time || '23:59', tz);
}

export const SAMPLE_PROMPTS = [
  '¿Qué tengo pendiente hoy?',
  '¿Cómo voy con mis objetivos esta semana?',
  '¿Qué hábitos estoy descuidando?',
  'Reorganiza mis tareas atrasadas',
  '¿Qué rutina me toca hoy?',
  'Ayúdame a organizar mi horario de estudio',
];

export const CONTEXT_LABELS: Record<string, string> = {
  habits: 'hábitos',
  planner: 'tareas y calendario',
  training: 'entrenamiento',
  nutrition: 'nutrición',
};
