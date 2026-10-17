-- =====================================================================
-- DISCIPLINA AI · Migración 0002 · Fases 4–6
-- Privacidad, perfil físico, entrenamiento, nutrición, peso, logros,
-- asistente de IA (conversaciones, propuestas, límites diarios), fotos de
-- comida (Storage), eventos recurrentes y borrado de cuenta.
--
-- Mismas reglas que la 0001: RLS en todo, claves foráneas compuestas
-- (id, user_id), límites de seguridad en la propia base.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Perfil: datos para calcular el objetivo calórico (Mifflin-St Jeor)
-- ---------------------------------------------------------------------

alter table public.profiles
  add column birth_date     date check (birth_date between date '1900-01-01' and current_date - interval '13 years'),
  add column sex            text check (sex in ('male','female')),
  add column height_cm      numeric(4,1) check (height_cm between 100 and 250),
  add column activity_level text check (activity_level in ('sedentary','light','moderate','active','very_active'));

-- Qué datos puede usar el asistente de IA y si se conservan las fotos.
create table public.privacy_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  ai_use_habits    boolean not null default true,
  ai_use_planner   boolean not null default true,
  ai_use_training  boolean not null default true,
  ai_use_nutrition boolean not null default true,
  keep_food_photos boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

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
  insert into public.privacy_settings (user_id) values (new.id);
  return new;
end;
$$;

-- Usuarios que ya existían antes de esta migración.
insert into public.privacy_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- Eventos recurrentes (repetición simple, sin RRULE completo)
-- ---------------------------------------------------------------------

alter table public.events
  add column recurrence       text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  add column recurrence_until date,
  add constraint events_recurrence_until_check check (recurrence <> 'none' or recurrence_until is null);

-- ---------------------------------------------------------------------
-- Entrenamiento
-- ---------------------------------------------------------------------

