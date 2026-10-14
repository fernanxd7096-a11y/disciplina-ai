export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  timezone: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Reminder = {
  id: string;
  user_id: string;
  event_id: string | null;
  task_id: string | null;
  /** Minutos antes del inicio / fecha límite. */
  offset_minutes: number | null;
  /** Momento exacto personalizado. */
  remind_at: string | null;
  enabled: boolean;
  deleted_at: string | null;
};

/** Lo que el formulario edita: un offset o una hora exacta. */
export type ReminderDraft = { offset_minutes: number | null; remind_at: string | null };

export type EventInput = Pick<CalendarEvent, 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'location' | 'notes' | 'timezone'>;
