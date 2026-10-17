-- Pruebas de la migración 0002: entrenamiento, nutrición, IA, Storage,
-- límites de seguridad y borrado de cuenta. Usuarios propios: Carla y Diego.

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'carla@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'diego@test.local');

-- El catálogo global lo carga la migración 0003. Se fijan ids conocidos para
-- las pruebas (aún nada los referencia).
update public.exercises set id = 'eeeeeeee-0000-0000-0000-000000000001' where code = 'push_up';
update public.foods set id = 'ffffffff-0000-0000-0000-000000000001' where name_es = 'Arroz blanco cocido' and owner_id is null;
update public.foods set id = 'ffffffff-0000-0000-0000-000000000002' where name_es = 'Plátano de seda' and owner_id is null;
select tests.assert((select count(*) from public.foods where owner_id is null) >= 60, 'la semilla carga los alimentos USDA');
select tests.assert((select count(*) from public.exercises where owner_id is null) >= 37, 'la semilla carga los ejercicios');

-- ---------------------------------------------------------------- registro
select tests.assert(
  (select count(*) from public.privacy_settings) = (select count(*) from auth.users),
  'cada usuario tiene ajustes de privacidad');
select tests.assert(
  (select keep_food_photos from public.privacy_settings where user_id = '33333333-3333-3333-3333-333333333333') = false,
  'por defecto las fotos de comida no se conservan');

-- ---------------------------------------------------------------- datos de Carla
begin;
select tests.login_as('33333333-3333-3333-3333-333333333333');

insert into public.fitness_profiles (goal, experience, days_per_week, minutes_per_session, equipment)
values ('lose_fat', 'intermediate', 4, 60, '{bodyweight,pullup_bar}');
insert into public.workout_plans (id, name, day_labels, active) values
  ('aaaaaaaa-1000-0000-0000-000000000001', 'Calistenia 4 días', '{Empuje,Tirón,Piernas,Full}', true);
insert into public.plan_exercises (plan_id, day_index, exercise_id, sets, reps_min, reps_max) values
  ('aaaaaaaa-1000-0000-0000-000000000001', 0, 'eeeeeeee-0000-0000-0000-000000000001', 4, 8, 12);
insert into public.workout_sessions (id, plan_id, day_index, title, started_at, finished_at) values
  ('aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-1000-0000-0000-000000000001', 0, 'Empuje',
   '2026-10-14 07:00-05', '2026-10-14 08:00-05');
