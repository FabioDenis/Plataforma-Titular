import { getOptionalNumberEnv } from './config/env';
import { getAdminDb } from './firebase-admin';
import { GeminiAttempt, GeminiFailureReason, GeminiResult } from './gemini';
import { DEFAULT_TRIAL_PUBLICATION_LIMIT } from './billing';
import type { DocumentReference } from 'firebase-admin/firestore';

export type GenerationState = 'reserved' | 'completed' | 'failed';

export class GenerationStateError extends Error {
  constructor(
    public readonly code: 'GENERATION_IN_PROGRESS' | 'GENERATION_ALREADY_COMPLETED' | 'GENERATION_FAILED',
    public readonly generationId: string
  ) {
    super(code);
  }
}

export function validateIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(key) ? key : null;
}

export function createServerGenerationId(): string {
  return `srv_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function resolveAuthorizedOrganizationId(uid: string): Promise<string> {
  const db = getAdminDb();
  const user = await db.collection('users').doc(uid).get();
  const organizationId = user.data()?.organizationId;
  if (typeof organizationId === 'string' && organizationId.trim()) {
    const org = await db.collection('organizations').doc(organizationId).get();
    if (org.exists) return organizationId;
  }
  const owned = await db.collection('organizations').where('ownerUid', '==', uid).limit(1).get();
  if (!owned.empty) return owned.docs[0].id;
  return `org_${uid}`;
}

export interface GenerationTracker {
  organizationId: string;
  generationId: string;
  recordAttempt: (attempt: GeminiAttempt) => Promise<void>;
  replay: { result: unknown; remainingPublications: number | null } | null;
  complete: (result: GeminiResult, persistedResult: unknown) => Promise<{ remainingPublications: number | null }>;
  fail: (reason: GeminiFailureReason | 'OPERATION_ERROR', providerHttpStatus?: number | null) => Promise<void>;
}

export async function startGeneration(input: {
  organizationId: string;
  userId: string;
  operation: string;
  generationId: string;
  commercial: boolean;
  testHooks?: { beforeAggregate?: () => Promise<void> | void };
}): Promise<GenerationTracker> {
  const db = getAdminDb();
  const orgRef = db.collection('organizations').doc(input.organizationId);
  const generationRef = orgRef.collection('aiGenerations').doc(input.generationId);
  const now = new Date().toISOString();
  const reservationExpiresAt = new Date(Date.now() + getOptionalNumberEnv('AI_GENERATION_RESERVATION_TTL_MS', 10 * 60 * 1000)).toISOString();

  let replay: GenerationTracker['replay'] = null;
  await db.runTransaction(async (transaction) => {
    const expiredReservations = input.commercial
      ? await transaction.get(orgRef.collection('aiGenerations').where('state', '==', 'reserved'))
      : null;
    const [existing, org] = await Promise.all([transaction.get(generationRef), transaction.get(orgRef)]);
    const expiredReservationsDocs = expiredReservations?.docs.filter((doc) => {
      const expiresAt = doc.data()?.reservationExpiresAt;
      return typeof expiresAt === 'string' && expiresAt <= now;
    }) || [];
    const activeReservationCount = expiredReservations?.docs.filter((doc) => {
      const data = doc.data() || {};
      return data.commercial === true && typeof data.reservationExpiresAt === 'string' && data.reservationExpiresAt > now;
    }).length || 0;
    const expiredReservationIds = new Set(expiredReservationsDocs.map((doc) => doc.id));
    let reclaimingExpiredGeneration = false;
    if (existing.exists) {
      const existingData = existing.data() || {};
      const state = existingData.state as GenerationState;
      if (state === 'completed') {
        replay = {
          result: existingData.result,
          remainingPublications: typeof existingData.remainingPublications === 'number' ? existingData.remainingPublications : null,
        };
        return;
      }
      if (state === 'reserved' && !expiredReservationIds.has(input.generationId)) {
        throw new GenerationStateError('GENERATION_IN_PROGRESS', input.generationId);
      }
      reclaimingExpiredGeneration = state === 'reserved' && expiredReservationIds.has(input.generationId);
      if (state === 'failed') throw new GenerationStateError('GENERATION_FAILED', input.generationId);
    }

    const orgData = org.data() || {};
    // The summaries are authoritative, so a stale counter cannot permanently block a new reservation.
    const activeReservations = activeReservationCount;
    const publicationUsed = Number(orgData.publicationUsed || 0);
    const publicationLimit = Number(orgData.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT);
    if (input.commercial && publicationUsed + activeReservations >= publicationLimit) {
      const error = new Error('Has reached the publication limit for this plan.');
      (error as any).code = 'INSUFFICIENT_CREDITS';
      (error as any).statusCode = 402;
      throw error;
    }

    expiredReservationsDocs.forEach((reservation) => {
      const auditRef = reservation.ref.collection('auditEvents').doc();
      transaction.set(reservation.ref, {
        state: 'failed', failedAt: now, updatedAt: now,
        error: { reason: 'RESERVATION_EXPIRED', providerHttpStatus: null },
        reservationReleasedAt: now,
        reservationReleaseReason: 'RESERVATION_EXPIRED',
      }, { merge: true });
      transaction.set(auditRef, { type: 'reservation_released', reason: 'RESERVATION_EXPIRED', createdAt: now });
    });

    transaction.set(orgRef, {
      ...(org.exists ? {} : {
        name: `Organization (${input.userId.slice(0, 8)})`, ownerUid: input.userId, plan: 'trial', publicationLimit, publicationUsed: 0,
      }),
      activeGenerationReservations: input.commercial ? activeReservations + 1 : activeReservations,
      updatedAt: now,
    }, { merge: true });
    transaction.set(generationRef, {
      state: input.commercial ? 'reserved' : 'reserved',
      operation: input.operation,
      userId: input.userId,
      commercial: input.commercial,
      publicationConsumed: false,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThinkingTokens: 0,
      totalTokens: 0,
      totalCostUsd: null,
      createdAt: now,
      updatedAt: now,
      ...(input.commercial ? { reservationExpiresAt } : {}),
    }, { merge: true });
    if (reclaimingExpiredGeneration) {
      transaction.set(generationRef.collection('auditEvents').doc(), {
        type: 'reservation_reclaimed', reason: 'RESERVATION_EXPIRED', createdAt: now,
      });
    }
  });

  return createTracker(input, generationRef, orgRef, replay);
}

function createTracker(
  input: { organizationId: string; userId: string; operation: string; generationId: string; commercial: boolean; testHooks?: { beforeAggregate?: () => Promise<void> | void } },
  generationRef: DocumentReference,
  orgRef: DocumentReference,
  replay: GenerationTracker['replay']
): GenerationTracker {
  return {
    organizationId: input.organizationId,
    generationId: input.generationId,
    replay,
    async recordAttempt(attempt) {
      const attemptRef = generationRef.collection('attempts').doc();
      await attemptRef.set({
        provider: 'gemini', model: attempt.model, modelVersion: attempt.modelVersion, operation: input.operation,
        inputTokens: attempt.usage.inputTokens, outputTokens: attempt.usage.outputTokens, thinkingTokens: attempt.usage.thinkingTokens, totalTokens: attempt.usage.totalTokens,
        status: attempt.status, providerHttpStatus: attempt.providerHttpStatus, normalizedReason: attempt.reason,
        retryCount: attempt.retryCount, latencyMs: attempt.latencyMs, createdAt: new Date().toISOString(),
        pricingVersion: attempt.pricingVersion, estimatedCostUsd: attempt.estimatedCostUsd,
      });
    },
    async complete(result, persistedResult) {
      const now = new Date().toISOString();
      const usage = result.usage;
      let remainingPublications: number | null = null;
      await getAdminDb().runTransaction(async (transaction) => {
        const orgAggregateRef = orgRef.collection('aiUsageMonthly').doc(monthKey(now));
        const globalAggregateRef = getAdminDb().collection('aiUsageMonthly').doc(monthKey(now));
        const [org, generation, orgAggregate, globalAggregate] = await Promise.all([
          transaction.get(orgRef), transaction.get(generationRef), transaction.get(orgAggregateRef), transaction.get(globalAggregateRef),
        ]);
        if (generation.data()?.state !== 'reserved') {
          throw new GenerationStateError(
            generation.data()?.state === 'completed' ? 'GENERATION_ALREADY_COMPLETED' : 'GENERATION_FAILED',
            input.generationId
          );
        }
        const orgData = org.data() || {};
        const activeReservations = Number(orgData.activeGenerationReservations || 0);
        const publicationUsed = Number(orgData.publicationUsed || 0);
        const publicationLimit = Number(orgData.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT);
        const cost = result.estimatedCostUsd;
        const newUsed = input.commercial ? publicationUsed + 1 : publicationUsed;
        remainingPublications = input.commercial ? Math.max(0, publicationLimit - newUsed) : null;
        transaction.set(generationRef, {
          state: 'completed', publicationConsumed: input.commercial, completedAt: now, updatedAt: now,
          totalInputTokens: usage.inputTokens || 0, totalOutputTokens: usage.outputTokens || 0, totalThinkingTokens: usage.thinkingTokens || 0,
          totalTokens: usage.totalTokens || 0, totalCostUsd: cost, model: result.model, modelVersion: result.modelVersion,
          pricingVersion: result.pricingVersion, estimatedCostUsd: cost, error: null,
          result: persistedResult,
          remainingPublications,
        }, { merge: true });
        if (input.commercial) {
          transaction.set(orgRef, { publicationUsed: newUsed, activeGenerationReservations: Math.max(0, activeReservations - 1), updatedAt: now }, { merge: true });
        }
        await input.testHooks?.beforeAggregate?.();
        updateMonthlyAggregate(transaction, orgAggregateRef, orgAggregate.data(), input, result, now);
        updateMonthlyAggregate(transaction, globalAggregateRef, globalAggregate.data(), input, result, now);
      });
      return { remainingPublications };
    },
    async fail(reason, providerHttpStatus = null) {
      const now = new Date().toISOString();
      await getAdminDb().runTransaction(async (transaction) => {
        const [org, generation] = await Promise.all([transaction.get(orgRef), transaction.get(generationRef)]);
        if (!generation.exists || generation.data()?.state !== 'reserved') return;
        const activeReservations = Number(org.data()?.activeGenerationReservations || 0);
        transaction.set(generationRef, {
          state: 'failed', failedAt: now, updatedAt: now,
          error: { reason, providerHttpStatus },
          ...(input.commercial ? { reservationReleasedAt: now, reservationReleaseReason: reason } : {}),
        }, { merge: true });
        if (input.commercial) transaction.set(orgRef, { activeGenerationReservations: Math.max(0, activeReservations - 1), updatedAt: now }, { merge: true });
      });
    },
  };
}

function updateMonthlyAggregate(transaction: any, ref: any, current: any, input: { operation: string; commercial: boolean }, result: GeminiResult, now: string) {
  const modelCurrent = current?.models?.[result.model] || {};
  const cost = result.estimatedCostUsd;
  transaction.set(ref, {
    month: monthKey(now), updatedAt: now,
    publications: Number(current?.publications || 0) + (input.commercial ? 1 : 0),
    totalInputTokens: Number(current?.totalInputTokens || 0) + (result.usage.inputTokens || 0),
    totalOutputTokens: Number(current?.totalOutputTokens || 0) + (result.usage.outputTokens || 0),
    totalThinkingTokens: Number(current?.totalThinkingTokens || 0) + (result.usage.thinkingTokens || 0),
    totalTokens: Number(current?.totalTokens || 0) + (result.usage.totalTokens || 0),
    totalCostUsd: addKnownCost(current?.totalCostUsd, cost),
    models: {
      ...(current?.models || {}),
      [result.model]: {
        generations: Number(modelCurrent.generations || 0) + 1,
        totalTokens: Number(modelCurrent.totalTokens || 0) + (result.usage.totalTokens || 0),
        totalCostUsd: addKnownCost(modelCurrent.totalCostUsd, cost),
      },
    },
  }, { merge: true });
}

export function addKnownCost(current: unknown, incoming: number | null): number | null {
  const currentCost = typeof current === 'number' && Number.isFinite(current) ? current : null;
  if (incoming === null) return currentCost;
  return (currentCost || 0) + incoming;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}
