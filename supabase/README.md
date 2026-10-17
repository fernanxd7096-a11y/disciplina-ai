# Supabase

Backend de DISCIPLINA AI: Auth, Postgres con RLS, Storage (fotos de comida) y Edge Functions (IA).

## Proyecto actual

- Nombre: `disciplina-ai` (organización *scorpio*, plan gratuito)
- URL: `https://nkrhqnaeahrvrmhwutxj.supabase.co`
- Data API activada; las tablas nuevas **no** se exponen solas (las migraciones hacen `GRANT` explícito).
- La app solo usa la **Publishable key** (`sb_publishable_…`). Las claves secretas nunca van en la app ni en el repositorio.

## Estructura

```text
supabase/
├─ migrations/        # SQL versionado (aplicar en orden)
│  ├─ 20261014000100_core_schema.sql            # Fase 3: hábitos, notas, tareas, calendario, avisos
│  ├─ 20261015000100_training_nutrition_ai.sql  # Fases 4–6: entreno, nutrición, IA, privacidad, Storage
│  ├─ 20261015000200_seed_catalog.sql           # GENERADO: 61 alimentos USDA + 48 ejercicios
│  └─ 20261016000100_discipline_config.sql      # reglas del % de disciplina
├─ seed/              # CSV fuente del catálogo + build.mjs (genera la migración y el fixture de pruebas)
├─ tests/             # Postgres real: RLS, límites de seguridad, cuotas, Storage, borrado de cuenta
└─ functions/         # Edge Functions (Deno)
   ├─ _shared/        # http, auth del usuario, proveedor de IA (Gemini y modo prueba)
   ├─ food-photo/     # foto → alimentos y porciones; macros desde la base
   ├─ workout-plan/   # rutina personalizada validada contra el catálogo y el equipo
   ├─ assistant-chat/ # chat con contexto según privacidad y propuestas confirmables
   └─ deploy/         # GENERADO por bundle.sh: un archivo por función para el editor del panel
```

## Aplicar migraciones

Panel → **SQL Editor** → pegar el archivo → **Run** (en orden). Con CLI: `npx supabase link --project-ref <ref>` y `npx supabase db push`.

Estado: las cuatro migraciones están aplicadas en el proyecto actual (16 oct 2026).

## Edge Functions

### Desplegar

- **Sin CLI (panel):** `bash supabase/functions/bundle.sh` y luego en Panel → Edge Functions → *Deploy a new function* → *Via Editor*: pega `deploy/<nombre>.js`, ponle el mismo nombre y despliega.
- **Con CLI:** `npx supabase functions deploy food-photo workout-plan assistant-chat --project-ref nkrhqnaeahrvrmhwutxj`

En cada función, **Settings → Verify JWT with legacy secret = OFF**: el código ya valida la sesión del usuario con `@supabase/server` (sin sesión responde 401). Así funciona con las claves JWT nuevas.

### Secretos (Panel → Edge Functions → Secrets)

| Nombre | Valor | Obligatorio |
| --- | --- | --- |
| `GEMINI_API_KEY` | Clave de Google AI Studio (<https://aistudio.google.com/apikey>) | Sí, para usar la IA |
| `GEMINI_MODEL` | Modelo (por defecto `gemini-3.6-flash`) | No |
| `AI_PROVIDER` | `gemini` (por defecto) o `mock` (respuestas fijas marcadas "Modo prueba") | No |
| `AI_DAILY_LIMIT_CHAT` / `_VISION` / `_PLAN` | Límite diario por usuario (por defecto 40 / 15 / 5) | No |

Sin `GEMINI_API_KEY` las funciones responden `ai_not_configured` y la app lo dice claramente; nada se simula.

### Probar

```bash
cd supabase/functions
deno test --allow-env   # 25 pruebas, IA simulada y sin red
deno check */index.ts
```

## Pruebas de la base

`bash supabase/tests/run.sh` levanta un Postgres temporal, aplica las migraciones y ejecuta 89 comprobaciones (aislamiento entre usuarios, anónimo sin acceso, límites de calorías, cuotas de IA, Storage por carpeta de usuario, borrado de cuenta en cascada).