insert into public.set_logs (session_id, exercise_id, set_number, reps, weight_kg) values
  ('aaaaaaaa-1000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 1, 12, 0);
insert into public.meals (id, meal_type) values ('aaaaaaaa-1000-0000-0000-000000000003', 'lunch');
insert into public.meal_items (meal_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g) values
  ('aaaaaaaa-1000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'Arroz blanco cocido', 200, 260, 5.4, 56.4, 0.6);
insert into public.weight_logs (measured_on, weight_kg) values ('2026-10-14', 80.4);
insert into public.foods (id, owner_id, name_es, source, kcal_100g, protein_g, carbs_g, fat_g) values
  ('aaaaaaaa-1000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'Batido de la casa', 'custom', 75, 6, 9, 1.5);
insert into public.ai_conversations (id) values ('aaaaaaaa-1000-0000-0000-000000000005');
insert into public.ai_messages (id, conversation_id, role, content) values
  ('aaaaaaaa-1000-0000-0000-000000000006', 'aaaaaaaa-1000-0000-0000-000000000005', 'assistant', 'Te propongo una tarea');
insert into public.ai_action_proposals (message_id, action_type, payload) values
  ('aaaaaaaa-1000-0000-0000-000000000006', 'create_task', '{"title":"Estudiar"}');
insert into public.user_achievements (code) values ('first_workout');

select tests.assert(
  (select count(*) from public.exercises) = (select count(*) from public.exercises where owner_id is null),
  'Carla ve el catálogo global');
select tests.assert(
  (select name_es from public.search_foods('platano') limit 1) = 'Plátano de seda',
  'buscar "platano" sin tilde encuentra "Plátano de seda"');
select tests.assert(
  (select name_es from public.search_foods('arros') limit 1) = 'Arroz blanco cocido',
  'la búsqueda tolera errores de tipeo');
select tests.assert(
  (select (my_progress_counts() ->> 'workouts')::int) = 1 and (select (my_progress_counts() ->> 'meals')::int) = 1,
  'los contadores de progreso cuentan solo lo de Carla');

update public.foods set kcal_100g = 1 where id = 'ffffffff-0000-0000-0000-000000000001';
delete from public.foods where id = 'ffffffff-0000-0000-0000-000000000001';
select tests.assert(
  (select kcal_100g from public.foods where id = 'ffffffff-0000-0000-0000-000000000001') = 130,
  'nadie puede editar ni borrar un alimento global');
select tests.assert_fails(
  $$insert into public.foods (name_es, source, kcal_100g, protein_g, carbs_g, fat_g) values ('Falso', 'usda', 1, 1, 1, 1)$$,
  'un usuario no puede crear alimentos "globales"');

-- Límites de seguridad
select tests.assert_fails(
  $$insert into public.fitness_profiles (goal, experience, days_per_week, minutes_per_session) values ('general','beginner',7,30)$$,
  'no se permiten 7 días de entrenamiento (mínimo 1 de descanso)');
select tests.assert_fails(
  $$insert into public.nutrition_goals (sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g) values ('male', 1800, 1400, 150, 100, 50)$$,
  'rechaza menos de 1500 kcal para hombres');
select tests.assert_fails(
  $$insert into public.nutrition_goals (sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g) values ('male', 2600, 1900, 150, 180, 60)$$,
  'rechaza un déficit mayor al 25 %');
select tests.assert_fails(
  $$insert into public.nutrition_goals (sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g) values ('female', 1500, 1150, 90, 120, 40)$$,
  'rechaza menos de 1200 kcal para mujeres');
select tests.assert_fails(
  $$insert into public.nutrition_goals (sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g, valid_from) values ('male', 2600, 3200, 150, 400, 90, '2026-01-01')$$,
  'rechaza un superávit mayor al 20 %');
insert into public.nutrition_goals (sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g) values ('male', 2600, 2100, 160, 220, 65);
select tests.assert((select count(*) from public.nutrition_goals) = 1, 'acepta un déficit moderado');

-- Cuota diaria de IA
select tests.assert(public.consume_ai_quota('vision', 2), 'primer análisis dentro del límite');
select tests.assert(public.consume_ai_quota('vision', 2), 'segundo análisis dentro del límite');
select tests.assert(not public.consume_ai_quota('vision', 2), 'el tercero supera el límite diario');
select tests.assert(public.consume_ai_quota('chat', 2), 'el chat tiene su propio contador');
select tests.assert_fails(
  $$update public.ai_usage set vision_count = 0$$,
  'el usuario no puede reiniciar su contador de IA (sin permiso de escritura)');
select tests.assert_fails(
  $$insert into public.ai_usage (user_id, day) values ('33333333-3333-3333-3333-333333333333', '2030-01-01')$$,
  'el usuario no puede crear filas de uso de IA');
select tests.assert_fails(
  $$select public.consume_ai_quota('vision; drop table x', 2)$$,
  'consume_ai_quota rechaza tipos desconocidos');

-- Storage: solo su carpeta
insert into storage.objects (bucket_id, name) values ('food-photos', '33333333-3333-3333-3333-333333333333/a.jpg');
select tests.assert_fails(
  $$insert into storage.objects (bucket_id, name) values ('food-photos', '44444444-4444-4444-4444-444444444444/x.jpg')$$,
  'Carla no puede subir fotos a la carpeta de Diego');
commit;
select tests.logout();

-- ---------------------------------------------------------------- Diego no ve nada de Carla
begin;
select tests.login_as('44444444-4444-4444-4444-444444444444');
insert into storage.objects (bucket_id, name) values ('food-photos', '44444444-4444-4444-4444-444444444444/b.jpg');

select tests.assert(
  (select count(*) from public.workout_plans) + (select count(*) from public.workout_sessions)
  + (select count(*) from public.set_logs) + (select count(*) from public.plan_exercises)
  + (select count(*) from public.meals) + (select count(*) from public.meal_items)
  + (select count(*) from public.weight_logs) + (select count(*) from public.nutrition_goals)
  + (select count(*) from public.fitness_profiles) + (select count(*) from public.ai_conversations)
  + (select count(*) from public.ai_messages) + (select count(*) from public.ai_action_proposals)
  + (select count(*) from public.ai_usage) + (select count(*) from public.user_achievements) = 0,
  'Diego no ve ninguna fila de entrenamiento, nutrición ni IA de Carla');
select tests.assert(
  (select count(*) from public.foods where owner_id is not null) = 0,
  'Diego no ve los alimentos propios de Carla');
select tests.assert(
  (select count(*) from storage.objects) = 1,
  'Diego solo ve sus propias fotos');
select tests.assert(
  (select count(*) from public.privacy_settings) = 1,
  'Diego solo ve sus propios ajustes de privacidad');

select tests.assert_fails(
  $$insert into public.plan_exercises (plan_id, day_index, exercise_id, sets, reps_min, reps_max)
    values ('aaaaaaaa-1000-0000-0000-000000000001', 1, 'eeeeeeee-0000-0000-0000-000000000001', 3, 8, 10)$$,
  'Diego no puede agregar ejercicios a la rutina de Carla');
select tests.assert_fails(
  $$insert into public.meal_items (meal_id, name, grams, kcal, protein_g, carbs_g, fat_g)
    values ('aaaaaaaa-1000-0000-0000-000000000003', 'x', 10, 1, 0, 0, 0)$$,
  'Diego no puede agregar alimentos a la comida de Carla');
select tests.assert_fails(
  $$insert into public.ai_messages (conversation_id, role, content)
    values ('aaaaaaaa-1000-0000-0000-000000000005', 'user', 'hola')$$,
  'Diego no puede escribir en la conversación de Carla');

update public.privacy_settings set ai_use_nutrition = false;
select tests.assert(
  (select ai_use_nutrition from public.privacy_settings) = false,
  'Diego puede cambiar su privacidad');
commit;
select tests.logout();

-- ---------------------------------------------------------------- anónimo
begin;
select tests.login_as_anon();
select tests.assert_fails($$select count(*) from public.foods$$, 'anónimo no lee alimentos');
select tests.assert_fails($$select count(*) from public.meals$$, 'anónimo no lee comidas');
select tests.assert_fails($$select public.delete_my_account()$$, 'anónimo no puede borrar cuentas');
select tests.assert_fails($$select public.consume_ai_quota('chat', 10)$$, 'anónimo no consume IA');
commit;
select tests.logout();

-- ---------------------------------------------------------------- todas las tablas con RLS
select tests.assert(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0,
  'todas las tablas públicas tienen RLS activado');
select tests.assert(
  (select count(*) from pg_tables t
    where t.schemaname = 'public'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)) = 0,
  'todas las tablas públicas tienen al menos una política');

-- ---------------------------------------------------------------- borrar cuenta
begin;
select tests.login_as('44444444-4444-4444-4444-444444444444');
select public.delete_my_account();
commit;
select tests.logout();

select tests.assert(
  not exists (select 1 from auth.users where id = '44444444-4444-4444-4444-444444444444'),
  'borrar cuenta elimina al usuario');
select tests.assert(
  not exists (select 1 from public.privacy_settings where user_id = '44444444-4444-4444-4444-444444444444')
  and not exists (select 1 from public.profiles where user_id = '44444444-4444-4444-4444-444444444444'),
  'y en cascada todos sus datos');
select tests.assert(
  exists (select 1 from public.meals where user_id = '33333333-3333-3333-3333-333333333333'),
  'los datos de Carla siguen intactos');
