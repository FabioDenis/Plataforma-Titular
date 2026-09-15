import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { Type } from '@google/genai';
import { SAMPLE_NEWS } from './src/data/sampleNews';
import { authenticateFirebaseRequest, verifyFirebaseAuth, AuthenticatedRequest } from './server/auth';
import {
  getPlansCatalog,
  getCreditPacksCatalog,
  getOrCreateBillingProfile,
  getUserLedger,
  CREDIT_COSTS,
  DEFAULT_TRIAL_PUBLICATION_LIMIT,
} from './server/billing';
import {
  createSubscriptionPreference,
  createCreditPackCheckout,
  cancelUserSubscription,
  processMpWebhookEvent,
} from './server/mercadopago';
import {
  generateMetaAuthUrl,
  handleMetaCallback,
  confirmPageSelection,
  getOrganizationSocialStatus,
  disconnectSocialAccounts,
  executeMultiPlatformPublish,
  retryPlatformPublish,
  storeMediaForMeta,
  getStoredMedia,
  isMetaConfigured,
  MetaService,
  MetaServiceError,
} from './server/services/meta';
import {
  checkIsHermesAdmin,
  getAllUsersWithOrganizations,
  adminAddGenerations,
  getOrganizationGenerationHistory,
  adminToggleUserAdminRole,
} from './server/billing';
import { getAdminDb } from './server/firebase-admin';
import { bootstrapAccount, BootstrapConflictError } from './server/auth-bootstrap';
import { getOptionalNumberEnv, getOptionalServerEnv, validateServerStartupEnv } from './server/config/env';
import { GeminiError, GeminiFailureReason, generateGeminiContent } from './server/gemini';
import {
  createServerGenerationId,
  GenerationStateError,
  resolveAuthorizedOrganizationId,
  startGeneration,
  validateIdempotencyKey,
} from './server/ai-generations';

// Safe resolution for __dirname in both CJS bundle and ESM environments
const getCurrentDir = (): string => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // Ignore URL parsing errors when bundled as CJS
  }
  return process.cwd();
};

const currentDir = getCurrentDir();