create table public.fitness_profiles (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goal                text not null check (goal in ('lose_fat','gain_muscle','strength','endurance','general')),
  experience          text not null check (experience in ('beginner','intermediate','advanced')),
  -- Máximo 6: al menos un día de descanso por semana.
  days_per_week       smallint not null check (days_per_week between 1 and 6),
  minutes_per_session smallint not null check (minutes_per_session between 15 and 180),
  equipment           text[] not null default '{}'
    check (equipment <@ array['bodyweight','pullup_bar','dip_bars','dumbbells','barbell','kettlebell','bands','bench','machines','punching_bag','jump_rope']),
  limitations         text check (char_length(limitations) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Catálogo: owner_id nulo = ejercicio global (solo lectura); con dueño = propio.
create table public.exercises (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users (id) on delete cascade,
  code            text unique check (code ~ '^[a-z0-9_]{2,60}$'),
  name_es         text not null check (char_length(btrim(name_es)) between 2 and 80),
  muscle_group    text not null check (muscle_group in ('chest','back','shoulders','arms','legs','glutes','core','full_body','cardio')),
  equipment       text not null default 'bodyweight'
    check (equipment in ('bodyweight','pullup_bar','dip_bars','dumbbells','barbell','kettlebell','bands','bench','machines','punching_bag','jump_rope')),
  level           text not null default 'beginner' check (level in ('beginner','intermediate','advanced')),
  instructions    text not null default '' check (char_length(instructions) <= 2000),
  common_mistakes text not null default '' check (char_length(common_mistakes) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((owner_id is null) = (code is not null))
);

create table public.workout_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  source     text not null default 'manual' check (source in ('manual','ai')),
  -- Nombre de cada día de la rutina ("Empuje", "Tirón"…). Como mucho 6.
  day_labels text[] not null check (cardinality(day_labels) between 1 and 6),
  notes      text check (char_length(notes) <= 2000),
  active     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);
create unique index workout_plans_one_active on public.workout_plans (user_id) where active and deleted_at is null;

create table public.plan_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  plan_id      uuid not null,
  day_index    smallint not null check (day_index between 0 and 5),
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  sets         smallint not null check (sets between 1 and 10),
  reps_min     smallint not null check (reps_min between 1 and 100),
  reps_max     smallint not null check (reps_max between 1 and 100),
  rest_seconds smallint not null default 90 check (rest_seconds between 0 and 600),
  suggested_kg numeric(5,1) check (suggested_kg between 0 and 500),
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (reps_max >= reps_min),
  foreign key (plan_id, user_id) references public.workout_plans (id, user_id) on delete cascade
);

create table public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id          uuid,
  day_index        smallint check (day_index between 0 and 5),
  title            text not null check (char_length(btrim(title)) between 1 and 80),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  perceived_effort smallint check (perceived_effort between 1 and 10),
  notes            text check (char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (id, user_id),
  check (finished_at is null or finished_at >= started_at),
  foreign key (plan_id, user_id) references public.workout_plans (id, user_id) on delete set null (plan_id)
);

create table public.set_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  session_id  uuid not null,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  set_number  smallint not null check (set_number between 1 and 30),
  reps        smallint not null check (reps between 0 and 300),
  weight_kg   numeric(5,1) not null default 0 check (weight_kg between 0 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, exercise_id, set_number),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Nutrición
-- ---------------------------------------------------------------------

-- Alimentos: owner_id nulo = base global con fuente trazable (solo lectura).
create table public.foods (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  name_es     text not null check (char_length(btrim(name_es)) between 2 and 120),
  source      text not null check (source in ('usda','peru_ins','custom')),
  source_ref  text check (char_length(source_ref) <= 120),
  kcal_100g   numeric(6,1) not null check (kcal_100g between 0 and 900),
  protein_g   numeric(5,1) not null check (protein_g between 0 and 100),
  carbs_g     numeric(5,1) not null check (carbs_g between 0 and 100),
  fat_g       numeric(5,1) not null check (fat_g between 0 and 100),
  fiber_g     numeric(5,1) check (fiber_g between 0 and 100),
  -- Porción típica para sugerir gramos ("1 unidad mediana" = 120 g).
  portion_g     numeric(6,1) check (portion_g between 1 and 2000),
  portion_label text check (char_length(portion_label) <= 40),
  search_name text generated always as (lower(translate(name_es, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((owner_id is null) = (source <> 'custom'))
);
create index foods_search_trgm on public.foods using gin (search_name extensions.gin_trgm_ops);

create table public.food_analyses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  photo_path text,
  model      text,
  status     text not null default 'done' check (status in ('done','failed')),
  result     jsonb,
  error      text check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_at    timestamptz not null default now(),
  meal_type   text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  origin      text not null default 'manual' check (origin in ('manual','photo')),
  analysis_id uuid,
  photo_path  text,
  notes       text check (char_length(notes) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id),
  foreign key (analysis_id, user_id) references public.food_analyses (id, user_id) on delete set null (analysis_id)
);

create table public.meal_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  meal_id        uuid not null,
  food_id        uuid references public.foods (id) on delete set null,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  grams          numeric(6,1) not null check (grams between 1 and 3000),
  kcal           numeric(6,1) not null check (kcal between 0 and 10000),
  protein_g      numeric(5,1) not null check (protein_g between 0 and 1000),
  carbs_g        numeric(5,1) not null check (carbs_g between 0 and 1000),
  fat_g          numeric(5,1) not null check (fat_g between 0 and 1000),
  -- Origen del dato: base nutricional, estimación de la IA, o corregido a mano.
  is_ai_estimate boolean not null default false,
  user_edited    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (meal_id, user_id) references public.meals (id, user_id) on delete cascade
);

-- Objetivo calórico. La base rechaza objetivos extremos:
-- mínimo 1200 kcal (mujeres) / 1500 kcal (hombres), déficit máximo 25 %
-- y superávit máximo 20 % respecto al gasto estimado (TDEE).
create table public.nutrition_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sex         text not null check (sex in ('male','female')),
  tdee_kcal   integer not null check (tdee_kcal between 1000 and 6000),
  kcal_target integer not null,
  protein_g   integer not null check (protein_g between 0 and 400),
  carbs_g     integer not null check (carbs_g between 0 and 900),
  fat_g       integer not null check (fat_g between 0 and 300),
  method      text not null default 'mifflin' check (method in ('mifflin')),
  valid_from  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, valid_from),
  constraint nutrition_goals_min_kcal check (kcal_target >= case sex when 'male' then 1500 else 1200 end),
  constraint nutrition_goals_max_deficit check (kcal_target >= ceil(tdee_kcal * 0.75)),
  constraint nutrition_goals_max_surplus check (kcal_target <= floor(tdee_kcal * 1.20))
);

