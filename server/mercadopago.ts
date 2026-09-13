import crypto from 'crypto';
import { getPlansCatalog, getCreditPacksCatalog, BillingProfile } from './billing';
import { getAdminDb } from './firebase-admin';
import { getOptionalServerEnv, requireServerEnv } from './config/env';

const MP_API_BASE = 'https://api.mercadopago.com';

function getMpAccessToken(): string {
  return requireServerEnv('MERCADOPAGO_ACCESS_TOKEN', 'Required to use Mercado Pago on the server.');
}

function getAppUrl(): string {
  let url = requireServerEnv('APP_URL', 'Required to build Mercado Pago return and webhook URLs.');
  if (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

/**
 * Creates a monthly or annual subscription via Mercado Pago Preapproval API.
 */
export async function createSubscriptionPreference(
  uid: string,
  email: string,
  planId: string,
  billingCycle: 'monthly' | 'annual' = 'monthly'
) {
  const plans = getPlansCatalog();
  const plan = plans.find((p) => p.id === planId);
  if (!plan) {
    throw new Error('El plan seleccionado no existe en el catálogo.');
  }

  const token = getMpAccessToken();
  if (!token) {
    throw new Error('Mercado Pago no está configurado en el servidor.');
  }

  const appUrl = getAppUrl();
  const db = getAdminDb();

  // Check if user already has an active subscription
  const userDoc = await db.collection('billingUsers').doc(uid).get();
  if (userDoc.exists) {
    const profile = userDoc.data() as BillingProfile;
    if (['authorized', 'pending'].includes(profile.subscriptionStatus) && profile.subscriptionId) {
      throw new Error('Ya tenés una suscripción activa o pendiente. Podés gestionarla desde tu perfil.');
    }
  }

  const isAnnual = billingCycle === 'annual';
  const price = isAnnual
    ? Math.round(plan.monthlyPrice * 12 * 0.8)
    : plan.monthlyPrice;

  const reason = isAnnual
    ? `NewsFlow AI - Plan ${plan.name} (Anual - 2 meses bonificados)`
    : `NewsFlow AI - Plan ${plan.name} (Mensual)`;

  const body = {
    reason,
    external_reference: `newsflow:subscription:${uid}:${plan.id}:${billingCycle}`,
    payer_email: email,
    auto_recurring: {
      frequency: isAnnual ? 12 : 1,
      frequency_type: 'months',
      transaction_amount: price,
      currency_id: 'ARS',
    },
    back_url: `${appUrl}/?billing=success`,
    status: 'pending',
  };

  const response = await fetch(`${MP_API_BASE}/preapproval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Mercado Pago preapproval error:', data);
    throw new Error(data.message || 'Error al comunicarse con Mercado Pago para crear la suscripción.');
  }

  // Update profile in Firestore with pending subscription ID
  await db.collection('billingUsers').doc(uid).set(
    {
      planId: plan.id,
      subscriptionStatus: 'pending',
      subscriptionId: data.id || '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return {
    subscriptionId: data.id,
    initPoint: data.init_point || data.sandbox_init_point,
  };
}

/**
 * Creates a Checkout Pro preference for one-time credit pack purchase.
 */
export async function createCreditPackCheckout(uid: string, email: string, packId: string) {
  const packs = getCreditPacksCatalog();
  const pack = packs.find((p) => p.id === packId);
  if (!pack) {
    throw new Error('El paquete de créditos seleccionado no existe.');
  }

  const token = getMpAccessToken();
  if (!token) {
    throw new Error('Mercado Pago no está configurado en el servidor.');
  }

  const appUrl = getAppUrl();

  const body = {
    items: [
      {
        id: pack.id,
        title: `NewsFlow AI - ${pack.name}`,
        quantity: 1,
        unit_price: pack.price,
        currency_id: 'ARS',
      },
    ],
    external_reference: `newsflow:credits:${uid}:${pack.id}`,
    notification_url: `${appUrl}/api/webhooks/mercadopago`,
    back_urls: {
      success: `${appUrl}/?billing=success`,
      pending: `${appUrl}/?billing=pending`,
      failure: `${appUrl}/?billing=failure`,
    },
    auto_return: 'approved',
    statement_descriptor: 'NEWSFLOW AI',
    metadata: {
      uid,
      pack_id: pack.id,
      kind: 'credits',
    },
  };

  const response = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Mercado Pago preference error:', data);
    throw new Error(data.message || 'Error al generar preferencia de pago con Mercado Pago.');
  }

  return {
    checkoutUrl: data.init_point || data.sandbox_init_point,
    preferenceId: data.id,
  };
}

/**
 * Cancels a subscription in Mercado Pago and Firestore.
 */
export async function cancelUserSubscription(uid: string) {
  const db = getAdminDb();
  const userRef = db.collection('billingUsers').doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    throw new Error('Perfil de usuario no encontrado.');
  }

  const profile = userDoc.data() as BillingProfile;
  if (!profile.subscriptionId) {
    throw new Error('No tenés ninguna suscripción activa para cancelar.');
  }

  const token = getMpAccessToken();
  if (token && profile.subscriptionId) {
    try {
      await fetch(`${MP_API_BASE}/preapproval/${profile.subscriptionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });
    } catch (err) {
      console.warn('Failed to update status on Mercado Pago preapproval API:', err);
    }
  }

  const now = new Date().toISOString();
  await userRef.update({
    subscriptionStatus: 'cancelled',
    updatedAt: now,
  });

  return { success: true, message: 'Suscripción cancelada correctamente.' };
}

