import { GoogleGenAI } from '@google/genai';
import { getOptionalNumberEnv, getOptionalServerEnv, requireServerEnv } from './config/env';

export type GeminiFailureReason =
  | 'RATE_LIMIT_OR_QUOTA'
  | 'PROVIDER_INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'PROVIDER_TIMEOUT'
  | 'AUTH_OR_CONFIGURATION_ERROR'
  | 'REQUEST_ERROR'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface GeminiAttempt {
  model: string;
  modelVersion: string | null;
  status: 'succeeded' | 'failed';
  providerHttpStatus: number | null;
  reason: GeminiFailureReason | null;
  retryCount: number;
  latencyMs: number;
  usage: GeminiUsage;
  pricingVersion: string | null;
  estimatedCostUsd: number | null;
}

export interface GeminiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
}

export interface GeminiResult {
  response: any;
  text: string;
  attempts: GeminiAttempt[];
  usage: GeminiUsage;
  model: string;
  modelVersion: string | null;
  latencyMs: number;
  pricingVersion: string | null;
  estimatedCostUsd: number | null;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly reason: GeminiFailureReason,
    public readonly statusCode: number | null,
    public readonly attempts: GeminiAttempt[]
  ) {
    super(message);
  }
}

type Clock = () => number;
type Sleep = (ms: number) => Promise<void>;
type Client = { models: { generateContent: (request: any) => Promise<any> } };

type ModelPricing = { inputPerMillionUsd: number; outputPerMillionUsd: number; thinkingPerMillionUsd?: number };

// Populate only from a verified provider price source; null deliberately means unconfigured.
export const GEMINI_PRICING: { version: string | null; models: Record<string, ModelPricing> } = {
  version: null,
  models: {},
};

export function getGeminiModels(): string[] {
  const configuredPrimary = getOptionalServerEnv('GEMINI_PRIMARY_MODEL', 'gemini-3.6-flash');
  const primary = configuredPrimary.endsWith('-latest') ? 'gemini-3.6-flash' : configuredPrimary;
  const configuredFallbacks = getOptionalServerEnv('GEMINI_FALLBACK_MODELS')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model) => !model.endsWith('-latest'));
  return [...new Set([primary, ...configuredFallbacks].filter((model) => !model.endsWith('-latest')))].slice(0, 4);
}

export function classifyGeminiError(error: any): { reason: GeminiFailureReason; statusCode: number | null; retryable: boolean } {
  const statusValue = error?.status ?? error?.statusCode ?? error?.code;
  const statusCode = typeof statusValue === 'number' ? statusValue : Number.parseInt(String(statusValue), 10) || null;
  const message = String(error?.message || '').toLowerCase();
  const timeout = error?.name === 'AbortError' || /abort|timeout|timed out|deadline exceeded/.test(message);

  if (timeout || statusCode === 504) return { reason: 'PROVIDER_TIMEOUT', statusCode: statusCode || 504, retryable: true };
  if (statusCode === 429) return { reason: 'RATE_LIMIT_OR_QUOTA', statusCode, retryable: true };
  if (statusCode === 500) return { reason: 'PROVIDER_INTERNAL_ERROR', statusCode, retryable: true };
  if (statusCode === 503) return { reason: 'SERVICE_UNAVAILABLE', statusCode, retryable: true };
  if (statusCode && statusCode >= 500) return { reason: 'PROVIDER_INTERNAL_ERROR', statusCode, retryable: true };
  if (statusCode === 401 || statusCode === 403) return { reason: 'AUTH_OR_CONFIGURATION_ERROR', statusCode, retryable: false };
  if (statusCode && statusCode >= 400) return { reason: 'REQUEST_ERROR', statusCode, retryable: false };
  return { reason: 'UNKNOWN_PROVIDER_ERROR', statusCode, retryable: false };
}

export function calculateBackoffMs(retryCount: number, random = Math.random): number {
  const baseMs = getOptionalNumberEnv('GEMINI_RETRY_BASE_MS', 250);
  const capped = Math.min(getOptionalNumberEnv('GEMINI_RETRY_MAX_MS', 4000), baseMs * 2 ** retryCount);
  return Math.round(capped * (0.75 + random() * 0.5));
}

export function calculateEstimatedCostUsd(model: string, usage: GeminiUsage): { pricingVersion: string | null; estimatedCostUsd: number | null } {
  const pricing = GEMINI_PRICING.models[model];
  if (!pricing || !GEMINI_PRICING.version || usage.totalTokens === null) {
    return { pricingVersion: null, estimatedCostUsd: null };
  }
  const estimatedCostUsd = (
    ((usage.inputTokens || 0) * pricing.inputPerMillionUsd) +
    ((usage.outputTokens || 0) * pricing.outputPerMillionUsd) +
    ((usage.thinkingTokens || 0) * (pricing.thinkingPerMillionUsd || pricing.outputPerMillionUsd))
  ) / 1_000_000;
  return { pricingVersion: GEMINI_PRICING.version, estimatedCostUsd };
}