// Process level safety handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// Helper for SSRF URL safety
function isUrlSafe(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Messages eligible to be returned to clients: only curated, static user-facing strings authored
// in server/services/meta. MetaServiceError instances tagged with the UNKNOWN category carry
// dynamic text derived from raw Meta Graph API responses, so they fall back to a generic message.
function getClientSafeErrorMessage(err: any, genericMessage: string): string {
  if (err instanceof MetaServiceError && err.category !== 'UNKNOWN' && typeof err.userMessage === 'string') {
    return err.userMessage;
  }
  return genericMessage;
}

// Escapes dynamic values interpolated into HTML text contexts to prevent XSS.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Serializes a value for safe interpolation inside a <script> block: JSON quoting plus escaping
// of '<' so a payload cannot close the script tag early and inject markup.
function toSafeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface ServerTestDependencies {
  generateGeminiContent?: typeof generateGeminiContent;
  verifyAuth?: typeof verifyFirebaseAuth;
  authenticateRequest?: typeof authenticateFirebaseRequest;
  bootstrapAccount?: typeof bootstrapAccount;
  fetch?: typeof fetch;
  hooks?: {
    postReservationPreGemini?: () => Promise<void> | void;
    postGeminiPreFinalization?: () => Promise<void> | void;
    postFinalPreHttp?: () => Promise<void> | void;
    beforeAggregate?: () => Promise<void> | void;
  };
  skipStatic?: boolean;
}

export async function createApp(dependencies: ServerTestDependencies = {}) {
  if (process.env.NODE_ENV !== 'test' && Object.keys(dependencies).length > 0) {
    throw new Error('Test dependencies are only available when NODE_ENV is test.');
  }

  const app = express();
  const verifyAuth = dependencies.verifyAuth || verifyFirebaseAuth;
  const authenticateRequest = dependencies.authenticateRequest || authenticateFirebaseRequest;
  const runBootstrapAccount = dependencies.bootstrapAccount || bootstrapAccount;
  const runGemini = dependencies.generateGeminiContent || generateGeminiContent;
  const fetcher = dependencies.fetch || fetch;
  app.use(express.json({ limit: '30mb' }));

  // Cloud Run container health probe (no auth, no external service calls)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  try {
    async function runTrackedGeminiOperation<T>(input: {
      user: { uid: string; email: string };
      operation: string;
      requestConfig: any;
      commercial?: boolean;
      idempotencyKey?: string | undefined;
      transform: (result: any) => T;
    }): Promise<{ result: T; remainingPublications: number | null; generationId: string; generatedIdempotencyKey: boolean }> {
      const organizationId = await resolveAuthorizedOrganizationId(input.user.uid);
      const suppliedKey = validateIdempotencyKey(input.idempotencyKey);
      const generationId = suppliedKey || createServerGenerationId();
      const tracker = await startGeneration({
        organizationId,
        userId: input.user.uid,
        operation: input.operation,
        generationId,
        commercial: Boolean(input.commercial),
        testHooks: { beforeAggregate: dependencies.hooks?.beforeAggregate },
      });

      if (tracker.replay) {
        return {
          result: tracker.replay.result as T,
          remainingPublications: tracker.replay.remainingPublications,
          generationId,
          generatedIdempotencyKey: false,
        };
      }

      try {
        await dependencies.hooks?.postReservationPreGemini?.();
        const gemini = await runGemini(input.requestConfig, { onAttempt: tracker.recordAttempt });
        const result = input.transform(gemini.response);
        await dependencies.hooks?.postGeminiPreFinalization?.();
        const completion = await tracker.complete(gemini, result);
        await dependencies.hooks?.postFinalPreHttp?.();
        return { result, remainingPublications: completion.remainingPublications, generationId, generatedIdempotencyKey: !suppliedKey };
      } catch (error: any) {
        const reason: GeminiFailureReason | 'OPERATION_ERROR' = error instanceof GeminiError ? error.reason : 'OPERATION_ERROR';
        await tracker.fail(reason, error instanceof GeminiError ? error.statusCode : null);
        throw error;
      }
    }

    function sendAiError(res: any, error: any, fallbackMessage: string) {
      if (error instanceof GenerationStateError) {
        return res.status(409).json({ code: error.code, generationId: error.generationId, error: 'La operación ya fue recibida.' });
      }
      if (error?.code === 'INSUFFICIENT_CREDITS' || error?.statusCode === 402) {
        return res.status(402).json({ code: 'INSUFFICIENT_CREDITS', error: 'Has alcanzado el límite de publicaciones de tu plan.' });
      }
      if (error instanceof GeminiError) {
        if (error.reason === 'AUTH_OR_CONFIGURATION_ERROR') {
          return res.status(502).json({ code: 'AI_PROVIDER_CONFIGURATION_ERROR', error: 'La configuración del proveedor de IA no está disponible.' });
        }
        if (error.reason === 'REQUEST_ERROR') {
          return res.status(400).json({ code: 'AI_REQUEST_REJECTED', error: 'La solicitud no pudo ser procesada por el proveedor de IA.' });
        }
        return res.status(503).json({ code: 'AI_TEMPORARILY_UNAVAILABLE', error: 'La IA no está disponible temporalmente. Intenta nuevamente.' });
      }
      return res.status(500).json({ code: 'AI_OPERATION_FAILED', error: fallbackMessage });
    }

    // ==========================================
    // PUBLIC CONFIG & CATALOG ENDPOINTS
    // ==========================================

    // API Route: Public Firebase & App Configuration
    app.get('/api/config', (req, res) => {
      const projectId =
        getOptionalServerEnv('VITE_FIREBASE_PROJECT_ID') ||
        getOptionalServerEnv('FIREBASE_PROJECT_ID') ||
        '';
      res.json({
        firebaseApiKey:
          getOptionalServerEnv('VITE_FIREBASE_API_KEY') ||
          getOptionalServerEnv('FIREBASE_WEB_API_KEY') ||
          getOptionalServerEnv('FIREBASE_API_KEY') ||
          '',
        firebaseAuthDomain:
          getOptionalServerEnv('VITE_FIREBASE_AUTH_DOMAIN') ||
          getOptionalServerEnv('FIREBASE_AUTH_DOMAIN') ||
          (projectId ? `${projectId}.firebaseapp.com` : ''),
        firebaseProjectId: projectId,
        firebaseStorageBucket:
          getOptionalServerEnv('VITE_FIREBASE_STORAGE_BUCKET') ||
          getOptionalServerEnv('FIREBASE_STORAGE_BUCKET') ||
          (projectId ? `${projectId}.appspot.com` : ''),
        firebaseMessagingSenderId:
          getOptionalServerEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
          getOptionalServerEnv('FIREBASE_MESSAGING_SENDER_ID') ||
          '',
        firebaseAppId:
          getOptionalServerEnv('VITE_FIREBASE_APP_ID') ||
          getOptionalServerEnv('FIREBASE_APP_ID') ||
          '',
        firebaseMeasurementId:
          getOptionalServerEnv('VITE_FIREBASE_MEASUREMENT_ID') || getOptionalServerEnv('FIREBASE_MEASUREMENT_ID') || '',
        firestoreDatabaseId:
          getOptionalServerEnv('VITE_FIRESTORE_DATABASE_ID') || getOptionalServerEnv('FIRESTORE_DATABASE_ID') || '(default)',
        appUrl: getOptionalServerEnv('APP_URL'),
        trialPublications: getOptionalNumberEnv('TRIAL_PUBLICATIONS', DEFAULT_TRIAL_PUBLICATION_LIMIT),
        maxArticleChars: getOptionalNumberEnv('MAX_ARTICLE_INPUT_CHARS', 60000),
      });
    });

    // API Route: Billing Catalog (Plans & Credit Packs)
    app.get('/api/billing/catalog', (req, res) => {
      res.json({
        plans: getPlansCatalog(),
        packs: getCreditPacksCatalog(),
        costs: CREDIT_COSTS,
      });
    });

    app.post('/api/auth/bootstrap', verifyAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const result = await runBootstrapAccount({
          uid: req.user!.uid,
          email: req.user!.email,
        });
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof BootstrapConflictError) {
          return res.status(409).json({
            code: 'BOOTSTRAP_CONFLICT',
            error: 'La cuenta entra en conflicto con una organización existente.',
          });
        }
        console.error('Account bootstrap failed.');
        return res.status(500).json({
          code: 'BOOTSTRAP_FAILED',
          error: 'No fue posible completar la creación de la cuenta.',
        });
      }
    });

    // API Route: Secure Image Proxy to bypass CORS on export
    app.get('/api/proxy-image', async (req, res) => {
      try {
        const rawUrl = req.query.url as string;
        if (!rawUrl || typeof rawUrl !== 'string') {
          return res.status(400).json({ error: 'Parámetro url es requerido.' });
        }

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          return res.status(400).json({ error: 'URL inválida.' });
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return res.status(400).json({ error: 'Solo protocolos HTTP y HTTPS están soportados.' });
        }

        // SSRF guard: reject targets pointing at private/internal network hosts.
        if (!isUrlSafe(rawUrl)) {
          return res.status(400).json({ error: 'La URL solicitada no está permitida.' });
        }

        const response = await fetcher(parsedUrl.toString(), {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(12000),
        });

        if (!response.ok) {
          return res.status(response.status).json({ error: `Servidor remoto retornó status ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.arrayBuffer();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(buffer));
      } catch (err: any) {
        console.error('Error en /api/proxy-image:', err?.message || err);
        return res.status(500).json({ error: 'Error al obtener la imagen remota.' });
      }
    });

    // ==========================================
    // AUTHENTICATED BILLING ENDPOINTS
    // ==========================================

    // API Route: Current User Billing Profile & Ledger History
    app.get('/api/billing/me', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const uid = req.user!.uid;
        const email = req.user!.email;
        const profile = await getOrCreateBillingProfile(uid, email);
        const ledger = await getUserLedger(uid, 15);
        const isAdmin = await checkIsHermesAdmin(uid, email);

        const monthlyRemaining = profile.monthlyCreditsRemaining || 0;
        const purchasedRemaining = profile.purchasedCreditsRemaining || 0;
        const totalRemaining = monthlyRemaining + purchasedRemaining;

        return res.json({
          ...profile,
          isAdmin,
          monthlyCreditsRemaining: monthlyRemaining,
          purchasedCreditsRemaining: purchasedRemaining,
          creditsRemaining: totalRemaining,
          ledger,
        });
      } catch (err: any) {
        console.error('Error fetching billing profile:', err);
        return res.status(500).json({ error: 'Error al obtener datos de facturación.' });
      }
    });

    // ==========================================
    // HERMES PLATFORM ADMINISTRATION (GENERACIONES)
    // ==========================================

    // API Route: List all users & organizations for admin management
    app.get('/api/admin/users', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const isAdmin = await checkIsHermesAdmin(req.user!.uid, req.user!.email);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador.' });
        }

        const users = await getAllUsersWithOrganizations();
        return res.json({ users });
      } catch (err: any) {
        console.error('Error fetching admin users:', err);
        return res.status(500).json({ error: 'Error al consultar la lista de usuarios.' });
      }
    });

    // API Route: Add generations to user organization (atomic transaction)
    app.post('/api/admin/users/add-generations', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const isAdmin = await checkIsHermesAdmin(req.user!.uid, req.user!.email);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador.' });
        }

        const { targetOrgId, targetUid, amount, reason } = req.body || {};
        if (!targetOrgId || !targetUid) {
          return res.status(400).json({ error: 'Faltan parámetros requeridos (targetOrgId, targetUid).' });
        }

        const numericAmount = parseInt(String(amount), 10);
        if (isNaN(numericAmount) || numericAmount <= 0) {
          return res.status(400).json({ error: 'La cantidad debe ser un número entero mayor a 0.' });
        }

        const result = await adminAddGenerations({
          adminUid: req.user!.uid,
          adminEmail: req.user!.email || '',
          targetOrgId,
          targetUid,
          amount: numericAmount,
          reason: typeof reason === 'string' ? reason : '',
        });

        return res.json({ success: true, ...result });
      } catch (err: any) {
        console.error('Error adding generations:', err);
        return res.status(500).json({ error: 'Error al agregar generaciones.' });
      }
    });

    // API Route: Get generation ledger history for organization
    app.get('/api/admin/users/:orgId/history', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const isAdmin = await checkIsHermesAdmin(req.user!.uid, req.user!.email);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador.' });
        }

        const orgId = req.params.orgId;
        const history = await getOrganizationGenerationHistory(orgId);
        return res.json({ history });
      } catch (err: any) {
        console.error('Error fetching org history:', err);
        return res.status(500).json({ error: 'Error al consultar el historial de generaciones.' });
      }
    });

    // API Route: Toggle administrative access for user
    app.post('/api/admin/users/toggle-admin', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const isAdmin = await checkIsHermesAdmin(req.user!.uid, req.user!.email);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador.' });
        }

        const { targetUid, makeAdmin } = req.body || {};
        if (!targetUid) {
          return res.status(400).json({ error: 'Falta el parámetro targetUid.' });
        }

        const newStatus = await adminToggleUserAdminRole(req.user!.uid, targetUid, !!makeAdmin);
        return res.json({ success: true, isAdmin: newStatus });
      } catch (err: any) {
        console.error('Error toggling admin status:', err);
        return res.status(500).json({ error: 'Error al actualizar permisos de administrador.' });
      }
    });

    // API Route: Create Subscription Preference (Mercado Pago)
    app.post('/api/billing/create-subscription', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const uid = req.user!.uid;
        const email = req.user!.email;
        const { planId, billingCycle } = req.body || {};

        if (!planId) {
          return res.status(400).json({ error: 'Debe especificar el id del plan.' });
        }

        const result = await createSubscriptionPreference(uid, email, planId, billingCycle || 'monthly');
        return res.json(result);
      } catch (err: any) {
        console.error('Error creating subscription:', err);
        return res.status(400).json({ error: 'Error al procesar la suscripción.' });
      }
    });

    // API Route: Create Credit Checkout Preference (Mercado Pago)
    app.post('/api/billing/create-credit-checkout', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const uid = req.user!.uid;
        const email = req.user!.email;
        const { packId } = req.body || {};

        if (!packId) {
          return res.status(400).json({ error: 'Debe especificar el id del paquete de créditos.' });
        }

        const result = await createCreditPackCheckout(uid, email, packId);
        return res.json(result);
      } catch (err: any) {
        console.error('Error creating credit checkout:', err);
        return res.status(400).json({ error: 'Error al iniciar la compra de créditos.' });
      }
    });

    // API Route: Cancel Subscription
    app.post('/api/billing/cancel-subscription', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const uid = req.user!.uid;
        const result = await cancelUserSubscription(uid);
        return res.json(result);
      } catch (err: any) {
        console.error('Error cancelling subscription:', err);
        return res.status(400).json({ error: 'Error al cancelar la suscripción.' });
      }
    });

    // ==========================================
    // PUBLIC MERCADO PAGO WEBHOOK
    // ==========================================

    app.post('/api/webhooks/mercadopago', async (req, res) => {
      try {
        const result = await processMpWebhookEvent(req.body, req.headers);
        return res.status(result.status).json({ message: result.message });
      } catch (err: any) {
        console.error('Webhook error:', err);
        return res.status(200).json({ message: 'Error interno en webhook procesado de forma segura.' });
      }
    });

    // ==========================================
    // REAL META SOCIAL PUBLISHING API (FACEBOOK & INSTAGRAM)
    // ==========================================

    // Public Media Server for Meta Graph API crawlers
    app.get('/api/media/render/:id', (req, res) => {
      try {
        const media = getStoredMedia(req.params.id);
        if (!media) {
          return res.status(404).json({ error: 'Imagen no encontrada o expirada.' });
        }
        res.setHeader('Content-Type', media.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(media.buffer);
      } catch (err) {
        console.error('Error serving media to Meta:', err);
        return res.status(500).json({ error: 'Error al servir la imagen.' });
      }
    });

    // Helper to verify user administrator/owner permission for an organization
    async function checkUserAdminPermission(uid: string, orgId?: string): Promise<boolean> {
      try {
        const db = getAdminDb();
        const userDoc = await db.doc(`users/${uid}`).get();
        if (!userDoc.exists) {
          return false;
        }

        const userData = userDoc.data() || {};
        const role = (userData.role || '').toLowerCase();
        if (role === 'admin' || role === 'owner' || role === 'administrator') {
          return true;
        }

        if (orgId) {
          const orgDoc = await db.doc(`organizations/${orgId}`).get();
          if (orgDoc.exists && orgDoc.data()?.ownerUid === uid) {
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    }

    // Connection Status for Organization
    app.get('/api/meta/status', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const orgId = (req.query.orgId as string) || `org_${req.user!.uid}`;
        const status = await getOrganizationSocialStatus(orgId);
        return res.json(status);
      } catch (err: any) {
        console.error('Error fetching Meta status:', err);
        return res.status(500).json({ error: 'Error al obtener estado de redes sociales.' });
      }
    });

    // Generate OAuth Authorization URL
    app.get('/api/meta/oauth/url', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const orgId = (req.query.orgId as string) || `org_${req.user!.uid}`;
        const userId = req.user!.uid;

        const hasPermission = await checkUserAdminPermission(userId, orgId);
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Permisos insuficientes: Solo administradores pueden conectar redes sociales.',
          });
        }

        const authUrl = generateMetaAuthUrl(orgId, userId);
        return res.json({ url: authUrl });
      } catch (err: any) {
        console.error('Error generating Meta OAuth URL:', err);
        const publicMessage = getClientSafeErrorMessage(err, 'Error al generar la URL de autorización de Meta.');
        return res.status(400).json({
          error: publicMessage,
          userMessage: publicMessage,
        });
      }
    });

    // OAuth Callback Handler (Popup receiver that sends available pages to Hermes)
    app.get('/api/meta/oauth/callback', async (req, res) => {
      const { code, state, error, error_description } = req.query as Record<string, string>;

      if (error || !code || !state) {
        const errMsg = error_description || error || 'La autorización con Meta fue cancelada o denegada.';
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Hermes - Autorización Meta</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; background: #0A0E17; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #111726; border: 1px solid #7F1D1D; padding: 24px; border-radius: 12px; text-align: center; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
                h2 { margin: 0 0 12px; font-size: 18px; color: #F87171; }
                p { margin: 0 0 16px; font-size: 14px; color: #94A3B8; line-height: 1.5; }
                button { background: #2563EB; color: #fff; border: 0; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="card">
                <h2>No se pudo conectar con Meta</h2>
                <p>${escapeHtml(errMsg)}</p>
                <button onclick="window.close()">Cerrar ventana</button>
              </div>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'META_AUTH_ERROR', error: ${toSafeScriptJson(errMsg)} }, '*');
                }
              </script>
            </body>
          </html>
        `);
      }

      try {
        const result = await handleMetaCallback(code, state);
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Hermes - Autorización Exitosa con Meta</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; background: #0A0E17; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #111726; border: 1px solid #1E2B42; padding: 28px; border-radius: 12px; text-align: center; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
                h2 { margin: 0 0 12px; font-size: 18px; color: #60A5FA; }
                p { margin: 0 0 16px; font-size: 14px; color: #94A3B8; line-height: 1.5; }
                .badge { display: inline-block; background: #064E3B; color: #34D399; font-size: 12px; padding: 4px 10px; border-radius: 9999px; font-weight: 600; margin-bottom: 12px; }
              </style>
            </head>
            <body>
              <div class="card">
                <span class="badge">✓ Autorizado con Éxito</span>
                <h2>Páginas Obtenidas</h2>
                <p>Selecciona en Hermes qué página corresponde a la institución.</p>
              </div>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'META_PAGES_AVAILABLE',
                    orgId: ${toSafeScriptJson(result.orgId)},
                    sessionKey: ${toSafeScriptJson(result.sessionKey)},
                    pages: ${toSafeScriptJson(result.pages)}
                  }, '*');
                  setTimeout(() => { window.close(); }, 800);
                } else {
                  setTimeout(() => { window.location.href = '/'; }, 1500);
                }
              </script>
            </body>
          </html>
        `);
      } catch (err: any) {
        console.error('Error handling Meta OAuth callback:', err);
        const errMsg = getClientSafeErrorMessage(err, 'Error al procesar la autorización de Meta.');
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Hermes - Error de Conexión</title>
              <style>
                body { font-family: system-ui, -apple-system, sans-serif; background: #0A0E17; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #111726; border: 1px solid #7F1D1D; padding: 24px; border-radius: 12px; text-align: center; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
                h2 { margin: 0 0 12px; font-size: 18px; color: #F87171; }
                p { margin: 0 0 16px; font-size: 14px; color: #94A3B8; line-height: 1.5; }
                button { background: #2563EB; color: #fff; border: 0; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="card">
                <h2>No se pudo completar la conexión</h2>
                <p>${escapeHtml(errMsg)}</p>
                <button onclick="window.close()">Cerrar ventana</button>
              </div>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'META_AUTH_ERROR', error: ${toSafeScriptJson(errMsg)} }, '*');
                }
              </script>
            </body>
          </html>
        `);
      }
    });

    // Select Page and Confirm Connection
    app.post('/api/meta/select-page', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const { orgId, sessionKey, selectedPageId } = req.body || {};
        const targetOrgId = orgId || `org_${req.user!.uid}`;
        const userId = req.user!.uid;

        const hasPermission = await checkUserAdminPermission(userId, targetOrgId);
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Permisos insuficientes: Solo los usuarios con rol de Administrador pueden seleccionar y vincular páginas de redes sociales.',
          });
        }

        if (!sessionKey || !selectedPageId) {
          return res.status(400).json({ error: 'Faltan parámetros requeridos (sessionKey, selectedPageId).' });
        }

        const status = await confirmPageSelection(targetOrgId, userId, sessionKey, selectedPageId);
        return res.json({ success: true, status });
      } catch (err: any) {
        console.error('Error selecting Meta page:', err);
        return res.status(400).json({
          error: getClientSafeErrorMessage(err, 'Error al vincular la página seleccionada.'),
        });
      }
    });

    // Disconnect Social Accounts
    app.post('/api/meta/disconnect', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const { orgId, platform = 'all' } = req.body || {};
        const targetOrgId = orgId || `org_${req.user!.uid}`;
        const userId = req.user!.uid;

        const hasPermission = await checkUserAdminPermission(userId, targetOrgId);
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Permisos insuficientes: Solo los usuarios con rol de Administrador pueden desconectar redes sociales.',
          });
        }

        await disconnectSocialAccounts(targetOrgId, platform);
        return res.json({ success: true, message: 'Cuenta desconectada correctamente.' });
      } catch (err: any) {
        console.error('Error disconnecting Meta accounts:', err);
        return res.status(500).json({ error: 'Error al desconectar cuentas de Meta.' });
      }
    });

    // Upload / Host Media for Meta Crawlers
    app.post('/api/meta/upload-media', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const { dataUrl, contentType = 'image/png' } = req.body || {};
        if (!dataUrl) {
          return res.status(400).json({ error: 'Se requiere la imagen en base64 o URL.' });
        }
        const result = await storeMediaForMeta(dataUrl, contentType);
        return res.json(result);
      } catch (err: any) {
        console.error('Error storing media for Meta:', err);
        return res.status(500).json({ error: 'Error al procesar la imagen para publicación.' });
      }
    });

    // Publish Content to Meta (Facebook / Instagram)
    app.post('/api/meta/publish', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const uid = req.user!.uid;
        const email = req.user!.email;
        const {
          orgId,
          orgName,
          articleTitle,
          category,
          headline,
          subtitle,
          facebookCaption,
          instagramCaption,
          imageUrl,
          format = 'feed',
          targets = { facebook: true, instagram: true },
          scheduledPublishTime,
          approvedBy,
          approvedAt,
          lifecycleStatus,
        } = req.body || {};

        // Security Validation: Must be approved to publish
        if (lifecycleStatus !== 'APROBADO') {
          return res.status(400).json({
            error: 'Contenido no aprobado. La publicación debe estar en estado APROBADO antes de enviarse a Meta.',
          });
        }

        if (!headline && !articleTitle) {
          return res.status(400).json({ error: 'La publicación no contiene texto o título.' });
        }

        const targetOrgId = orgId || `org_${uid}`;

        // Org authorization: only administrators/owners of the organization may publish to Meta.
        const hasPermission = await checkUserAdminPermission(uid, targetOrgId);
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Permisos insuficientes: Solo los usuarios con rol de Administrador pueden publicar en redes sociales.',
          });
        }

        const publishResponse = await executeMultiPlatformPublish({
          orgId: targetOrgId,
          orgName: orgName || 'Institución',
          userId: uid,
          userEmail: email,
          approvedBy: approvedBy || email,
          approvedAt: approvedAt || new Date().toISOString(),
          articleTitle: articleTitle || headline,
          category: category || 'Institucional',
          headline: headline || articleTitle,
          subtitle: subtitle || '',
          facebookCaption: facebookCaption || '',
          instagramCaption: instagramCaption || '',
          imageUrl: imageUrl || '',
          format,
          targets,
          scheduledPublishTime,
        });

        return res.json(publishResponse);
      } catch (err: any) {
        console.error('Error executing Meta publish:', err);
        return res.status(400).json({
          error: getClientSafeErrorMessage(err, 'Error al procesar la publicación en redes sociales.'),
        });
      }
    });

    // Retry a specific failed platform
    app.post('/api/meta/publish/retry', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const email = req.user!.email;
        const { orgId, publicationId, platform } = req.body || {};

        if (!orgId || !publicationId || !platform) {
          return res.status(400).json({ error: 'Faltan parámetros requeridos (orgId, publicationId, platform).' });
        }

        // Org authorization: only administrators/owners of the organization may retry Meta publications.
        const userId = req.user!.uid;
        const hasPermission = await checkUserAdminPermission(userId, orgId);
        if (!hasPermission) {
          return res.status(403).json({
            error: 'Permisos insuficientes: Solo los usuarios con rol de Administrador pueden reintentar publicaciones en redes sociales.',
          });
        }

        const result = await retryPlatformPublish(orgId, publicationId, platform, email);
        return res.json({ success: result.status === 'published', result });
      } catch (err: any) {
        console.error('Error retrying publish:', err);
        return res.status(400).json({ error: getClientSafeErrorMessage(err, 'Error al reintentar la publicación.') });
      }
    });

    // Publication History for Organization
    app.get('/api/meta/history', verifyFirebaseAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const orgId = (req.query.orgId as string) || `org_${req.user!.uid}`;
        const db = getAdminDb();
        const pubsRef = db.collection(`organizations/${orgId}/publications`);
        const snapshot = await pubsRef.orderBy('createdAt', 'desc').limit(50).get();

        const publications: any[] = [];
        snapshot.forEach((doc) => {
          publications.push({ id: doc.id, ...doc.data() });
        });

        return res.json({ publications });
      } catch (err: any) {
        console.error('Error fetching publication history:', err);
        return res.status(500).json({ error: 'Error al obtener el historial de publicaciones.' });
      }
    });

    // ==========================================
    // ARTICLE EXTRACTION (FREE, NO CREDITS REQUIRED)
    // ==========================================

    app.post('/api/extract', async (req, res) => {
      try {
        const { url, rawText, docTitle, importType } = req.body || {};
        const maxChars = getOptionalNumberEnv('MAX_ARTICLE_INPUT_CHARS', 60000);

        // Case 1: Direct Raw Text or Document input
        if (importType === 'text' || importType === 'document' || (rawText && rawText.length > 20)) {
          if (rawText && rawText.length > maxChars) {
            return res.status(400).json({
              error: `El texto ingresado supera el límite máximo permitido de ${maxChars.toLocaleString()} caracteres.`,
            });
          }

          const title = docTitle || rawText.split('\n')[0].substring(0, 100) || 'Comunicado Oficial Importado';
          const paragraphs = rawText.split('\n\n').filter((p: string) => p.trim().length > 0);
          const subtitle = paragraphs.length > 1 ? paragraphs[1].substring(0, 200) : paragraphs[0].substring(0, 150);

          return res.json({
            url: '',
            title: title.trim(),
            subtitle: subtitle.trim(),
            content: rawText,
            mainImage: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=80',
            category: 'Comunicado',
            publishedAt: new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }),
            author: 'Redacción Oficial',
            publisher: 'Organización',
            importSourceType: importType || 'text',
          });
        }

        // Case 2: URL Scraping
        if (!url || typeof url !== 'string') {
          return res.status(400).json({ error: 'Se requiere una URL válida o un texto de noticia.' });
        }

        const cleanUrl = url.trim();

        if (!isUrlSafe(cleanUrl)) {
          return res.status(400).json({
            error: 'La URL proporcionada no es válida o apunta a una dirección IP privada / no permitida.',
          });
        }

        // Check if URL matches any sample news items
        const sampleMatch = SAMPLE_NEWS.find(
          (item) => cleanUrl.toLowerCase().includes(item.id.toLowerCase()) || cleanUrl.toLowerCase() === item.url.toLowerCase()
        );

        if (sampleMatch) {
          return res.json({
            url: sampleMatch.url,
            title: sampleMatch.title,
            subtitle: sampleMatch.subtitle,
            content: sampleMatch.content,
            mainImage: sampleMatch.mainImage,
            category: sampleMatch.category,
            publishedAt: sampleMatch.publishedAt,
            author: sampleMatch.author,
            publisher: sampleMatch.publisher,
            importSourceType: 'url',
          });
        }

        // Helper for Gemini fallback extraction when direct fetch/scraping is blocked by anti-bot/WAF
        async function extractWithGeminiFallback(targetUrl: string) {
            const fallbackUser = await authenticateRequest(req).catch((error) => {
            (error as any).code = 'UNAUTHORIZED';
            throw error;
          });

          let domain = '';
          let cleanedSlug = '';
          try {
            const urlObj = new URL(targetUrl);
            domain = urlObj.hostname.replace(/^www\./, '');
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            const rawSlug = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
            cleanedSlug = rawSlug
              .replace(/\.(html?|php|asp|aspx)$/i, '')
              .replace(/[-_]+/g, ' ')
              .replace(/[^\w\s\u00C0-\u024F]/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim();
          } catch (e) {
            console.warn('[EXTRACT] Could not parse URL components:', e);
          }

          const searchQuery = cleanedSlug && cleanedSlug.length > 4
            ? `noticia "${cleanedSlug}" portal ${domain}`
            : `noticia ${domain} ${targetUrl}`;

          console.log('[EXTRACT] Search query generated:', searchQuery);

          const prompt = `
Eres un asistente periodístico profesional especializado en la extracción y estructuración de noticias.
El servidor no pudo descargar el HTML directamente de la noticia.

URL de la noticia: ${targetUrl}
Tema/Título derivado del enlace: "${cleanedSlug || domain}"
Dominio del medio: "${domain}"

Consulta de búsqueda a realizar: ${searchQuery}

Instrucciones:
1. Utiliza la herramienta de búsqueda para localizar e interpretar el artículo periodístico real y público correspondiente a esta noticia en el medio ${domain}.
2. Identifica la información periodística auténtica sin inventar o fabricar datos.
3. Responde EXCLUSIVAMENTE con un objeto JSON válido (sin marcas de código markdown ni texto adicional) con esta estructura exacta:
{
  "title": "Título completo e informativo del artículo",
  "subtitle": "Bajada, copete o resumen breve (1 a 2 oraciones)",
  "content": "Cuerpo completo de la noticia, con párrafos desarrollados",
  "publisher": "Nombre oficial del medio o portal digital",
  "mainImage": "URL directa de la imagen principal si existe (debe empezar con http:// o https://) o null",
  "category": "Categoría o sección de la noticia (ej: Política, Economía, Sociedad, Deportes, etc.)",
  "publishedAt": "Fecha de publicación",
  "author": "Nombre del redactor o Redacción"
}
`;

          let response: any = null;
          try {
            const generation = await runTrackedGeminiOperation({
              user: fallbackUser,
              operation: 'extract-fallback',
              requestConfig: {
              contents: prompt,
              config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
              },
              },
              transform: (geminiResponse) => geminiResponse,
            });
            response = generation.result;
          } catch (geminiErr: any) {
            throw geminiErr;
          }

          let text = response?.text || '';
          text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch (jsonErr) {
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
              parsed = JSON.parse(match[0]);
            } else {
              throw jsonErr;
            }
          }

          if (!parsed || !parsed.title || String(parsed.title).trim().length < 5 || !parsed.content || String(parsed.content).trim().length < 30) {
            throw new Error('Gemini fallback no pudo obtener suficiente contenido verificado del artículo');
          }

          const titleLower = String(parsed.title).toLowerCase();
          if (titleLower.includes('error al acceder') || titleLower.includes('no fue posible') || titleLower.includes('restricciones de acceso')) {
            throw new Error('El artículo no fue accesible mediante la búsqueda');
          }

          let publisher = parsed.publisher || '';
          if (!publisher) {
            try {
              publisher = domain.split('.')[0];
              publisher = publisher.charAt(0).toUpperCase() + publisher.slice(1);
            } catch {
              publisher = 'Medio Digital';
            }
          }

          // The platform works exclusively with user uploaded images, not automatic 3rd party image scraping
          const mainImage = '';

          return {
            url: targetUrl,
            title: String(parsed.title).trim(),
            subtitle: parsed.subtitle ? String(parsed.subtitle).trim() : '',
            content: String(parsed.content).trim(),
            mainImage,
            category: parsed.category ? String(parsed.category).trim().substring(0, 25) : 'General',
            publishedAt: parsed.publishedAt ? String(parsed.publishedAt).trim() : new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }),
            author: parsed.author ? String(parsed.author).trim() : `Redacción ${publisher}`,
            publisher: String(publisher).trim(),
            importSourceType: 'url',
          };
        }

        // Scraping live URL with fetch + cheerio
        let html = '';
        let fetchSuccess = false;
        console.log('[DIAGNOSTIC] [POST /api/extract] Starting extraction for URL:', cleanUrl);
        try {
          const urlOrigin = new URL(cleanUrl).origin;
          const fetchRes = await fetcher(cleanUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'es-AR,es-ES;q=0.9,es;q=0.8,en;q=0.7',
              Referer: `${urlOrigin}/`,
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
            },
            signal: AbortSignal.timeout(10000), // 10 sec timeout
          });

          console.log('[DIAGNOSTIC] [POST /api/extract] HTTP fetch completed. Status:', fetchRes.status, fetchRes.statusText, 'Content-Type:', fetchRes.headers.get('content-type'));

          if (!fetchRes.ok) {
            throw new Error(`HTTP Error ${fetchRes.status}: ${fetchRes.statusText}`);
          }
          html = await fetchRes.text();
          console.log('[DIAGNOSTIC] [POST /api/extract] Downloaded HTML length:', html.length);
          fetchSuccess = true;
        } catch (fetchErr: any) {
          console.error('[DIAGNOSTIC] [POST /api/extract] Direct fetch failed:', {
            endpoint: '/api/extract',
            url: cleanUrl,
            errorName: fetchErr.name,
            errorMessage: fetchErr.message,
            errorCode: fetchErr.code,
          });

          // Attempt Gemini Fallback on fetch error
          console.log('[EXTRACT] Direct fetch failed. Attempting Gemini fallback...');
          try {
            const fallbackResult = await extractWithGeminiFallback(cleanUrl);
            console.log('[EXTRACT] fallback: Gemini | fallback success: true');
            return res.json(fallbackResult);
          } catch (fallbackErr: any) {
            if (fallbackErr?.code === 'UNAUTHORIZED') {
              return res.status(401).json({ code: 'UNAUTHORIZED', error: 'Debe iniciar sesión para usar la extracción asistida por IA.' });
            }
            console.error('[EXTRACT] fallback: Gemini | fallback failed:', fallbackErr?.message || fallbackErr);
            return res.status(422).json({
              error: 'No fue posible interpretar correctamente esta noticia. Verifique que la URL sea pública y accesible, o intente ingresando el texto del comunicado directamente.',
            });
          }
        }

        const $ = cheerio.load(html);

        // Clean HTML Content
        $('script, style, iframe, nav, header, footer, noscript, svg, form, .ads, .advertisement, #comments, .banner, .related, .social-share, aside, .widget, .pop-up, .sidebar, .comments, .footer, .header, .menu, .nav, .ad, .share-buttons').remove();

        let publisher = $('meta[property="og:site_name"]').attr('content') ||
                        $('meta[name="twitter:site"]').attr('content') ||
                        '';
        if (!publisher) {
          try {
            publisher = new URL(cleanUrl).hostname.replace('www.', '').split('.')[0];
            publisher = publisher.charAt(0).toUpperCase() + publisher.slice(1);
          } catch {
            publisher = 'Medio Digital';
          }
        }

        let title = $('meta[property="og:title"]').attr('content') ||
                    $('meta[name="twitter:title"]').attr('content') ||
                    $('h1.entry-title, h1.post-title, h1.story-title, h1.title, h1').first().text().trim() ||
                    $('title').text().trim();

        if (title.includes('|')) title = title.split('|')[0].trim();
        if (title.includes(' - ')) title = title.split(' - ')[0].trim();

        let subtitle = $('meta[property="og:description"]').attr('content') ||
                       $('meta[name="description"]').attr('content') ||
                       $('meta[name="twitter:description"]').attr('content') ||
                       $('.bajada, .excerpt, .lead, h2').first().text().trim() ||
                       '';

        // Automatic third-party image scraping disabled by platform policy - user uploads official image
        const mainImage = '';

        let category = $('meta[property="article:section"]').attr('content') ||
                       $('.category, .section-name, .breadcrumb, a[rel="category"]').first().text().trim() ||
                       'General';

        if (category.length > 25) category = category.substring(0, 25);

        let publishedAt = $('meta[property="article:published_time"]').attr('content') ||
                          $('time').first().attr('datetime') ||
                          $('time').first().text().trim() ||
                          new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

        let author = $('meta[name="author"]').attr('content') ||
                     $('meta[property="article:author"]').attr('content') ||
                     $('.author, .byline, .autor').first().text().trim() ||
                     `Redacción ${publisher}`;

        let paragraphTexts: string[] = [];
        $('article p, main p, .entry-content p, .post-content p, .story-body p, .cuerpo-nota p, #cuerpo-nota p, .nota-body p, p').each((_, el) => {
          const text = $(el).text().trim();
          if (text.length > 35 && !text.toLowerCase().includes('copyright') && !text.toLowerCase().includes('todos los derechos reservados')) {
            paragraphTexts.push(text);
          }
        });

        let content = paragraphTexts.join('\n\n');
        if (!content || content.length < 50) {
          content = subtitle;
        }

        console.log('[DIAGNOSTIC] [POST /api/extract] Parsing results:', {
          titleLength: title ? title.length : 0,
          titleText: title ? title.substring(0, 50) : '',
          contentLength: content ? content.length : 0,
          paragraphCount: paragraphTexts.length,
          publisher,
        });

        if (!title || title.length < 5 || !content || content.length < 40) {
          console.warn('[DIAGNOSTIC] [POST /api/extract] Direct scraping parsing insufficient. Attempting Gemini fallback...');
          try {
            const fallbackResult = await extractWithGeminiFallback(cleanUrl);
            console.log('[EXTRACT] fallback: Gemini | fallback success: true');
            return res.json(fallbackResult);
          } catch (fallbackErr: any) {
            if (fallbackErr?.code === 'UNAUTHORIZED') {
              return res.status(401).json({ code: 'UNAUTHORIZED', error: 'Debe iniciar sesión para usar la extracción asistida por IA.' });
            }
            console.error('[EXTRACT] fallback: Gemini | fallback failed:', fallbackErr?.message || fallbackErr);
            return res.status(422).json({
              error: 'No fue posible interpretar correctamente esta noticia. La página no contiene un artículo público legible o requiere suscripción privada.',
            });
          }
        }

        return res.json({
          url: cleanUrl,
          title: title.trim(),
          subtitle: subtitle.trim(),
          content: content.trim(),
          mainImage,
          category: category.trim(),
          publishedAt,
          author: author.trim(),
          publisher: publisher.trim(),
          importSourceType: 'url',
        });
      } catch (err: any) {
        console.error('Error extracting news:', err);
        return res.status(500).json({ error: 'Error al procesar la noticia. Revisa los datos ingresados.' });
      }
    });

    // ==========================================
    // AI ENDPOINTS (CREDIT CONSUMPTION ENFORCED)
    // ==========================================

    // API Route: AI Automatic Template & Bounding Box Analysis (Cost: 3 Credits)
    app.post('/api/analyze-template-image', verifyAuth as any, async (req: AuthenticatedRequest, res) => {
      const { imageBase64, sampleCount, categoryName, templateName, orgName } = req.body || {};
      try {
        const contentsPrompt = `
Eres un Ingeniero Senior de Visión por Computadora y Diseño Editorial.
Analiza la siguiente imagen o conjunto de ${sampleCount || 1} publicaciones/plantillas de la organización "${orgName || 'Medio Oficial'}".

OBJETIVO:
Detectar la composición visual completa y mapear EXACTAMENTE las zonas delimitadas (cajas/bounding boxes) de cada elemento para construir una PLANTILLA OFICIAL EDITABLE.

Reglas de Análisis:
1. Identifica el color primario (HEX) y secundario/fondo (HEX).
2. Detecta la tipografía predominante estimada (ej: "Montserrat, sans-serif", "Inter, sans-serif", "Space Grotesk, sans-serif").
3. Calcula las coordenadas en PORCENTAJES (0 a 100) para x, y, width, height de las cajas principales:
   - "titleBox": Zona del título principal.
   - "subtitleBox": Zona de la bajada / subtítulo.
   - "imageBox": Zona de la foto o imagen principal.
   - "logoBox": Zona del logotipo institucional.
   - "categoryBox": Zona de la etiqueta / categoría / sección.
   - "dateBox": Zona de fecha, autor o firma del medio.
4. Genera el listado completo de "elements" interactivos con sus tipos:
   "title", "subtitle", "image", "logo", "category", "date", "author", "footer", "free_text".

SI SE ANALIZARON MÚLTIPLES PUBLICACIONES:
Confirma la frase explicativa: "Estas publicaciones comparten un mismo diseño institucional."

DEBES RESPONDER EXCLUSIVAMENTE EN FORMATO JSON CON ESTA ESTRUCTURA EXACTA:
{
  "name": "${templateName || 'Plantilla Oficial Detectada'}",
  "description": "Plantilla institucional analizada automáticamente con zonas delimitadas fijas.",
  "associatedCategories": ["${categoryName || 'General'}", "Política", "Actualidad"],
  "socialNetwork": "Instagram Feed",
  "primaryColor": "#2563eb",
  "secondaryColor": "#090d16",
  "fontFamily": "Montserrat, sans-serif",
  "borderRadiusPx": 16,
  "analysisSummary": "Estas publicaciones comparten un mismo diseño institucional con zona inferior de lectura y foto superior centrada.",
  "titleBox": { "x": 5, "y": 68, "width": 90, "height": 18 },
  "subtitleBox": { "x": 5, "y": 86, "width": 90, "height": 9 },
  "imageBox": { "x": 0, "y": 12, "width": 100, "height": 54 },
  "logoBox": { "x": 72, "y": 3, "width": 24, "height": 7 },
  "categoryBox": { "x": 4, "y": 3, "width": 32, "height": 6 },
  "dateBox": { "x": 5, "y": 95, "width": 90, "height": 4 },
  "elements": []
}
`;

        const contents: any[] = [];
        if (imageBase64 && imageBase64.includes('data:image')) {
          const mimeType = imageBase64.substring(imageBase64.indexOf(':') + 1, imageBase64.indexOf(';'));
          const base64Data = imageBase64.split(',')[1];
          contents.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
        contents.push(contentsPrompt);

        const generation = await runTrackedGeminiOperation({
          user: req.user!, operation: 'analyze-template-image',
          requestConfig: { contents, config: { responseMimeType: 'application/json', temperature: 0.1 } },
          transform: (response) => JSON.parse(response.text || '{}'),
        });
        return res.json(generation.result);
      } catch (err: any) {
        return sendAiError(res, err, 'Error al analizar la imagen de plantilla.');
      }
    });

    // API Route: Custom Media Reference Template Zone Analysis
    app.post('/api/analyze-custom-template', verifyAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const { imageBase64 } = req.body || {};
        if (!imageBase64) {
          return res.status(400).json({ error: 'Se requiere la imagen de referencia en formato base64.' });
        }

        const fallbackData = {
          canvas: { width: 1080, height: 1080 },
          elements: [
            { type: 'logo', x: 0.08, y: 0.05, width: 0.20, height: 0.08 },
            { type: 'category', x: 0.08, y: 0.28, width: 0.35, height: 0.05 },
            { type: 'title', x: 0.08, y: 0.36, width: 0.84, height: 0.24 },
            { type: 'subtitle', x: 0.08, y: 0.63, width: 0.80, height: 0.14 },
            { type: 'image', x: 0.0, y: 0.12, width: 1.0, height: 0.24 },
            { type: 'domain', x: 0.08, y: 0.90, width: 0.35, height: 0.05 },
          ],
        };

        try {
          const prompt = `
Eres un experto en visión por computadora e infografía periodística.
Analiza la imagen de la publicación adjunta para detectar las principales zonas de contenido.

DEBES identificar e inferir las coordenadas relativas (normalizadas entre 0.0 y 1.0) para las siguientes zonas si están presentes:
- "logo": Isotipo, logotipo o isotipo del medio.
- "category": Sección, etiqueta o temática (ej: "POLÍTICA", "SOCIEDAD", "DEPORTES").
- "title": Titular principal o frase destacada.
- "subtitle": Bajada, copete o texto secundario explicativo.
- "image": Foto principal, ilustración o área visual predominante.
- "domain": Dirección web, red social, marca de agua o firma del medio.

Reglas:
1. Las coordenadas "x", "y", "width", "height" DEBEN ser NÚMEROS DECIMALES NORMALIZADOS entre 0.0 y 1.0 (relativos al ancho y alto total de la imagen).
2. "x" e "y" representan la esquina superior izquierda de cada zona (0.0 = borde izquierdo/superior, 1.0 = borde derecho/inferior).
3. "width" y "height" representan el ancho y alto relativos de cada zona (0.0 a 1.0).

DEBES RESPONDER EXCLUSIVAMENTE UN OBJETO JSON CON ESTA ESTRUCTURA EXACTA (sin markdown ni explicaciones adicionales):
{
  "canvas": {
    "width": 1080,
    "height": 1080
  },
  "elements": [
    {
      "type": "logo",
      "x": 0.08,
      "y": 0.05,
      "width": 0.18,
      "height": 0.08
    },
    {
      "type": "category",
      "x": 0.08,
      "y": 0.30,
      "width": 0.40,
      "height": 0.05
    },
    {
      "type": "title",
      "x": 0.08,
      "y": 0.38,
      "width": 0.84,
      "height": 0.22
    },
    {
      "type": "subtitle",
      "x": 0.08,
      "y": 0.64,
      "width": 0.80,
      "height": 0.12
    },
    {
      "type": "image",
      "x": 0.0,
      "y": 0.12,
      "width": 1.0,
      "height": 0.25
    },
    {
      "type": "domain",
      "x": 0.08,
      "y": 0.90,
      "width": 0.30,
      "height": 0.04
    }
  ]
}
`;

          const contents: any[] = [];
          if (imageBase64.includes('data:image')) {
            const mimeType = imageBase64.substring(imageBase64.indexOf(':') + 1, imageBase64.indexOf(';'));
            const base64Data = imageBase64.split(',')[1];
            contents.push({
              inlineData: {
                mimeType,
                data: base64Data,
              },
            });
          }
          contents.push(prompt);

          const generation = await runTrackedGeminiOperation({
            user: req.user!, operation: 'analyze-custom-template',
            requestConfig: { contents, config: { responseMimeType: 'application/json', temperature: 0.1 } },
            transform: (response) => response,
          });

          let text = generation.result.text || '';
          text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(text);

          if (parsed && Array.isArray(parsed.elements) && parsed.elements.length > 0) {
            return res.json(parsed);
          }
          return res.json(fallbackData);
        } catch (geminiErr) {
          console.warn('Gemini vision analysis failed for custom template, using intelligent fallback layout:', geminiErr);
          return res.json(fallbackData);
        }
      } catch (err: any) {
        console.error('Error in /api/analyze-custom-template:', err);
        return res.status(500).json({ error: 'Error procesando la plantilla.' });
      }
    });

    // API Route: AI Visual Identity Pattern Analysis (Cost: 2 Credits)
    app.post('/api/analyze-identity-visual', verifyAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const { imagesCount, orgName } = req.body || {};

        const prompt = `
Analiza un lote de ${imagesCount || 25} publicaciones/imágenes anteriores subidas por la organización "${orgName || 'Medio/Empresa'}".
Extrae las reglas visuales y de composición gráfica para construir un Perfil de Identidad Visual preciso.

NO copies imágenes específicas. Identifica patrones recurrentes:
1. Colores predominantes: color principal (hex) y secundario (hex).
2. Ubicación del logo.
3. Ubicación de la categoría.
4. Tipografía estimada.
5. Tamaño de título en palabras máximo recomendadas.
6. Cantidad de líneas de subtítulo recomendadas.
7. Proporción imagen / texto.
8. Radio de esquinas.
9. Estilo de bordes y sombras.
10. Estilo de composición gráfica general.
11. Plantillas / estilos detectados según temática.
12. Porcentaje de confianza del análisis.

DEBES RESPONDER EXCLUSIVAMENTE EN FORMATO JSON CON ESTA ESTRUCTURA EXACTA:
{
  "logoDetected": true,
  "logoPosition": "Inferior Derecha",
  "categoryPosition": "Superior Izquierda",
  "primaryColor": "#FF6A00",
  "secondaryColor": "#1B1B1B",
  "estimatedFont": "Montserrat ExtraBold",
  "maxTitleWords": 8,
  "maxSubtitleLines": 2,
  "imageRatioPercent": 65,
  "textRatioPercent": 35,
  "borderRadiusPx": 12,
  "borderStyle": "1px solid rgba(255,106,0,0.4)",
  "shadowStyle": "0 10px 25px -5px rgba(0,0,0,0.5)",
  "compositionStyle": "Bloque inferior oscuro con acento naranja y título de alta legibilidad",
  "visualConfidence": 96,
  "templateVariants": []
}
`;

        const generation = await runTrackedGeminiOperation({
          user: req.user!, operation: 'analyze-identity-visual',
          requestConfig: { contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.2 } },
          transform: (response) => JSON.parse(response.text || '{}'),
        });
        return res.json(generation.result);
      } catch (err: any) {
        return sendAiError(res, err, 'Error al analizar la identidad visual.');
      }
    });

    // API Route: AI Editorial Identity Pattern Analysis (Cost: 2 Credits)
    app.post('/api/analyze-identity-editorial', verifyAuth as any, async (req: AuthenticatedRequest, res) => {
      try {
        const { textSamples, orgName } = req.body || {};

        const prompt = `
Analiza las siguientes publicaciones/captions anteriores subidas por la organización "${orgName || 'Medio'}":

TEXTOS DE MUESTRA:
${textSamples || 'No hay muestras directas'}

Extrae las reglas editoriales y el tono de voz de la organización.
RESPONDE EXCLUSIVAMENTE EN FORMATO JSON CON ESTA ESTRUCTURA:
{
  "tone": "Periodístico riguroso y conciso",
  "formalityLevel": "Alta",
  "averageParagraphs": 2,
  "emojiUsage": "Moderado",
  "hashtagStyle": "#Noticias #Misiones #Economia",
  "callToAction": "Lee la cobertura completa en el enlace del perfil",
  "writingStyleSummary": "Comienza con datos duros y síntesis ejecutiva, seguido de contexto oficial.",
  "editorialConfidence": 97
}
`;

        const generation = await runTrackedGeminiOperation({
          user: req.user!, operation: 'analyze-identity-editorial',
          requestConfig: { contents: prompt, config: { responseMimeType: 'application/json', temperature: 0.2 } },
          transform: (response) => JSON.parse(response.text || '{}'),
        });
        return res.json(generation.result);
      } catch (err: any) {
        return sendAiError(res, err, 'Error al analizar la identidad editorial.');
      }
    });

    // API Route: AI Social Posts Generation with Gemini (Cost: 1 Credit)
    app.post('/api/generate-posts', verifyAuth as any, async (req: AuthenticatedRequest, res) => {
      const { article, identity } = req.body || {};
      try {
        if (!article || !article.title) {
          return res.status(400).json({ error: 'Datos de la noticia incompletos.' });
        }

        const hasIdentity = identity && identity.visual;
        const visualDNA = hasIdentity ? identity.visual : null;
        const editorialDNA = hasIdentity ? identity.editorial : null;

        const systemInstruction = `
Eres el EDITOR IA al frente de la redacción periodística de "${identity?.name || article.publisher || 'Medio Digital'}".

REGLA FUNDAMENTAL DE ARQUITECTURA:
- La IA SOLAMENTE escribe y edita texto.
- NUNCA diseñas, NUNCA decides colores, NUNCA defines posiciones, NUNCA creas plantillas.
- Tu único rol visual es analizar la noticia (tema, categoría, tipo de contenido) y SUGERIR qué plantilla oficial de la organización debe utilizarse.

${hasIdentity ? `
=========================================
PERFIL Y PLANTILLAS DE LA ORGANIZACIÓN:
=========================================
Nombre: ${identity.name} (${identity.orgType || 'Organización'})
Tono Editorial: ${editorialDNA?.tone || 'Objetivo y profesional'}
Nivel de Formalidad: ${editorialDNA?.formalityLevel || 'Alta'}
Promedio de Párrafos: ${editorialDNA?.averageParagraphs || 2}
Uso de Emojis: ${editorialDNA?.emojiUsage || 'Moderado'}
Estilo de Hashtags: ${editorialDNA?.hashtagStyle || 'Directos'}
` : ''}

REGLAS STRICTAS DE PERIODISMO Y EDICIÓN:
1. NUNCA inventes información que no esté en el texto proporcionado.
2. NUNCA cambies cifras, porcentajes o montos financieros.
3. NUNCA modifiques fechas ni nombres propios de personas o instituciones.
4. NUNCA agregues contexto externo o suposiciones que no existan en el texto fuente.
5. NUNCA emitas opiniones personales, valoraciones ideológicas o juicios de valor.
6. NUNCA uses clickbait ni lenguaje sensacionalista o exagerado.
7. Mantén un tono strictly alineado con la voz periodística de la organización.
8. Prioriza siempre el dato o acontecimiento principal (la "pirámide invertida").

REGLAS DE FORMATO Y CONTENIDO:
• "feed.headline": Titular para la placa oficial (máximo 8-10 palabras).
• "feed.subtitle": Resumen conciso de la noticia en 1 sola oración corta.
• "story.headline": Titular directo adaptado a formato Historia (9:16).
• "story.subtitle": Bajada breve para Historia.
• "instagram.caption": Redactado con el tono "${editorialDNA?.tone || 'Periodístico'}".
• "facebook.caption": Más desarrollado e informativo.
• "linkedin.caption": Tono profesional.
• "hashtags": Generar entre 3 y 6 hashtags directamente relevantes.
• "keywords": Extraer 4 a 8 palabras clave.
• "priority": Clasificar la urgencia como: "Alta", "Media" o "Baja".
• "confidence": Porcentaje entero de certeza (ej: 98).
• "identityMatchScore": Calcular la afinidad con la redacción (ej: 96).
• "suggested_template": Nombre de la plantilla sugerida.
• "appliedTemplateName": Repetir el nombre de la plantilla seleccionada.

RESPONDE EXCLUSIVAMENTE CON EL OBJETO JSON SOLICITADO, SIN MARKDOWN.
`;

        const promptText = `
TRANSFORMA LA SIGUIENTE NOTICIA EN PUBLICACIONES ADAPTADAS A LA IDENTIDAD DE ${identity?.name || article.publisher || 'LA ORGANIZACIÓN'}:

FUENTE / EMISOR: ${article.publisher || identity?.name || 'Organización'}
TÍTULO ORIGINAL: ${article.title}
SUBTÍTULO / BAJADA ORIGINAL: ${article.subtitle || 'Sin bajada'}
CATEGORÍA: ${article.category || 'General'}
FECHA: ${article.publishedAt || 'Reciente'}
AUTOR: ${article.author || 'Redacción'}

CONTENIDO COMPLETO DE LA NOTICIA:
${article.content}
`;

        const responseSchema = {
          type: Type.OBJECT,
          properties: {
            feed: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                headline: { type: Type.STRING },
                subtitle: { type: Type.STRING },
              },
              required: ['category', 'headline', 'subtitle'],
            },
            story: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING },
                subtitle: { type: Type.STRING },
              },
              required: ['headline', 'subtitle'],
            },
            instagram: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
              },
              required: ['caption'],
            },
            facebook: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
              },
              required: ['caption'],
            },
            linkedin: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
              },
              required: ['caption'],
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            priority: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            identityMatchScore: { type: Type.NUMBER },
            appliedTemplateName: { type: Type.STRING },
            suggested_template: { type: Type.STRING },
          },
          required: [
            'feed',
            'story',
            'instagram',
            'facebook',
            'linkedin',
            'hashtags',
            'keywords',
            'priority',
            'confidence',
            'identityMatchScore',
            'appliedTemplateName',
            'suggested_template',
          ],
        };

        const generation = await runTrackedGeminiOperation({
          user: req.user!, operation: 'generate-posts', commercial: true,
          idempotencyKey: req.header('Idempotency-Key'),
          requestConfig: {
            contents: promptText,
            config: { systemInstruction, responseMimeType: 'application/json', responseSchema, temperature: 0.2 },
          },
          transform: (response) => JSON.parse(response.text?.trim() || ''),
        });

        return res.json({
          ...generation.result,
          creditsRemaining: generation.remainingPublications,
          generationId: generation.generationId,
          idempotencyKeyGenerated: generation.generatedIdempotencyKey,
        });
      } catch (err: any) {
        return sendAiError(res, err, 'Error al generar publicaciones con IA.');
      }
    });

    // Health route
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', app: 'NewsFlow AI', timestamp: new Date().toISOString() });
    });

    // Serve Vite in development mode or Static files in production
    if (dependencies.skipStatic) {
      return app;
    }

    if (process.env.NODE_ENV === 'production') {
      if (process.env.SERVE_STATIC === 'true') {
        const cwdDist = path.join(process.cwd(), 'dist');
        const localDist = path.resolve(currentDir, 'dist');
        const staticPath = fs.existsSync(cwdDist)
          ? cwdDist
          : fs.existsSync(localDist)
          ? localDist
          : currentDir;

        console.log(`📦 Production mode active. Serving static files from: ${staticPath}`);
        app.use(express.static(staticPath));

        app.get('*', (req, res) => {
          const indexPath = path.join(staticPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).send('Aplicación no encontrada en producción.');
          }
        });
      } else {
        console.log('📦 Production mode active. API-only mode (set SERVE_STATIC=true to serve the built SPA).');
      }
    } else {
      console.log('⚡ Development mode active. Mounting Vite middleware.');
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }

    return app;
  } catch (error) {
    throw error;
  }
}

async function startServer() {
  validateServerStartupEnv();
  const app = await createApp();
  const port = getOptionalNumberEnv('PORT', 8080);
  app.listen(port, '0.0.0.0', () => {
    console.log(`NewsFlow AI server listening on http://0.0.0.0:${port} (PORT env: ${process.env.PORT || 'default 8080'})`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal error during server initialization:', err);
    process.exit(1);
  });
}
