/**
 * Configuración pública de la app (variables EXPO_PUBLIC_*).
 * Solo contiene valores que pueden estar en el APK: la URL del proyecto
 * y la clave publicable de Supabase. Nunca claves de IA ni service_role.
 */

export type PublicEnv = {
  supabaseUrl: string;
  supabaseKey: string;
};

export function readPublicEnv(source: Record<string, string | undefined> = process.env): PublicEnv | null {
  // Expo solo inyecta variables EXPO_PUBLIC_* leídas literalmente, por eso
  // el valor por defecto usa process.env.EXPO_PUBLIC_... de forma explícita.
  const url = source.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = (source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? source.EXPO_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    return null;
  }
  return { supabaseUrl: url, supabaseKey: key };
}

export const publicEnv = readPublicEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
