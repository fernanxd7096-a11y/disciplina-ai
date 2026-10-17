-- =====================================================================
-- DISCIPLINA AI · Migración 0004 · Reglas del porcentaje de disciplina
-- Qué componentes cuentan (configurable por el usuario en Ajustes).
-- =====================================================================

alter table public.profiles
  add column discipline_config jsonb not null default '{"habits": true, "tasks": true, "training": true}'::jsonb
    check (
      jsonb_typeof(discipline_config) = 'object'
      and discipline_config ?& array['habits', 'tasks', 'training']
      and jsonb_typeof(discipline_config -> 'habits') = 'boolean'
      and jsonb_typeof(discipline_config -> 'tasks') = 'boolean'
      and jsonb_typeof(discipline_config -> 'training') = 'boolean'
    );
