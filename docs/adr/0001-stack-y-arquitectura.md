# ADR 0001 — Stack y arquitectura

- Estado: aceptada
- Fecha: 2026-10-13

## Decisión

| # | Decisión |
| --- | --- |
| D1 | Expo **SDK 57** (React Native 0.86, React 19.2) + Expo Router + TypeScript estricto. Rutas en `apps/mobile/src/app/`. |
| D2 | Supabase (plan gratuito) para Auth, Postgres con RLS, Storage y Edge Functions. |
| D3 | Toda llamada a IA pasa por Edge Functions; la app nunca contiene claves privadas. |
| D4 | Interfaz `AIProvider` con adaptadores (Anthropic, OpenAI, Gemini, Ollama, mock). |
| D5 | Caché local con SQLite + cola de sincronización (offline-first). |
| D6 | Notificaciones locales con un reconciliador; push solo después del MVP. |
| D7 | Macros desde base nutricional (USDA + tabla peruana); la IA solo identifica y estima porciones. |
| D8 | Las escrituras del asistente son propuestas que el usuario confirma. |
| D9 | Monorepo pnpm: `apps/mobile`, `packages/shared`, `supabase/`. |

El documento completo de la Fase 1 (modelo de datos, seguridad, riesgos, costos) está en Claude Docs: «DISCIPLINA AI — Fase 1: Arquitectura y plan».

## Ajustes respecto al plan original (Fase 2)

- **SDK 57 en lugar de 56**: al crear el proyecto, la plantilla oficial ya era SDK 57. Se usa la versión estable vigente.
- **Pestañas JS (`expo-router/js-tabs`)** en lugar de pestañas nativas: control total del tema oscuro e iconos vectoriales sin PNG por pestaña.
- **Estilos con `StyleSheet` + tokens** (`src/theme/tokens.ts`) en lugar de NativeWind: menos dependencias y configuración; los tokens cumplen el mismo papel. Se puede revisar si el equipo crece.
- **@testing-library/react-native 13.x** (no 14): `expo-router/testing-library` está construido y probado contra la 13; la 14 cambió `render` a asíncrono y rompe `renderRouter`.
- **ESLint 9** (no 10): `eslint-plugin-react`, incluido en `eslint-config-expo`, aún no es compatible con ESLint 10.
- **pnpm con `node-linker=hoisted`**: la disposición de `node_modules` más compatible con Metro y React Native.
