-- =====================================================================
-- DISCIPLINA AI · Migración 0001 · Esquema base de la Fase 3
-- Perfil, preferencias de notificación, hábitos, organizador
-- (categorías, etiquetas, notas, tareas, eventos) y recordatorios.
--
-- Reglas que aplican a todas las tablas de usuario:
--   * id uuid generable en el cliente (para crear registros sin conexión).
--   * user_id = dueño; por defecto auth.uid().
--   * created_at / updated_at / deleted_at (borrado lógico para sincronizar).
--   * RLS activado: cada usuario solo ve y modifica sus filas.
--   * Las tablas hijas usan claves foráneas compuestas (id, user_id) para
--     que sea imposible enlazar filas de otro usuario.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone     text not null default 'America/Lima' check (char_length(timezone) between 1 and 64),
  locale       text not null default 'es-PE' check (char_length(locale) between 2 and 16),
  units        text not null default 'metric' check (units in ('metric')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.notification_prefs (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  default_event_offsets integer[] not null default '{15,60}'
    check (default_event_offsets <@ array[0,5,10,15,30,60,120,1440,2880,10080]),
  habit_reminders       boolean not null default true,
  task_reminders        boolean not null default true,
  quiet_start           time,
  quiet_end             time,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((quiet_start is null) = (quiet_end is null))
);

-- Al registrarse un usuario se crean su perfil y sus preferencias.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60), '')
  );
  insert into public.notification_prefs (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Hábitos
-- ---------------------------------------------------------------------

create table public.habits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  icon              text check (char_length(icon) <= 40),
  color             text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  category          text check (category in ('study','reading','training','sleep','water','routine','health','other')),
  -- daily: se espera cada día indicado en days_of_week.
  -- weekly: se espera target_per_period veces por semana, cualquier día.
  frequency         text not null default 'daily' check (frequency in ('daily','weekly')),
  days_of_week      smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  target_per_period integer not null default 1 check (target_per_period between 1 and 100),
  unit              text check (char_length(unit) <= 20),
  reminder_time     time,
  status            text not null default 'active' check (status in ('active','paused','archived')),
  start_date        date not null default current_date,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (id, user_id)
);

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  habit_id   uuid not null,
  log_date   date not null,
  value      numeric(8,2) not null default 1 check (value >= 0),
  note       text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (habit_id, log_date),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

-- Días de descanso: no rompen las rachas.
create table public.rest_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  reason     text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, date)
);

-- ---------------------------------------------------------------------
-- Organizador
-- ---------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  scope      text not null check (scope in ('note','task','event')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  unique (user_id, scope, name)
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create unique index tags_user_name_key on public.tags (user_id, lower(name));

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  all_day     boolean not null default false,
  location    text check (char_length(location) <= 200),
  notes       text check (char_length(notes) <= 2000),
  timezone    text not null default 'America/Lima',
  category_id uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id),
  check (ends_at >= starts_at),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  description       text check (char_length(description) <= 4000),
  -- 1 = urgente · 2 = alta · 3 = normal · 4 = baja
  priority          smallint not null default 3 check (priority between 1 and 4),
  due_at            timestamptz,
  status            text not null default 'todo' check (status in ('todo','doing','done')),
  completed_at      timestamptz,
  rescheduled_count integer not null default 0 check (rescheduled_count >= 0),
  category_id       uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (id, user_id),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '' check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 20000),
  pinned      boolean not null default false,
  archived_at timestamptz,
  category_id uuid,
  task_id     uuid,
  event_id    uuid,
  search      tsvector generated always as (
                to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(body, ''))
              ) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (task_id, user_id)     references public.tasks (id, user_id)      on delete set null (task_id),
  foreign key (event_id, user_id)    references public.events (id, user_id)     on delete set null (event_id)
);

