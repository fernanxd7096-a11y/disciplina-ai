/**
 * En qué fase se activa cada función. Las pantallas lo usan para mostrar
 * estados vacíos honestos en vez de datos de demostración.
 * Actualizar cuando una función quede implementada y probada.
 */
export const featurePhase = {
  auth: 3,
  habits: 3,
  notes: 3,
  tasks: 3,
  calendar: 3,
  reminders: 3,
  training: 4,
  nutrition: 4,
  foodPhoto: 4,
  assistant: 5,
  stats: 6,
  achievements: 6,
} as const;

export type Feature = keyof typeof featurePhase;

export function phaseNotice(feature: Feature): string {
  return `Se activa en la Fase ${featurePhase[feature]} del desarrollo.`;
}
