# DISCIPLINA AI

Asistente personal de disciplina, organización, entrenamiento y nutrición. App Android (con arquitectura lista para iOS) hecha con Expo + Supabase, con IA a través de un servidor seguro.

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Arquitectura, modelo de datos, plan | ✅ Hecha |
| 2 | Proyecto, navegación, sistema visual, pantallas, pruebas, CI | ✅ Hecha |
| 3 | Auth, hábitos, notas, tareas, calendario, recordatorios, offline, categorías/etiquetas, vínculos, eventos recurrentes | ✅ Hecha |
| 4 | Entrenamiento y nutrición (incluye análisis de fotos) | ✅ Hecha |
| 5 | Asistente de IA con herramientas controladas | ✅ Hecha |
| 6 | Estadísticas, logros, ajustes, privacidad, exportar/borrar cuenta | ✅ Hecha |

Base de datos y Edge Functions aplicadas en Supabase (16 oct 2026). Para usar la IA falta poner la clave de Gemini (ver abajo).

**Pruebas:** 216 de la app (Jest + Testing Library), 89 de la base (Postgres real) y 25 de las Edge Functions (Deno). Todas en CI.

## Qué hace

- **Inicio:** saludo, progreso real del día, disciplina y nivel, próximo evento, tareas de hoy, entrenamiento y nutrición del día, creación rápida y acceso al asistente.
- **Hábitos:** días o veces por semana, contadores, rachas, descansos, pausar, historial, aviso diario.
- **Agenda:** tareas con prioridad, fecha y avisos; notas con autoguardado, búsqueda, categorías, etiquetas y vínculo a tareas/eventos; calendario mes/semana/día con eventos recurrentes y avisos sin duplicados.
- **Entrenamiento:** perfil físico, rutina base (reglas) o con IA validada, técnica paso a paso, errores frecuentes, alternativas por nivel, calentamiento y vuelta a la calma, registro de series y pesos, progresión sugerida, evolución (1RM estimado) e historial.
- **Nutrición:** objetivo Mifflin-St Jeor con límites seguros, diario manual con buscador (USDA) y alimentos propios, **foto de comida** con alimentos, gramos (rango), confianza y advertencias, todo editable antes de guardar; sugerencias económicas; peso con gráfica y tendencia.
- **Asistente IA:** chat con historial borrable, usa solo los datos que permitas, propone acciones (crear/reprogramar/completar) que tú confirmas.
- **Estadísticas:** 7/30/90 días; hábitos, tiempo dedicado, tareas, entrenamiento, nutrición y peso; comparativa con el periodo anterior; XP, niveles y 19 logros; etiqueta de origen de cada dato (registrado, calculado, estimación IA).
- **Ajustes:** perfil, región, notificaciones, reglas de disciplina, privacidad de la IA, conservar o no fotos, exportar todo en JSON, borrar la cuenta.

## Requisitos

- Node.js 20 o superior (probado con 22) y pnpm (`npm install -g pnpm`)
- Un teléfono Android (APK con EAS) o Android Studio con un emulador

## Ejecutar en desarrollo

```bash
pnpm install
cd apps/mobile
cp .env.example .env      # pega tu "Publishable key" de Supabase (Project Settings → API Keys)
pnpm start
```

## Activar la IA (Gemini)

1. Crea una clave en <https://aistudio.google.com/apikey> (con tu cuenta de Google).
2. En Supabase: **Edge Functions → Secrets → Add new secret**: nombre `GEMINI_API_KEY`, valor tu clave.
3. Listo: fotos de comida, rutina con IA y asistente empiezan a funcionar. No hace falta recompilar la app.

La clave vive solo en el servidor. Límites diarios por usuario y otros ajustes: ver [`supabase/README.md`](supabase/README.md).

## Compilar el APK

```bash
cd apps/mobile
npx eas-cli@latest build -p android --profile preview
```

Las variables `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ya están en EAS (entorno *preview*). La compilación se detiene si alguien pone una clave secreta.

## Comandos

Desde `apps/mobile`:

| Comando | Qué hace |
| --- | --- |
| `pnpm start` | Servidor de desarrollo |
| `pnpm test` | Pruebas de la app |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `npx expo export --platform android` | Verifica que la app empaqueta para Android |

Desde la raíz: `bash supabase/tests/run.sh` (base de datos) y `cd supabase/functions && deno test --allow-env` (funciones).

## Estructura

```text
disciplina-ai/
├─ apps/mobile/
│  ├─ src/app/            # rutas (Expo Router), solo componen pantallas
│  ├─ src/features/       # un módulo por dominio: habits, tasks, notes, events, reminders,
│  │                      # training, nutrition, assistant, progress, organize, settings…
│  ├─ src/components/     # ui/ (botones, tarjetas…) y charts/ (líneas y barras SVG)
│  ├─ src/lib/            # fechas, red, IA (cliente), fotos, validación
│  └─ src/test/           # Supabase falso con RLS simulada, mocks y catálogo real
├─ supabase/              # migraciones, semilla, pruebas y Edge Functions
└─ docs/adr/              # decisiones de arquitectura (0001, 0002)
```

## Seguridad y privacidad

- La app solo conoce la URL pública y la clave publicable. La clave de IA vive como secreto de las Edge Functions.
- RLS en todas las tablas (31): cada usuario solo ve lo suyo; el anónimo no ve nada.
- La IA usa la sesión del usuario (nunca `service_role`), solo con los datos que el usuario permite, y no puede escribir: propone y el usuario confirma.
- Fotos en carpeta privada por usuario; se borran tras el análisis por defecto.
- Objetivos calóricos con mínimos y márgenes impuestos también en la base de datos. El asistente no propone ejercicio para "compensar" comidas.
- Exportación completa en JSON y borrado de cuenta (datos y fotos).
