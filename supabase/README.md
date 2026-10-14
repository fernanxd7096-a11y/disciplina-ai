# Supabase

Backend de DISCIPLINA AI: Auth, Postgres con RLS, Storage y Edge Functions.

Se completa en la **Fase 3** (migraciones, políticas RLS y pruebas pgTAP).

## Crear el proyecto (lo haces tú una sola vez)

1. Entra a <https://supabase.com/dashboard> y crea un proyecto nuevo (plan gratuito). Región sugerida: la más cercana a Lima disponible.
2. Guarda la contraseña de la base de datos en un gestor de contraseñas.
3. En **Project Settings → API** copia la *Project URL* y la clave *anon public* a `apps/mobile/.env` (ver `.env.example`).
4. No compartas la clave `service_role` con nadie ni la pongas en la app.

## Estructura prevista

```text
supabase/
├─ migrations/     # SQL versionado (tablas, índices, RLS)
├─ seed.sql        # catálogo de ejercicios y alimentos base
├─ tests/          # pgTAP: un usuario nunca ve datos de otro
└─ functions/      # Edge Functions (IA, aplicar acciones, limpieza de fotos)
```