create table public.weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  weight_kg   numeric(5,2) not null check (weight_kg between 25 and 350),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- ---------------------------------------------------------------------
-- Logros: la app los calcula a partir de los datos y guarda la fecha en
-- que se desbloquearon (la XP se deriva, no se guarda: nunca se duplica).
-- ---------------------------------------------------------------------

create table public.user_achievements (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code        text not null check (code ~ '^[a-z0-9_]{2,60}$'),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- ---------------------------------------------------------------------
-- Asistente de IA
-- ---------------------------------------------------------------------

create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default 'Conversación' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  conversation_id uuid not null,
  role            text not null check (role in ('user','assistant')),
  content         text not null check (char_length(content) <= 8000),
  created_at      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);

-- Lo que el asistente quiere crear o cambiar. Nada se aplica hasta que el
-- usuario confirma; la app aplica la propuesta con su propia sesión (RLS).
create table public.ai_action_proposals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  message_id  uuid not null,
  action_type text not null check (action_type in ('create_task','create_event','create_habit','reschedule_tasks','complete_task')),
  payload     jsonb not null,
  status      text not null default 'pending' check (status in ('pending','applied','rejected')),
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((status = 'applied') = (applied_at is not null)),
  foreign key (message_id, user_id) references public.ai_messages (id, user_id) on delete cascade
);

-- Contador diario de uso de IA. El usuario lo puede leer pero no escribir:
-- solo cambia a través de consume_ai_quota().
create table public.ai_usage (
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,
  chat_count   integer not null default 0,
  vision_count integer not null default 0,
  plan_count   integer not null default 0,
  primary key (user_id, day)
);

