import { progressPercent, progressRatio, ringGeometry } from '../progress';

describe('progressRatio', () => {
  it('calcula la proporción y la limita a [0, 1]', () => {
    expect(progressRatio(3, 4)).toBe(0.75);
    expect(progressRatio(5, 4)).toBe(1);
    expect(progressRatio(-1, 4)).toBe(0);
  });

  it('devuelve 0 cuando no hay total (nunca inventa progreso)', () => {
    expect(progressRatio(0, 0)).toBe(0);
    expect(progressRatio(3, 0)).toBe(0);
    expect(progressRatio(NaN, 4)).toBe(0);
    expect(progressRatio(2, Infinity)).toBe(0);
  });
});

describe('progressPercent', () => {
  it('redondea a entero', () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
  });
});

describe('ringGeometry', () => {
  it('desplaza el trazo según el progreso', () => {
    const empty = ringGeometry(100, 10, 0);
    const half = ringGeometry(100, 10, 0.5);
    const full = ringGeometry(100, 10, 1);
    expect(empty.r).toBe(45);
    expect(empty.dashOffset).toBeCloseTo(empty.circumference);
    expect(half.dashOffset).toBeCloseTo(half.circumference / 2);
    expect(full.dashOffset).toBeCloseTo(0);
  });
});
