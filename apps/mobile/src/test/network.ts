import { act } from 'expo-router/testing-library';

type Net = { state: { isConnected: boolean; isInternetReachable: boolean }; listeners: Set<(s: Net['state']) => void> };

/** Conecta o desconecta la red falsa y notifica a la app. */
export async function setNetwork(online: boolean) {
  const net = (globalThis as { __net?: Net }).__net!;
  net.state = { isConnected: online, isInternetReachable: online };
  await act(async () => {
    net.listeners.forEach((l) => l(net.state));
  });
}
