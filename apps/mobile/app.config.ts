import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extiende app.json con una sola comprobación de seguridad: si la clave de
 * Supabase es de administrador, la compilación se detiene. Las variables
 * EXPO_PUBLIC_* quedan dentro del APK y cualquiera podría extraerlas.
 * (Misma regla que isSecretKey en src/lib/env.ts; el cargador de configuración
 * de Expo no resuelve imports de otros archivos .ts.)
 */
function isSecretKey(key: string): boolean {
  const k = key.trim();
  if (k.startsWith('sb_secret_')) return true;
  const payload = k.split('.')[1];
  if (!k.startsWith('eyJ') || !payload) return false;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return (JSON.parse(atob(b64)) as { role?: unknown }).role === 'service_role';
  } catch {
    return false;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (isSecretKey(key)) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY contiene una clave SECRETA de Supabase. ' +
        'Usa la "Publishable key" (empieza con sb_publishable_) y anula la secreta en el panel.',
    );
  }
  return config as ExpoConfig;
};
