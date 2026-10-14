import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

/** Clave de la caché local en el almacenamiento privado de la app. */
export const QUERY_CACHE_KEY = 'disciplina.cache';

/**
 * Caché local en el teléfono: la app abre con tus datos aunque no haya
 * internet. Se guarda en el almacenamiento privado de la app (sin copia de
 * seguridad en la nube: android.allowBackup = false) y se borra al cerrar sesión.
 * Una instancia por árbol de proveedores (el persistidor guarda estado interno).
 */
export function createQueryPersister() {
  return createAsyncStoragePersister({ storage: AsyncStorage, key: QUERY_CACHE_KEY, throttleTime: 1000 });
}

/** Borra la caché guardada (al cerrar sesión). */
export function clearPersistedCache(): Promise<void> {
  return AsyncStorage.removeItem(QUERY_CACHE_KEY);
}
