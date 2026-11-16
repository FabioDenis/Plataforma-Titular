export interface FitOptions {
  /** Smallest scale allowed; at this scale the text is kept even if it still overflows. */
  min?: number;
  /** Amount the scale drops on each attempt. */
  step?: number;
}

/**
 * Returns the largest scale, from 1 down to `min` in `step` decrements, at which the text
 * stops overflowing. `overflowsAt` applies the scale and reports whether the text still overflows.
 */
export function findFittingScale(overflowsAt: (scale: number) => boolean, { min = 0.6, step = 0.04 }: FitOptions = {}): number {
  if (!(step > 0)) throw new RangeError('step must be greater than 0');
  for (let i = 0; ; i += 1) {
    const scale = Math.round((1 - i * step) * 1000) / 1000;
    if (scale <= min) {
      overflowsAt(min);
      return min;
    }
    if (!overflowsAt(scale)) return scale;
  }
}
