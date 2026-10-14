type Scheduled = { identifier: string; content: { title: string; body: string; data: { url: string } }; trigger: { date: Date; channelId: string } };

type Store = { scheduled: Map<string, Scheduled>; state: { granted: boolean; canAskAgain: boolean } };

/** Avisos que la app dejó programados en el "teléfono" falso de las pruebas. */
export function scheduledNotifications(): Scheduled[] {
  return [...((globalThis as { __notifications?: Store }).__notifications?.scheduled.values() ?? [])];
}

export function setNotificationPermission(granted: boolean, canAskAgain = true) {
  const s = (globalThis as { __notifications?: Store }).__notifications!.state;
  s.granted = granted;
  s.canAskAgain = canAskAgain;
}