/**
 * Validates Mercado Pago Webhook HMAC SHA-256 signature.
 */
export function verifyMpWebhookSignature(
  xSignatureHeader: string | undefined,
  xRequestIdHeader: string | undefined,
  dataId: string
): boolean {
  const requireSignature = getOptionalServerEnv('MERCADOPAGO_REQUIRE_SIGNATURE') === 'true';
  const secret = requireSignature
    ? requireServerEnv('MERCADOPAGO_WEBHOOK_SECRET', 'Required when MERCADOPAGO_REQUIRE_SIGNATURE=true.')
    : getOptionalServerEnv('MERCADOPAGO_WEBHOOK_SECRET');

  if (!requireSignature) {
    return true; // Bypassed during test/dev environment if disabled
  }

  if (!xSignatureHeader || !secret) {
    console.warn('Webhook signature verification failed: Missing x-signature header or secret.');
    return false;
  }

  try {
    const parts = xSignatureHeader.split(',');
    let ts = '';
    let v1 = '';

    for (const part of parts) {
      const [key, val] = part.trim().split('=');
      if (key === 'ts') ts = val;
      if (key === 'v1') v1 = val;
    }

    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${xRequestIdHeader || ''};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');

    return calculatedHash === v1;
  } catch (err) {
    console.error('Error verifying MP webhook signature:', err);
    return false;
  }
}

/**
 * Handles incoming webhooks from Mercado Pago safely with idempotency.
 */
