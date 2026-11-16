import { RefObject, useLayoutEffect, useState } from 'react';
import { findFittingScale, FitOptions } from '../utils/fitText';

const SCALE_VARIABLE = '--fit-scale';

/**
 * Shrinks a line-clamped text block until it fits its line limit, so the card never cuts a
 * headline with an ellipsis. The element must size its font with `calc(<size> * var(--fit-scale, 1))`.
 * Re-measures when `deps` change, when web fonts finish loading and when the card is resized.
 */
export function useFitScale(ref: RefObject<HTMLElement>, deps: unknown[], options?: FitOptions): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      const next = findFittingScale((candidate) => {
        element.style.setProperty(SCALE_VARIABLE, String(candidate));
        return element.scrollHeight > element.clientHeight + 1;
      }, options);
      element.style.setProperty(SCALE_VARIABLE, String(next));
      setScale(next);
    };

    fit();
    document.fonts?.ready.then(fit).catch(() => undefined);
    // A web font that finishes loading later changes the text width.
    document.fonts?.addEventListener?.('loadingdone', fit);
    // Font sizes use cqi units, which follow the viewport when no container is declared,
    // so the text can grow on a window resize even when the card keeps its width.
    window.addEventListener('resize', fit);

    // Watch the card, not the text: the text's own height changes while fitting.
    const card = element.closest('#hermes-card-canvas') || element.parentElement;
    let lastWidth = card?.clientWidth;
    const observer =
      card && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (card.clientWidth === lastWidth) return;
            lastWidth = card.clientWidth;
            fit();
          })
        : null;
    if (card) observer?.observe(card);

    return () => {
      cancelled = true;
      document.fonts?.removeEventListener?.('loadingdone', fit);
      window.removeEventListener('resize', fit);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return scale;
}