create table public.note_tags (
  user_id uuid not null default auth.uid(),
  note_id uuid not null,
  tag_id  uuid not null,
  primary key (note_id, tag_id),
  foreign key (note_id, user_id) references public.notes (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)  references public.tags (id, user_id)  on delete cascade
);

create table public.task_tags (
  user_id uuid not null default auth.uid(),
  task_id uuid not null,
  tag_id  uuid not null,
  primary key (task_id, tag_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (tag_id, user_id)  references public.tags (id, user_id)  on delete cascade
);

-- Recordatorios de eventos y tareas (los de hábitos usan habits.reminder_time).
-- Exactamente un dueño (evento o tarea) y exactamente un momento:
-- minutos antes del inicio/fecha límite, u hora exacta personalizada.
create table public.reminders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  event_id       uuid,
  task_id        uuid,
  offset_minutes integer check (offset_minutes between 0 and 10080),
  remind_at      timestamptz,
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check (num_nonnulls(event_id, task_id) = 1),
  check (num_nonnulls(offset_minutes, remind_at) = 1),
  unique nulls not distinct (event_id, task_id, offset_minutes, remind_at),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade,
  foreign key (task_id, user_id)  references public.tasks (id, user_id)  on delete cascade
);

-- ---------------------------------------------------------------------
-- Índices (consultas por usuario y por fechas)
-- ---------------------------------------------------------------------

create index habits_user_status_idx     on public.habits (user_id, status) where deleted_at is null;
create index habit_logs_user_date_idx   on public.habit_logs (user_id, log_date);
create index rest_days_user_date_idx    on public.rest_days (user_id, date);
create index categories_user_scope_idx  on public.categories (user_id, scope);
create index events_user_starts_idx     on public.events (user_id, starts_at) where deleted_at is null;
create index tasks_user_status_due_idx  on public.tasks (user_id, status, due_at) where deleted_at is null;
create index notes_user_updated_idx     on public.notes (user_id, updated_at desc) where deleted_at is null;
create index notes_search_idx           on public.notes using gin (search);
create index note_tags_user_idx         on public.note_tags (user_id);
create index task_tags_user_idx         on public.task_tags (user_id);
create index reminders_user_idx         on public.reminders (user_id);
create index reminders_event_idx        on public.reminders (event_id) where event_id is not null;
create index reminders_task_idx         on public.reminders (task_id) where task_id is not null;
-- Sincronización incremental: "dame lo que cambió desde X".
create index habits_user_updated_idx     on public.habits (user_id, updated_at);
create index habit_logs_user_updated_idx on public.habit_logs (user_id, updated_at);
create index events_user_updated_idx     on public.events (user_id, updated_at);
create index tasks_user_updated_idx      on public.tasks (user_id, updated_at);
create index reminders_user_updated_idx  on public.reminders (user_id, updated_at);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','notification_prefs','habits','habit_logs','rest_days',
    'categories','tags','events','tasks','notes','reminders'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Seguridad: RLS + permisos explícitos
-- (el proyecto no expone tablas nuevas automáticamente)
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','notification_prefs','habits','habit_logs','rest_days',
    'categories','tags','events','tasks','notes','note_tags','task_tags','reminders'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);

    execute format(
      'create policy "owner_select" on public.%I for select to authenticated
         using ((select auth.uid()) is not null and (select auth.uid()) = user_id)', t);
    execute format(
      'create policy "owner_update" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);

    -- Perfil y preferencias los crea el trigger de registro; no se insertan
    -- ni se borran desde la app (se borran con la cuenta, en cascada).
    if t in ('profiles','notification_prefs') then
      execute format('grant select, update on table public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
      execute format(
        'create policy "owner_insert" on public.%I for insert to authenticated
           with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)', t);
      execute format(
        'create policy "owner_delete" on public.%I for delete to authenticated
           using ((select auth.uid()) = user_id)', t);
    end if;
  end loop;
end $$;

-- Nota: reasignar una fila a otro usuario es imposible porque la política
-- owner_update exige user_id = auth.uid() también en el estado final.
