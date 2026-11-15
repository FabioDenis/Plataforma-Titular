// Fixed-window rate limiter kept in process memory. It is accurate only while the API runs as a
// single instance (Cloud Run --max-instances 1); a shared store is required before scaling out.

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const MAX_TRACKED_KEYS = 10000;

export function createRateLimiter(options: { windowMs: number; max: number; now?: () => number }) {
  const now = options.now || Date.now;
  const windows = new Map<string, { startedAt: number; count: number }>();
  // Which window each allowed decision was charged to, so a late release never touches a newer one.
  const chargedWindow = new WeakMap<RateLimitDecision, { startedAt: number; count: number }>();

  function consume(key: string): RateLimitDecision {
    const current = now();
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [trackedKey, window] of windows) {
        if (current - window.startedAt >= options.windowMs) windows.delete(trackedKey);
      }
    }

    let window = windows.get(key);
    if (!window || current - window.startedAt >= options.windowMs) {
      window = { startedAt: current, count: 0 };
      windows.set(key, window);
    }
    if (window.count >= options.max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((window.startedAt + options.windowMs - current) / 1000) };
    }
    window.count += 1;
    const decision = { allowed: true, retryAfterSeconds: 0 };
    chargedWindow.set(decision, window);
    return decision;
  }

  /**
   * Gives back the use charged by `decision`, for attempts that should not count. It does nothing
   * if that window already ended, and gives back each decision at most once.
   */
  function release(key: string, decision: RateLimitDecision): void {
    const window = chargedWindow.get(decision);
    chargedWindow.delete(decision);
    if (window && windows.get(key) === window && window.count > 0) window.count -= 1;
  }

  return Object.assign(consume, { release });
}