export function normalizeUsageMetadata(metadata: any): GeminiUsage {
  return {
    inputTokens: numberOrNull(metadata?.promptTokenCount),
    outputTokens: numberOrNull(metadata?.candidatesTokenCount),
    thinkingTokens: numberOrNull(metadata?.thoughtsTokenCount),
    totalTokens: numberOrNull(metadata?.totalTokenCount),
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function createClient(): Client {
  return new GoogleGenAI({
    apiKey: requireServerEnv('GEMINI_API_KEY', 'Required to use the server AI endpoints.'),
    httpOptions: {
      timeout: getOptionalNumberEnv('GEMINI_REQUEST_TIMEOUT_MS', 30000),
      retryOptions: { attempts: 1 } as any,
      headers: { 'User-Agent': 'aistudio-build' },
    } as any,
  }) as unknown as Client;
}

export async function generateGeminiContent(
  requestConfig: any,
  dependencies: {
    client?: Client;
    sleep?: Sleep;
    clock?: Clock;
    random?: () => number;
    onAttempt?: (attempt: GeminiAttempt) => Promise<void> | void;
  } = {}
): Promise<GeminiResult> {
  const client = dependencies.client || createClient();
  const sleep = dependencies.sleep || ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = dependencies.clock || Date.now;
  const random = dependencies.random || Math.random;
  const models = getGeminiModels();
  const maxAttempts = Math.min(3, Math.max(1, getOptionalNumberEnv('GEMINI_MAX_ATTEMPTS_PER_MODEL', 3)));
  const totalTimeoutMs = getOptionalNumberEnv('GEMINI_TOTAL_TIMEOUT_MS', 75000);
  const startedAt = clock();
  const attempts: GeminiAttempt[] = [];
  let lastFailure: { reason: GeminiFailureReason; statusCode: number | null } = {
    reason: 'UNKNOWN_PROVIDER_ERROR',
    statusCode: null,
  };

  for (const model of models) {
    for (let retryCount = 0; retryCount < maxAttempts; retryCount += 1) {
      if (clock() - startedAt >= totalTimeoutMs) {
        throw new GeminiError('Gemini provider timed out.', 'PROVIDER_TIMEOUT', 504, attempts);
      }

      const attemptStartedAt = clock();
      try {
        const response = await client.models.generateContent({ ...requestConfig, model });
        const usage = normalizeUsageMetadata(response?.usageMetadata);
        const cost = calculateEstimatedCostUsd(model, usage);
        const attempt: GeminiAttempt = {
          model,
          modelVersion: typeof response?.modelVersion === 'string' ? response.modelVersion : null,
          status: 'succeeded',
          providerHttpStatus: null,
          reason: null,
          retryCount,
          latencyMs: clock() - attemptStartedAt,
          usage,
          ...cost,
        };
        attempts.push(attempt);
        await dependencies.onAttempt?.(attempt);
        console.info('[GEMINI]', { event: 'attempt_succeeded', model, retryCount, latencyMs: attempt.latencyMs });
        return {
          response,
          text: response?.text || '',
          attempts,
          usage,
          model,
          modelVersion: attempt.modelVersion,
          latencyMs: clock() - startedAt,
          ...cost,
        };
      } catch (error: any) {
        const classified = classifyGeminiError(error);
        lastFailure = classified;
        const attempt: GeminiAttempt = {
          model,
          modelVersion: null,
          status: 'failed',
          providerHttpStatus: classified.statusCode,
          reason: classified.reason,
          retryCount,
          latencyMs: clock() - attemptStartedAt,
          usage: { inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null },
          pricingVersion: null,
          estimatedCostUsd: null,
        };
        attempts.push(attempt);
        await dependencies.onAttempt?.(attempt);
        console.warn('[GEMINI]', {
          event: 'attempt_failed', model, retryCount, reason: classified.reason, providerHttpStatus: classified.statusCode, latencyMs: attempt.latencyMs,
        });
        if (!classified.retryable) break;
        if (retryCount < maxAttempts - 1) await sleep(calculateBackoffMs(retryCount, random));
      }
    }
  }

  throw new GeminiError('Gemini provider is temporarily unavailable.', lastFailure.reason, lastFailure.statusCode, attempts);
}
