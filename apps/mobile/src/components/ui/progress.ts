/** Lógica pura de los indicadores de progreso (probada por separado del render). */

/** Normaliza un valor a [0, 1]. NaN, infinitos o totales ≤ 0 devuelven 0. */
export function progressRatio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

/** Porcentaje entero 0–100 para mostrar al usuario. */
export function progressPercent(value: number, total: number): number {
  return Math.round(progressRatio(value, total) * 100);
}

/** Geometría del anillo SVG: circunferencia y desplazamiento del trazo. */
export function ringGeometry(size: number, strokeWidth: number, ratio: number) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, ratio));
  return { r, circumference, dashOffset: circumference * (1 - clamped) };
}