export async function processMpWebhookEvent(reqBody: any, reqHeaders: Record<string, any>) {
  const xSignature = reqHeaders['x-signature'] as string | undefined;
  const xRequestId = reqHeaders['x-request-id'] as string | undefined;

  const dataId = reqBody?.data?.id || reqBody?.id || reqBody?.entity_id;
  const type = reqBody?.type || reqBody?.topic || reqBody?.action;

  if (!dataId) {
    return { status: 200, message: 'Evento sin identificador de datos omitido.' };
  }

  // Validate signature if configured
  if (getOptionalServerEnv('MERCADOPAGO_REQUIRE_SIGNATURE') === 'true') {
    const isValid = verifyMpWebhookSignature(xSignature, xRequestId, String(dataId));
    if (!isValid) {
      console.error('⚠️ Firma de Webhook de Mercado Pago inválida.');
      return { status: 401, message: 'Firma de webhook inválida' };
    }
  }

  const token = getMpAccessToken();
  if (!token) {
    console.error('MERCADOPAGO_ACCESS_TOKEN no configurado');
    return { status: 200, message: 'Token no configurado' };
  }

  // Process payment event (One-off credit packs)
  if (type === 'payment' || reqBody?.topic === 'payment') {
    const paymentRes = await fetch(`${MP_API_BASE}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!paymentRes.ok) {
      console.warn(`Payment ${dataId} not found on Mercado Pago API`);
      return { status: 200, message: 'Pago no encontrado en Mercado Pago' };
    }

    const payment = await paymentRes.json();
    if (payment.status !== 'approved') {
      return { status: 200, message: `Estado de pago es ${payment.status}, ignorado.` };
    }

    const externalRef = payment.external_reference || '';
    // Format expected: newsflow:credits:{uid}:{packId} or newsflow:subscription:{uid}:{planId}
    const parts = externalRef.split(':');
    if (parts.length < 4 || parts[0] !== 'newsflow') {
      console.warn('External reference format mismatch:', externalRef);
      return { status: 200, message: 'Referencia externa no reconocida.' };
    }

    const kind = parts[1];
    const uid = parts[2];
    const itemId = parts[3];

    const db = getAdminDb();
    const eventId = `mp_payment_${payment.id}`;
    const eventRef = db.collection('billingEvents').doc(eventId);

    return await db.runTransaction(async (transaction) => {
      const eventDoc = await transaction.get(eventRef);
      if (eventDoc.exists) {
        return { status: 200, message: 'Evento de pago ya procesado previamente.' };
      }

      const userRef = db.collection('billingUsers').doc(uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        return { status: 200, message: 'Usuario no encontrado para acreditar pago.' };
      }

      const profile = userDoc.data() as BillingProfile;
      const now = new Date().toISOString();

      if (kind === 'credits') {
        const packs = getCreditPacksCatalog();
        const pack = packs.find((p) => p.id === itemId);
        if (!pack) {
          return { status: 200, message: 'Paquete de créditos no encontrado.' };
        }

        // Verify exact amount
        if (Number(payment.transaction_amount) < pack.price || payment.currency_id !== 'ARS') {
          console.error('Payment amount mismatch!');
          return { status: 200, message: 'Monto de pago no coincide con el paquete.' };
        }

        const newPurchased = (profile.purchasedCreditsRemaining || 0) + pack.credits;
        transaction.update(userRef, {
          purchasedCreditsRemaining: newPurchased,
          updatedAt: now,
        });

        const ledgerRef = userRef.collection('ledger').doc();
        transaction.set(ledgerRef, {
          type: 'purchase',
          amount: pack.credits,
          description: `Compra: ${pack.name}`,
          metadata: { paymentId: payment.id, packId: pack.id },
          createdAt: now,
        });

        transaction.set(eventRef, {
          eventId,
          processedAt: now,
          type: 'credits_pack',
          metadata: { paymentId: payment.id, uid, packId: pack.id },
        });

        return { status: 200, message: 'Créditos acreditados con éxito.' };
      } else if (kind === 'subscription') {
        const plans = getPlansCatalog();
        const plan = plans.find((p) => p.id === itemId);
        if (!plan) return { status: 200, message: 'Plan no encontrado.' };

        const newMonthly = plan.monthlyCredits;
        const currentEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        transaction.update(userRef, {
          planId: plan.id,
          subscriptionStatus: 'authorized',
          monthlyCreditsRemaining: newMonthly,
          currentPeriodEnd: currentEnd,
          updatedAt: now,
        });

        const ledgerRef = userRef.collection('ledger').doc();
        transaction.set(ledgerRef, {
          type: 'subscription_grant',
          amount: plan.monthlyCredits,
          description: `Cobro Suscripción: Plan ${plan.name}`,
          metadata: { paymentId: payment.id, planId: plan.id },
          createdAt: now,
        });

        transaction.set(eventRef, {
          eventId,
          processedAt: now,
          type: 'subscription_payment',
          metadata: { paymentId: payment.id, uid, planId: plan.id },
        });

        return { status: 200, message: 'Suscripción renovada y créditos acreditados.' };
      }

      return { status: 200, message: 'Tipo de cobro desconocido.' };
    });
  }

  // Process Preapproval/Subscription status updates
  if (
    type === 'subscription_preapproval' ||
    type === 'preapproval' ||
    type === 'subscription_authorized_payment'
  ) {
    const preapprovalRes = await fetch(`${MP_API_BASE}/preapproval/${dataId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!preapprovalRes.ok) {
      return { status: 200, message: 'Suscripción no encontrada en Mercado Pago.' };
    }

    const preapproval = await preapprovalRes.json();
    const externalRef = preapproval.external_reference || '';
    const parts = externalRef.split(':');

    if (parts.length >= 4 && parts[0] === 'newsflow') {
      const uid = parts[2];
      const planId = parts[3];

      const db = getAdminDb();
      const userRef = db.collection('billingUsers').doc(uid);
      const statusMap: Record<string, any> = {
        authorized: 'authorized',
        pending: 'pending',
        paused: 'paused',
        cancelled: 'cancelled',
      };

      const mappedStatus = statusMap[preapproval.status] || 'inactive';
      await userRef.set(
        {
          planId,
          subscriptionId: preapproval.id,
          subscriptionStatus: mappedStatus,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return { status: 200, message: 'Estado de suscripción actualizado.' };
  }

  return { status: 200, message: 'Evento recibido y procesado.' };
}
