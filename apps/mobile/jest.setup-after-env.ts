import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure } from '@testing-library/react-native';

// En CI (sin caché y con pocos núcleos) la primera carga de rutas es lenta:
// se espera hasta 5 s a que aparezca un elemento antes de dar la prueba por fallida.
configure({ asyncUtilTimeout: 5000 });

// Se ejecuta con el entorno de pruebas ya cargado (beforeEach disponible).
beforeEach(() => {
  const n = (globalThis as { __notifications?: { scheduled: Map<string, unknown>; state: { granted: boolean; canAskAgain: boolean } } }).__notifications;
  n?.scheduled.clear();
  if (n) {
    n.state.granted = true;
    n.state.canAskAgain = true;
  }
});

// Cada prueba empieza con red y caché limpias.
afterEach(async () => {
  const net = (globalThis as { __net?: { state: { isConnected: boolean; isInternetReachable: boolean }; listeners: Set<(s: unknown) => void> } }).__net;
  if (net) {
    net.state = { isConnected: true, isInternetReachable: true };
    net.listeners.forEach((l) => l(net.state));
  }
  await AsyncStorage.clear();
});
