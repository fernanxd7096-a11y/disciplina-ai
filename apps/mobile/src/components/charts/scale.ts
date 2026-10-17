/** Escala lineal y marcas "redondas" para ejes (funciones puras, probadas). */

export function niceStep(range: number, ticks = 4): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/** Dominio [min, max] con margen y marcas, incluyendo opcionalmente 0 o una meta. */
export function domain(values: number[], opts: { includeZero?: boolean; extra?: number[] } = {}) {
  const all = [...values, ...(opts.extra ?? [])].filter(Number.isFinite);
  if (!all.length) return { min: 0, max: 1, ticks: [0, 1] };
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (opts.includeZero) min = Math.min(0, min);
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min: lo, max: hi, ticks };
}

export const scale = (v: number, d0: number, d1: number, r0: number, r1: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

export function formatTick(v: number) {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
