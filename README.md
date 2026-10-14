# DISCIPLINA AI

Asistente personal de disciplina, organización, entrenamiento y nutrición. App Android (con arquitectura lista para iOS) hecha con Expo + Supabase.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Arquitectura, modelo de datos, plan | ✅ Hecha |
| 2 | Proyecto, navegación, sistema visual, pantallas, pruebas, CI | ✅ Hecha |
| 3 | Auth, hábitos, notas, tareas, calendario, recordatorios, offline | ✅ Código hecho · falta aplicar la base en Supabase y probar en un teléfono |
| 4 | Entrenamiento y nutrición (incluye análisis de fotos) | Pendiente |
| 5 | Asistente de IA con herramientas controladas | Pendiente |
| 6 | Estadísticas, logros, ajustes, compilación final | Pendiente |

**Qué funciona hoy (probado con 145 pruebas de app y 45 de base de datos):**

- Cuenta: registro, inicio de sesión, recuperar contraseña; sesión cifrada en el teléfono.
- Hábitos: crear (con plantillas), días o veces por semana, contadores, rachas, días de descanso, pausar, historial editable, aviso diario.
- Tareas: prioridad, fecha límite, atrasadas, mover a hoy, completar.
- Notas: guardado automático, búsqueda, fijar, archivar.
- Calendario: mes/semana/día, eventos con avisos (al empezar, 15 min, 1 h, 1 día u hora exacta), sin duplicados.
- Inicio: progreso real del día, próximo evento con tiempo restante, tareas de hoy.
- Sin conexión: ves tus datos; marcar hábitos y completar tareas se envía al reconectar.

Entrenamiento, nutrición, asistente IA y estadísticas muestran en qué fase se activan. No hay datos de demostración.

## Requisitos

- Node.js 20 o superior (probado con 22)
- pnpm 10 (`npm install -g pnpm`)
- Un teléfono Android con la app **Expo Go**, o Android Studio con un emulador

## Ejecutar en desarrollo

```bash
pnpm install
cd apps/mobile
cp .env.example .env      # pega tu "Publishable key" de Supabase (Project Settings → API Keys)
pnpm start                # escanea el QR con Expo Go
```

### Base de datos (una sola vez)

Aplica `supabase/migrations/*.sql` en tu proyecto: en el panel de Supabase abre **SQL Editor**, pega el contenido del archivo y pulsa **Run**. O con la CLI: `npx supabase link --project-ref <ref>` y `npx supabase db push`.

Pruebas de la base (necesitan PostgreSQL instalado): `bash supabase/tests/run.sh`.

## Comandos

Desde `apps/mobile`:

| Comando | Qué hace |
| --- | --- |
| `pnpm start` | Servidor de desarrollo |
| `pnpm android` | Abre en un emulador/dispositivo Android |
| `pnpm test` | Pruebas (Jest + Testing Library) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript sin emitir |
| `npx expo export --platform android` | Verifica que la app compila para Android |

## Compilar un APK instalable

```bash
npm install -g eas-cli
eas login
cd apps/mobile
eas build --platform android --profile preview   # genera un APK para instalar directo
```

El perfil `production` genera un `.aab` para Google Play.

## Estructura

```text
disciplina-ai/
├─ apps/mobile/
│  ├─ src/app/            # rutas (Expo Router) — solo componen pantallas
│  ├─ src/features/       # un módulo por dominio (dashboard, planner, settings…)
│  ├─ src/components/ui/  # componentes reutilizables
│  ├─ src/theme/          # tokens de diseño (colores, espaciado, tipografía)
│  ├─ src/lib/            # utilidades puras (fechas, roadmap)
│  └─ src/hooks/
├─ packages/shared/       # tipos y esquemas compartidos (Fase 3)
├─ supabase/              # migraciones, RLS, Edge Functions (Fase 3+)
└─ docs/adr/              # decisiones de arquitectura
```

## Seguridad

- La app solo conocerá la URL pública de Supabase y la clave `anon`.
- Las claves de IA y la `service_role` vivirán como secretos de las Edge Functions, nunca en la app ni en el repositorio.
- `.env` está en `.gitignore`.
