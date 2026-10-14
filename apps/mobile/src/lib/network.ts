import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

let wired = false;

/**
 * Conecta React Query con el estado real de la red del teléfono:
 * sin conexión, las consultas usan la caché y los cambios esperan;
 * al volver la conexión, se reintentan solos.
 */
export function wireOnlineManager() {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable puede ser null mientras se comprueba: no se marca offline por eso.
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    }),
  );
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

export const OFFLINE_SAVE_MESSAGE = 'Sin conexión. Conéctate a internet para guardar esto.';
