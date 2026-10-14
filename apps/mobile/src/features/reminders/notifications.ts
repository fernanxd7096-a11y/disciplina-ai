/**
 * Puente con expo-notifications: canales, permisos y aplicación del plan.
 * La decisión de QUÉ avisar está en plan.ts (puro y probado); aquí solo se ejecuta.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { reconcile, type Channel, type PlannedNotification } from './plan';

const channels: Record<Channel, { name: string; description: string }> = {
  events: { name: 'Eventos', description: 'Avisos antes de tus eventos del calendario' },
  tasks: { name: 'Tareas', description: 'Avisos antes de la fecha límite de tus tareas' },
  habits: { name: 'Hábitos', description: 'Recordatorios diarios de tus hábitos' },
};

let configured = false;

/** Una sola vez al arrancar: cómo se muestran los avisos con la app abierta y los canales de Android. */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Promise.all(
      (Object.keys(channels) as Channel[]).map((id) =>
        Notifications.setNotificationChannelAsync(id, {
          name: channels[id].name,
          description: channels[id].description,
          importance: id === 'events' ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 200, 120, 200],
          lightColor: '#22D3EE',
        }),
      ),
    );
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<PermissionState> {
  const p = await Notifications.requestPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Aplica el plan: cancela lo obsoleto y programa lo nuevo.
 * Devuelve cuántos avisos quedaron programados por esta app.
 */
export async function applyPlan(desired: PlannedNotification[]): Promise<{ scheduled: number; cancelled: number; added: number }> {
  const current = await Notifications.getAllScheduledNotificationsAsync();
  const { cancel, schedule } = reconcile(
    desired,
    current.map((n) => n.identifier),
  );
  for (const id of cancel) await Notifications.cancelScheduledNotificationAsync(id);
  for (const n of schedule) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: { url: n.url }, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.fireAt, channelId: n.channel },
    });
  }
  return { scheduled: desired.length, cancelled: cancel.length, added: schedule.length };
}

/** Al cerrar sesión: no deben quedar avisos de la cuenta anterior. */
export async function cancelAllOurs(): Promise<void> {
  const current = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(current.filter((n) => n.identifier.startsWith('dai:')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}
