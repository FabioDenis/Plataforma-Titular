import { getOptionalNumberEnv } from './config/env';

/**
 * Newsroom lifecycle. Titular is sold at a flat fee and every newsroom shares one AI balance, so
 * the lifecycle (not a credit counter) decides who may generate:
 *  - draft:     created by the platform admin, identity and templates being prepared.
 *  - active:    the team works normally.
 *  - suspended: access paused (e.g. unpaid); data is kept.
 * Newsrooms created before the lifecycle existed carry status 'Activa' and count as active.
 */
export type OrganizationLifecycle = 'draft' | 'active' | 'suspended';

export const ORGANIZATION_LIFECYCLES: OrganizationLifecycle[] = ['draft', 'active', 'suspended'];

export function organizationLifecycle(data: { status?: unknown } | undefined | null): OrganizationLifecycle {
  const status = typeof data?.status === 'string' ? data.status.trim().toLowerCase() : '';
  if (status === 'draft') return 'draft';
  if (status === 'suspended' || status === 'suspendida') return 'suspended';
  return 'active';
}

export const DEFAULT_DAILY_GENERATION_CAP = 200;

/** Per-newsroom daily safety cap on posts; protects the shared AI balance from runaway use. */
export function dailyGenerationCap(data: { dailyGenerationCap?: unknown } | undefined | null): number {
  const override = Number(data?.dailyGenerationCap);
  if (Number.isFinite(override) && override > 0) return override;
  return getOptionalNumberEnv('DAILY_GENERATION_CAP', DEFAULT_DAILY_GENERATION_CAP);
}

/** UTC calendar day used to reset the daily cap. */
export function usageDay(isoNow: string): string {
  return isoNow.slice(0, 10);
}

export function dailyUsageCount(data: { dailyUsage?: unknown } | undefined | null, day: string): number {
  const usage = data?.dailyUsage as { date?: unknown; count?: unknown } | undefined;
  return usage?.date === day ? Number(usage.count || 0) : 0;
}

export class OrganizationAccessError extends Error {
  constructor(
    public readonly code: 'NO_ORGANIZATION' | 'ORGANIZATION_NOT_ACTIVE' | 'ORGANIZATION_SUSPENDED' | 'DAILY_LIMIT_REACHED',
    public readonly statusCode: 403 | 429
  ) {
    super(code);
  }
}
