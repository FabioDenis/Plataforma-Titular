import path from 'path';
import dotenv from 'dotenv';

const envFiles = [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')];

// Emulator tests must set their process environment before importing server code.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: envFiles });
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function getOptionalServerEnv(name: string, fallback = ''): string {
  return readEnv(name) ?? fallback;
}

export function requireServerEnv(name: string, reason?: string): string {
  const value = readEnv(name);
  if (value) {
    return value;
  }

  const context = reason ? ` ${reason}` : '';
  throw new Error(`Missing required server environment variable ${name}.${context}`);
}

export function hasServerEnv(name: string): boolean {
  return Boolean(readEnv(name));
}

function isTruthyEnv(name: string): boolean {
  return readEnv(name) === 'true';
}

function hasAnyServerEnv(names: string[]): boolean {
  return names.some((name) => hasServerEnv(name));
}

export function validateServerStartupEnv(): void {
  const issues: string[] = [];

  if (!hasServerEnv('GEMINI_API_KEY')) {
    issues.push('GEMINI_API_KEY is required to start the backend.');
  }

  const hasMetaRedirect = hasServerEnv('META_REDIRECT_URI');
  const hasAppUrl = hasServerEnv('APP_URL');
  const metaConfigured = hasAnyServerEnv([
    'META_APP_ID',
    'META_APP_SECRET',
    'META_TOKEN_ENCRYPTION_KEY',
    'META_REDIRECT_URI',
  ]);

  if (metaConfigured) {
    if (!hasServerEnv('META_APP_ID')) {
      issues.push('Meta integration requires META_APP_ID when the integration is configured.');
    }
    if (!hasServerEnv('META_APP_SECRET')) {
      issues.push('Meta integration requires META_APP_SECRET when the integration is configured.');
    }
    if (!hasServerEnv('META_TOKEN_ENCRYPTION_KEY')) {
      issues.push('Meta integration requires META_TOKEN_ENCRYPTION_KEY when the integration is configured.');
    }
    if (!hasMetaRedirect && !hasAppUrl) {
      issues.push('Meta integration requires META_REDIRECT_URI or APP_URL when the integration is configured.');
    }
  }

  const mpRequiresSignature = isTruthyEnv('MERCADOPAGO_REQUIRE_SIGNATURE');
  const mpConfigured = hasAnyServerEnv([
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADOPAGO_WEBHOOK_SECRET',
  ]);

  if (mpConfigured) {
    if (!hasServerEnv('MERCADOPAGO_ACCESS_TOKEN')) {
      issues.push('Mercado Pago requires MERCADOPAGO_ACCESS_TOKEN when the integration is configured.');
    }
    if (!hasAppUrl) {
      issues.push('Mercado Pago requires APP_URL when the integration is configured.');
    }
    if (mpRequiresSignature && !hasServerEnv('MERCADOPAGO_WEBHOOK_SECRET')) {
      issues.push('Mercado Pago requires MERCADOPAGO_WEBHOOK_SECRET when MERCADOPAGO_REQUIRE_SIGNATURE=true.');
    }
  }

  // Log-only guardrail: webhook signature enforcement is strongly recommended in production.
  if (process.env.NODE_ENV === 'production' && !mpRequiresSignature) {
    console.warn(
      'Mercado Pago webhook signature enforcement is disabled (MERCADOPAGO_REQUIRE_SIGNATURE is not "true"); this is discouraged in production.'
    );
  }

  if (issues.length > 0) {
    throw new Error(`Invalid server environment configuration:\n- ${issues.join('\n- ')}`);
  }
}

export function getOptionalNumberEnv(name: string, fallback: number): number {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getAdminEmails(): string[] {
  return getOptionalServerEnv('ADMIN_EMAILS')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
