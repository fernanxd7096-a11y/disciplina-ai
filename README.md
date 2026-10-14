# DISCIPLINA AI

Asistente personal de disciplina, organización, entrenamiento y nutrición. App Android (con arquitectura lista para iOS) hecha con Expo + Supabase.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Arquitectura, modelo de datos, plan | ✅ Hecha |
| 2 | Proyecto, navegación, sistema visual, pantallas, pruebas, CI | ✅ Hecha |
| 3 | Auth, hábitos, notas, tareas, calendario, recordatorios, offline | ⏳ Siguiente |
| 4 | Entrenamiento y nutrición (incluye análisis de fotos) | Pendiente |
| 5 | Asistente de IA con herramientas controladas | Pendiente |
| 6 | Estadísticas, logros, ajustes, compilación final | Pendiente |

**Qué funciona hoy:** navegación entre las 5 pestañas y las pantallas de Asistente, Estadísticas y Ajustes; saludo y fecha reales según tu zona horaria; selector Tareas/Notas/Calendario. Las pantallas de módulos aún no implementados muestran un estado vacío que indica en qué fase se activan. **No hay datos de demostración**: nada de lo que ves es inventado.

## Requisitos

- Node.js 20 o superior (probado con 22)
- pnpm 10 (`npm install -g pnpm`)
- Un teléfono Android con la app **Expo Go**, o Android Studio con un emulador

## Ejecutar en desarrollo

```bash
pnpm install
cd apps/mobile
cp .env.example .env      # se completa en la Fase 3
pnpm start                # escanea el QR con Expo Go
```

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