create or replace function public.consume_ai_quota(kind text, daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if kind not in ('chat','vision','plan') or daily_limit < 1 or daily_limit > 1000 then
    raise exception 'invalid quota request' using errcode = '22023';
  end if;

  insert into public.ai_usage (user_id, day) values (uid, (now() at time zone 'utc')::date)
  on conflict (user_id, day) do nothing;

  execute format(
    'update public.ai_usage set %1$I = %1$I + 1
       where user_id = $1 and day = $2 and %1$I < $3
       returning %1$I', kind || '_count')
    into used
    using uid, (now() at time zone 'utc')::date, daily_limit;

  return used is not null;
end;
$$;

revoke all on function public.consume_ai_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Búsqueda de alimentos (sin acentos, tolera errores de tipeo)
-- ---------------------------------------------------------------------

create or replace function public.search_foods(q text, max_results integer default 20)
returns setof public.foods
language sql
stable
security invoker
set search_path = ''
as $$
  with term as (
    select lower(translate(btrim(q), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) as t
  )
  select f.*
  from public.foods f, term
  where char_length(term.t) >= 2
    and (f.search_name like '%' || term.t || '%' or extensions.word_similarity(term.t, f.search_name) >= 0.5)
  order by
    (f.owner_id is not null) desc,
    (f.search_name like term.t || '%') desc,
    extensions.word_similarity(term.t, f.search_name) desc,
    f.name_es
  limit least(greatest(max_results, 1), 50);
$$;

grant execute on function public.search_foods(text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- Datos agregados para estadísticas y logros (una sola consulta)
-- ---------------------------------------------------------------------

create or replace function public.my_progress_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'tasks_done',       (select count(*) from public.tasks where status = 'done' and deleted_at is null),
    'habit_logs',       (select count(*) from public.habit_logs where deleted_at is null and value > 0),
    'workouts',         (select count(*) from public.workout_sessions where finished_at is not null and deleted_at is null),
    'meals',            (select count(*) from public.meals where deleted_at is null),
    'meal_days',        (select count(distinct (eaten_at at time zone 'utc')::date) from public.meals where deleted_at is null),
    'weight_logs',      (select count(*) from public.weight_logs),
    'notes',            (select count(*) from public.notes where deleted_at is null),
    'photo_meals',      (select count(*) from public.meals where origin = 'photo' and deleted_at is null)
  );
$$;

grant execute on function public.my_progress_counts() to authenticated;

-- ---------------------------------------------------------------------
-- Borrar la cuenta: elimina el usuario y, en cascada, todos sus datos.
-- (Las fotos se borran antes desde la app con la API de Storage.)
-- ---------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------

create index exercises_owner_idx            on public.exercises (owner_id);
create index workout_plans_user_idx         on public.workout_plans (user_id) where deleted_at is null;
create index plan_exercises_plan_idx        on public.plan_exercises (plan_id, day_index, sort_order);
create index plan_exercises_user_idx        on public.plan_exercises (user_id);
create index workout_sessions_user_idx      on public.workout_sessions (user_id, started_at desc) where deleted_at is null;
create index set_logs_session_idx           on public.set_logs (session_id);
create index set_logs_user_idx              on public.set_logs (user_id);
create index foods_owner_idx                on public.foods (owner_id);
create index meals_user_eaten_idx           on public.meals (user_id, eaten_at desc) where deleted_at is null;
create index meal_items_meal_idx            on public.meal_items (meal_id);
create index meal_items_user_idx            on public.meal_items (user_id);
create index food_analyses_user_idx         on public.food_analyses (user_id, created_at desc);
create index nutrition_goals_user_idx       on public.nutrition_goals (user_id, valid_from desc);
create index weight_logs_user_idx           on public.weight_logs (user_id, measured_on desc);
create index ai_conversations_user_idx      on public.ai_conversations (user_id, updated_at desc);
create index ai_messages_conv_idx           on public.ai_messages (conversation_id, created_at);
create index ai_messages_user_idx           on public.ai_messages (user_id);
create index ai_proposals_user_status_idx   on public.ai_action_proposals (user_id, status);
create index ai_proposals_message_idx       on public.ai_action_proposals (message_id);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'privacy_settings','fitness_profiles','exercises','workout_plans','plan_exercises',
    'workout_sessions','set_logs','foods','meals','meal_items','nutrition_goals',
    'weight_logs','ai_conversations','ai_action_proposals'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Seguridad: RLS + permisos explícitos
-- ---------------------------------------------------------------------

-- Tablas de usuario normales: el dueño lee, crea, edita y borra lo suyo.
do $$
declare t text;
begin
  foreach t in array array[
    'fitness_profiles','workout_plans','plan_exercises','workout_sessions','set_logs',
    'food_analyses','meals','meal_items','nutrition_goals','weight_logs','user_achievements',
    'ai_conversations','ai_messages','ai_action_proposals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy "owner_select" on public.%I for select to authenticated
         using ((select auth.uid()) is not null and (select auth.uid()) = user_id)', t);
    execute format(
      'create policy "owner_insert" on public.%I for insert to authenticated
         with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)', t);
    execute format(
      'create policy "owner_update" on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "owner_delete" on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Privacidad: la crea el registro; el usuario solo la lee y la cambia.
alter table public.privacy_settings enable row level security;
revoke all on table public.privacy_settings from anon, authenticated;
grant select, update on table public.privacy_settings to authenticated;
create policy "owner_select" on public.privacy_settings for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy "owner_update" on public.privacy_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Uso de IA: solo lectura para el dueño; se escribe vía consume_ai_quota().
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;
create policy "owner_select" on public.ai_usage for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- Catálogos con filas globales (owner_id nulo, solo lectura) y propias.
do $$
declare t text;
begin
  foreach t in array array['exercises','foods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy "global_or_owner_select" on public.%I for select to authenticated
         using ((select auth.uid()) is not null and (owner_id is null or owner_id = (select auth.uid())))', t);
    execute format(
      'create policy "owner_insert" on public.%I for insert to authenticated
         with check ((select auth.uid()) is not null and owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner_update" on public.%I for update to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner_delete" on public.%I for delete to authenticated
         using (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage: bucket privado de fotos de comida, carpeta = id del usuario
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "food_photos_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food_photos_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food_photos_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
