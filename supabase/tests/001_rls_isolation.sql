-- Pruebas de seguridad: aislamiento entre usuarios, acceso anónimo,
-- trigger de registro y restricciones de integridad.
-- Cada bloque falla con RAISE EXCEPTION si algo no se cumple.

create or replace function tests.assert(ok boolean, msg text) returns void
language plpgsql as $$
begin
  if ok is not true then
    raise exception 'FALLO: %', msg;
  end if;
  raise notice 'ok - %', msg;
end $$;

-- Ejecuta SQL y verifica que falle (por permisos, RLS o restricción).
create or replace function tests.assert_fails(sql text, msg text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLO: debía fallar: %', msg;
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- Dos usuarios de prueba
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.local', '{"display_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.local', '{}');

-- ---------------------------------------------------------------- registro
select tests.assert(
  (select count(*) from public.profiles) = 2,
  'el registro crea un perfil por usuario');
select tests.assert(
  (select display_name from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 'Ana',
  'el perfil toma el nombre de los metadatos');
select tests.assert(
  (select timezone from public.profiles where user_id = '22222222-2222-2222-2222-222222222222') = 'America/Lima',
  'zona horaria por defecto America/Lima');
select tests.assert(
  (select count(*) from public.notification_prefs) = 2,
  'el registro crea preferencias de notificación');

-- ---------------------------------------------------------------- datos de Ana
begin;
select tests.login_as('11111111-1111-1111-1111-111111111111');

insert into public.habits (id, name, category) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Leer 20 minutos', 'reading');
insert into public.habit_logs (habit_id, log_date) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-13');
insert into public.tasks (id, title, due_at) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Entregar informe', '2026-10-15 17:00-05');
insert into public.events (id, title, starts_at, ends_at) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Clase', '2026-10-14 08:00-05', '2026-10-14 10:00-05');
insert into public.reminders (event_id, offset_minutes) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 15);
insert into public.notes (id, title, body) values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Ideas', 'Estudiar bases de datos los martes');
insert into public.tags (id, name) values ('aaaaaaaa-0000-0000-0000-000000000005', 'senati');
insert into public.note_tags (note_id, tag_id) values
  ('aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005');

select tests.assert(
  (select user_id from public.habits where id = 'aaaaaaaa-0000-0000-0000-000000000001')
    = '11111111-1111-1111-1111-111111111111',
  'user_id se completa solo con auth.uid()');
select tests.assert((select count(*) from public.habits) = 1, 'Ana ve su hábito');
select tests.assert(
  (select count(*) from public.notes where search @@ to_tsquery('spanish', 'estudiar')) = 1,
  'búsqueda de texto en español encuentra la nota');
select tests.assert(
  (select count(*) from public.profiles) = 1,
  'Ana solo ve su propio perfil');

select tests.assert_fails(
  $q$insert into public.habits (name, user_id) values ('Intruso', '22222222-2222-2222-2222-222222222222')$q$,
  'Ana no puede crear hábitos a nombre de Beto');
select tests.logout();
commit;

-- ---------------------------------------------------------------- Beto intenta acceder
begin;
select tests.login_as('22222222-2222-2222-2222-222222222222');

select tests.assert((select count(*) from public.habits) = 0, 'Beto no ve hábitos de Ana');
select tests.assert((select count(*) from public.habit_logs) = 0, 'Beto no ve registros de Ana');
select tests.assert((select count(*) from public.tasks) = 0, 'Beto no ve tareas de Ana');
select tests.assert((select count(*) from public.events) = 0, 'Beto no ve eventos de Ana');
select tests.assert((select count(*) from public.reminders) = 0, 'Beto no ve recordatorios de Ana');
select tests.assert((select count(*) from public.notes) = 0, 'Beto no ve notas de Ana');
select tests.assert((select count(*) from public.note_tags) = 0, 'Beto no ve etiquetas de notas de Ana');
select tests.assert((select count(*) from public.profiles) = 1, 'Beto solo ve su perfil');

with u as (
  update public.habits set name = 'Hackeado'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1
) select tests.assert((select count(*) from u) = 0, 'Beto no puede modificar el hábito de Ana');

with d as (
  delete from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1
) select tests.assert((select count(*) from d) = 0, 'Beto no puede borrar la tarea de Ana');

with u as (
  update public.profiles set display_name = 'Hackeado'
  where user_id = '11111111-1111-1111-1111-111111111111' returning 1
) select tests.assert((select count(*) from u) = 0, 'Beto no puede modificar el perfil de Ana');

-- Enlazar filas propias con filas ajenas debe ser imposible.
select tests.assert_fails(
  $q$insert into public.habit_logs (habit_id, log_date) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-14')$q$,
  'Beto no puede registrar progreso en el hábito de Ana');
select tests.assert_fails(
  $q$insert into public.reminders (event_id, offset_minutes) values ('aaaaaaaa-0000-0000-0000-000000000003', 60)$q$,
  'Beto no puede ponerle recordatorios al evento de Ana');
select tests.assert_fails(
  $q$insert into public.notes (title, task_id) values ('x', 'aaaaaaaa-0000-0000-0000-000000000002')$q$,
  'Beto no puede vincular su nota a la tarea de Ana');

insert into public.tags (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'mio');
insert into public.notes (id, title) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Nota de Beto');
select tests.assert_fails(
  $q$insert into public.note_tags (note_id, tag_id) values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005')$q$,
  'Beto no puede usar la etiqueta de Ana');

-- Ni perfil ni preferencias se crean o borran desde la app.
select tests.assert_fails(
  $q$insert into public.profiles (user_id) values ('22222222-2222-2222-2222-222222222222')$q$,
  'la app no inserta perfiles directamente');
select tests.assert_fails(
  $q$delete from public.notification_prefs$q$,
  'la app no borra preferencias');

-- Beto no puede pasarle su nota a Ana.
select tests.assert_fails(
  $q$update public.notes set user_id = '11111111-1111-1111-1111-111111111111' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$,
  'no se puede reasignar una fila a otro usuario');

select tests.logout();
commit;

-- ---------------------------------------------------------------- anónimo
begin;
select tests.login_as_anon();
select tests.assert_fails($q$select * from public.habits$q$, 'anónimo no puede leer hábitos');
select tests.assert_fails($q$select * from public.profiles$q$, 'anónimo no puede leer perfiles');
select tests.assert_fails($q$insert into public.notes (title) values ('spam')$q$, 'anónimo no puede crear notas');
select tests.logout();
commit;

-- ---------------------------------------------------------------- integridad
begin;
select tests.login_as('11111111-1111-1111-1111-111111111111');

select tests.assert_fails(
  $q$insert into public.habits (name) values ('   ')$q$,
  'un hábito necesita nombre');
select tests.assert_fails(
  $q$insert into public.habits (name, days_of_week) values ('x', '{7}')$q$,
  'días de la semana válidos 0–6');
select tests.assert_fails(
  $q$insert into public.habit_logs (habit_id, log_date) values ('aaaaaaaa-0000-0000-0000-000000000001', '2026-10-13')$q$,
  'un solo registro por hábito y día');
select tests.assert_fails(
  $q$insert into public.events (title, starts_at, ends_at) values ('x', '2026-10-14 10:00-05', '2026-10-14 09:00-05')$q$,
  'un evento no puede terminar antes de empezar');
select tests.assert_fails(
  $q$insert into public.tasks (title, status) values ('x', 'done')$q$,
  'una tarea hecha necesita completed_at');
select tests.assert_fails(
  $q$insert into public.tasks (title, priority) values ('x', 9)$q$,
  'prioridad entre 1 y 4');
select tests.assert_fails(
  $q$insert into public.reminders (event_id, offset_minutes) values ('aaaaaaaa-0000-0000-0000-000000000003', 15)$q$,
  'no se duplican recordatorios del mismo evento y momento');
select tests.assert_fails(
  $q$insert into public.reminders (event_id, task_id, offset_minutes) values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 30)$q$,
  'un recordatorio pertenece a un solo dueño');
select tests.assert_fails(
  $q$insert into public.reminders (task_id) values ('aaaaaaaa-0000-0000-0000-000000000002')$q$,
  'un recordatorio necesita un momento');
select tests.assert_fails(
  $q$insert into public.tags (name) values ('SENATI')$q$,
  'etiquetas únicas sin importar mayúsculas');

-- updated_at se actualiza solo
update public.tasks set title = 'Entregar informe final'
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select tests.assert(
  (select updated_at >= created_at from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'updated_at se mantiene al día');

-- Borrar un evento borra sus recordatorios
delete from public.events where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select tests.assert((select count(*) from public.reminders) = 0, 'borrar un evento borra sus recordatorios');

-- Borrar una tarea vinculada deja la nota sin vínculo (no la borra)
update public.notes set task_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  where id = 'aaaaaaaa-0000-0000-0000-000000000004';
delete from public.tasks where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select tests.assert(
  (select task_id is null and user_id = '11111111-1111-1111-1111-111111111111'
     from public.notes where id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  'borrar una tarea desvincula la nota y conserva su dueño');

select tests.logout();
commit;

-- ---------------------------------------------------------------- borrar cuenta
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select tests.assert(
  (select count(*) from public.habits where user_id = '11111111-1111-1111-1111-111111111111') = 0
  and (select count(*) from public.notes where user_id = '11111111-1111-1111-1111-111111111111') = 0
  and (select count(*) from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 0,
  'borrar la cuenta borra todos sus datos');
select tests.assert(
  (select count(*) from public.notes where user_id = '22222222-2222-2222-2222-222222222222') = 1,
  'borrar una cuenta no toca datos de otros');
