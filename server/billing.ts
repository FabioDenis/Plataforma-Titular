import { getAdminEmails, getOptionalNumberEnv } from './config/env';
import { getAdminDb } from './firebase-admin';

export const DEFAULT_TRIAL_PUBLICATION_LIMIT = 3;

export interface BillingProfile {
  uid: string;
  email: string;
  planId: string;
  subscriptionStatus: 'trial' | 'pending' | 'authorized' | 'paused' | 'cancelled' | 'inactive';
  subscriptionId: string;
  monthlyCreditsRemaining: number;
  purchasedCreditsRemaining: number;
  totalCreditsUsed: number;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerMovement {
  id?: string;
  type: 'trial_grant' | 'subscription_grant' | 'purchase' | 'consumption' | 'refund';
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const CREDIT_COSTS = {
  generateSocialPosts: 1,
  analyzeVisualIdentity: 2,
  analyzeEditorialIdentity: 2,
  analyzeGraphicTemplate: 3,
};

export function getPlansCatalog() {
  return [
    {
      id: 'starter',
      name: 'Inicial',
      description: 'Para medios pequeños que publican todos los días.',
      monthlyCredits: getOptionalNumberEnv('PLAN_STARTER_PUBLICATIONS', 150),
      monthlyPrice: getOptionalNumberEnv('PLAN_STARTER_PRICE_ARS', 14900),
      currency: 'ARS',
    },
    {
      id: 'professional',
      name: 'Profesional',
      description: 'Para redacciones con mayor volumen y varios formatos.',
      monthlyCredits: getOptionalNumberEnv('PLAN_PRO_PUBLICATIONS', 600),
      monthlyPrice: getOptionalNumberEnv('PLAN_PRO_PRICE_ARS', 34900),
      currency: 'ARS',
      highlighted: true,
    },
    {
      id: 'newsroom',
      name: 'Redacción',
      description: 'Para equipos que producen contenido de forma intensiva.',
      monthlyCredits: getOptionalNumberEnv('PLAN_NEWSROOM_PUBLICATIONS', 1800),
      monthlyPrice: getOptionalNumberEnv('PLAN_NEWSROOM_PRICE_ARS', 69900),
      currency: 'ARS',
    },
  ];
}

export function getCreditPacksCatalog() {
  return [
    {
      id: 'pack_100',
      name: '100 publicaciones adicionales',
      credits: 100,
      price: getOptionalNumberEnv('PACK_100_PRICE_ARS', 9900),
      currency: 'ARS',
    },
    {
      id: 'pack_500',
      name: '500 publicaciones adicionales',
      credits: 500,
      price: getOptionalNumberEnv('PACK_500_PRICE_ARS', 29900),
      currency: 'ARS',
    },
    {
      id: 'pack_1500',
      name: '1.500 publicaciones adicionales',
      credits: 1500,
      price: getOptionalNumberEnv('PACK_1500_PRICE_ARS', 59900),
      currency: 'ARS',
    },
  ];
}

/**
 * Helper to resolve the correct organization ID for a user.
 */
async function resolveUserOrganizationId(
  uid: string,
  preferredOrgId?: string
): Promise<string> {
  if (preferredOrgId && typeof preferredOrgId === 'string' && preferredOrgId.trim() !== '') {
    return preferredOrgId.trim();
  }

  try {
    const db = getAdminDb();
    const userSnap = await db.collection('users').doc(uid).get();
    if (userSnap.exists && userSnap.data()?.organizationId) {
      return String(userSnap.data()!.organizationId);
    }

    const ownedOrganizations = await db.collection('organizations').where('ownerUid', '==', uid).limit(1).get();
    if (!ownedOrganizations.empty) {
      return ownedOrganizations.docs[0].id;
    }
  } catch {
    // fallback to org_${uid}
  }

  return `org_${uid}`;
}

/**
 * Ensures billing profile & organization defaults exist.
 */
export async function getOrCreateBillingProfile(uid: string, email: string): Promise<BillingProfile> {
  const userOrgId = await resolveUserOrganizationId(uid);
  let limit = DEFAULT_TRIAL_PUBLICATION_LIMIT;
  let used = 0;

  try {
    const db = getAdminDb();
    const orgRef = db.collection('organizations').doc(userOrgId);
    const orgSnap = await orgRef.get();

    if (orgSnap.exists) {
      const data = orgSnap.data() || {};
      limit = data.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
      used = data.publicationUsed ?? 0;
    }
  } catch (e: any) {
    console.warn('[getOrCreateBillingProfile] Firestore Admin error:', e?.message || e);
  }

  const remaining = Math.max(0, limit - used);
  const now = new Date().toISOString();

  return {
    uid,
    email,
    planId: 'free',
    subscriptionStatus: 'trial',
    subscriptionId: '',
    monthlyCreditsRemaining: remaining,
    purchasedCreditsRemaining: 0,
    totalCreditsUsed: used,
    currentPeriodEnd: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Checks publication limit prior to news generation.
 * Does NOT increment publicationUsed here.
 */
export async function consumeCredits(
  uid: string,
  email: string,
  cost: number = 1,
  description: string = '',
  metadata: Record<string, unknown> = {}
): Promise<{ remainingTotal: number; profile: BillingProfile }> {
  const preferredOrgId = (metadata?.targetOrgId as string) || undefined;

  const userOrgId = await resolveUserOrganizationId(uid, preferredOrgId);

  const db = getAdminDb();
  const orgRef = db.collection('organizations').doc(userOrgId);

  try {
    return await db.runTransaction(async (transaction) => {
      const orgSnap = await transaction.get(orgRef);

      let plan = 'trial';
      let publicationLimit = DEFAULT_TRIAL_PUBLICATION_LIMIT;
      let publicationUsed = 0;

      if (!orgSnap.exists) {
        const now = new Date().toISOString();
        transaction.set(orgRef, {
          name: `Medio Digital (${email?.split('@')[0] || 'Oficial'})`,
          ownerUid: uid,
          plan: 'trial',
          publicationLimit: DEFAULT_TRIAL_PUBLICATION_LIMIT,
          publicationUsed: 0,
          createdAt: now,
          status: 'Activa',
          orgType: 'Medio Digital',
        }, { merge: true });
      } else {
        const data = orgSnap.data() || {};
        plan = data.plan || 'trial';
        publicationLimit = data.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
        publicationUsed = data.publicationUsed ?? 0;

        // Auto-initialize missing fields if necessary without deleting existing fields
        if (data.publicationLimit === undefined || data.publicationUsed === undefined || data.plan === undefined) {
          transaction.set(orgRef, {
            plan,
            publicationLimit,
            publicationUsed,
          }, { merge: true });
        }
      }

      if (publicationUsed >= publicationLimit) {
        const err = new Error('Has alcanzado el límite de publicaciones de tu plan.');
        (err as any).code = 'INSUFFICIENT_CREDITS';
        (err as any).statusCode = 402;
        throw err;
      }

      const remainingTotal = Math.max(0, publicationLimit - publicationUsed);
      const now = new Date().toISOString();

      const profile: BillingProfile = {
        uid,
        email,
        planId: plan,
        subscriptionStatus: 'trial',
        subscriptionId: '',
        monthlyCreditsRemaining: remainingTotal,
        purchasedCreditsRemaining: 0,
        totalCreditsUsed: publicationUsed,
        currentPeriodEnd: '',
        createdAt: now,
        updatedAt: now,
      };

      return {
        remainingTotal,
        profile,
      };
    });
  } catch (err: any) {
    if (err.code === 'INSUFFICIENT_CREDITS' || err.statusCode === 402) {
      throw err;
    }

    console.error('❌ [consumeCredits] Firestore Admin error:', err?.message || err);

    // If PERMISSION_DENIED or Firestore Admin authentication issue occurs, fallback gracefully to allow post generation
    if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('permission')) {
      console.warn('⚠️ [consumeCredits] PERMISSION_DENIED detected. Falling back to default trial limits so generation proceeds.');
      const now = new Date().toISOString();
      return {
        remainingTotal: DEFAULT_TRIAL_PUBLICATION_LIMIT,
        profile: {
          uid,
          email,
          planId: 'trial',
          subscriptionStatus: 'trial',
          subscriptionId: '',
          monthlyCreditsRemaining: DEFAULT_TRIAL_PUBLICATION_LIMIT,
          purchasedCreditsRemaining: 0,
          totalCreditsUsed: 0,
          currentPeriodEnd: '',
          createdAt: now,
          updatedAt: now,
        },
      };
    }

    throw err;
  }
}

/**
 * Atomically increments publicationUsed in Firestore ONLY after news generation succeeds.
 */
export async function incrementPublicationCount(
  uid: string,
  targetOrgId?: string
): Promise<number> {
  const userOrgId = await resolveUserOrganizationId(uid, targetOrgId);
  const db = getAdminDb();
  const orgRef = db.collection('organizations').doc(userOrgId);

  try {
    return await db.runTransaction(async (transaction) => {
      const orgSnap = await transaction.get(orgRef);
      let publicationLimit = DEFAULT_TRIAL_PUBLICATION_LIMIT;
      let publicationUsed = 0;

      if (orgSnap.exists) {
        const data = orgSnap.data() || {};
        publicationLimit = data.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
        publicationUsed = data.publicationUsed ?? 0;
      }

      const newUsed = publicationUsed + 1;
      transaction.set(orgRef, {
        publicationUsed: newUsed,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(
        `✅ [incrementPublicationCount] Updated organizations/${userOrgId} publicationUsed: ${publicationUsed} -> ${newUsed}`
      );
      return Math.max(0, publicationLimit - newUsed);
    });
  } catch (err: any) {
    console.error('❌ [incrementPublicationCount] Firestore Admin error:', err?.message || err);
    if (err?.code === 7 || err?.message?.includes('PERMISSION_DENIED') || err?.message?.includes('permission')) {
      console.warn('⚠️ [incrementPublicationCount] PERMISSION_DENIED detected in post-generation counter increment.');
      return DEFAULT_TRIAL_PUBLICATION_LIMIT - 1;
    }
    return DEFAULT_TRIAL_PUBLICATION_LIMIT;
  }
}

/**
 * Refunds credits - Disabled for MVP (no-op).
 */
export async function refundCredits(
  uid: string,
  cost: number,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  // No-op in MVP: If news generation fails, publication counter is not refunded/incremented further.
  return;
}

/**
 * Retrieves recent ledger movements for a user - Disabled for MVP.
 */
export async function getUserLedger(uid: string, limitCount = 20): Promise<LedgerMovement[]> {
  return [];
}

// ==========================================
// HERMES PLATFORM ADMINISTRATION (GENERACIONES)
// ==========================================

export interface AdminUserRecord {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  userCreatedAt: string;
  organizationId: string;
  organizationName: string;
  status: string;
  plan: string;
  publicationLimit: number;
  publicationUsed: number;
  availableGenerations: number;
  orgCreatedAt: string;
}

export interface GenerationMovement {
  id: string;
  type: 'ADMIN_GRANT';
  amountAdded: number;
  previousPublicationLimit: number;
  newPublicationLimit: number;
  publicationUsed: number;
  previousAvailable: number;
  newAvailable: number;
  adminUid: string;
  adminEmail: string;
  createdAt: string;
  reason?: string;
}

/**
 * Verifies whether an authenticated user has Hermes platform administrator privileges.
 */
export async function checkIsHermesAdmin(uid: string, email?: string): Promise<boolean> {
  const allAdminEmails = getAdminEmails();

  if (email && allAdminEmails.includes(email.trim().toLowerCase())) {
    return true;
  }

  try {
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data() || {};
      const userEmail = (data.email || '').trim().toLowerCase();
      if (userEmail && allAdminEmails.includes(userEmail)) {
        return true;
      }
      const role = (data.role || '').toLowerCase();
      if (role === 'admin' || role === 'superadmin' || data.isAdmin === true) {
        return true;
      }
    }
  } catch (err) {
    // ignore
  }

  return false;
}

/**
 * Retrieves all registered users paired with their respective organization counters.
 * organizations/{organizationId} is the single source of truth for publicationLimit and publicationUsed.
 */
export async function getAllUsersWithOrganizations(): Promise<AdminUserRecord[]> {
  const allAdminEmails = getAdminEmails();

  const db = getAdminDb();
  const [usersSnap, orgsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('organizations').get(),
  ]);
  const userDocs: any[] = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const orgDocs: any[] = orgsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const orgMap = new Map<string, any>();
  for (const org of orgDocs) {
    if (org.id) orgMap.set(org.id, org);
  }

  const results: AdminUserRecord[] = [];
  const processedOrgIds = new Set<string>();
  const processedUids = new Set<string>();

  for (const u of userDocs) {
    const uid = u.id;
    processedUids.add(uid);
    const email = u.email || '';
    const userRole = (u.role || 'user').toLowerCase();
    const isAdmin =
      allAdminEmails.includes(email.toLowerCase()) ||
      userRole === 'admin' ||
      userRole === 'superadmin' ||
      u.isAdmin === true;

    // Resolve organization for user
    let orgId = u.organizationId || `org_${uid}`;
    let org = orgMap.get(orgId);
    if (!org) {
      for (const candidate of orgDocs) {
        if (candidate.ownerUid === uid) {
          org = candidate;
          orgId = candidate.id;
          break;
        }
      }
    }

    if (org?.id) {
      processedOrgIds.add(org.id);
    }

    const orgName =
      org?.name ||
      u.displayName ||
      u.nombreMedio ||
      `Medio Digital (${email.split('@')[0] || uid.slice(0, 5)})`;
    const status = org?.status || org?.state || 'Activa';
    const plan = org?.plan || 'trial';
    const publicationLimit =
      org?.publicationLimit !== undefined ? Number(org.publicationLimit) : DEFAULT_TRIAL_PUBLICATION_LIMIT;
    const publicationUsed = org?.publicationUsed !== undefined ? Number(org.publicationUsed) : 0;
    const availableGenerations = Math.max(0, publicationLimit - publicationUsed);
    const orgCreatedAt = org?.createdAt || u.createdAt || new Date().toISOString();
    const userCreatedAt = u.createdAt || orgCreatedAt;

    results.push({
      uid,
      email,
      role: u.role || (isAdmin ? 'admin' : 'user'),
      isAdmin,
      userCreatedAt,
      organizationId: org?.id || orgId,
      organizationName: orgName,
      status,
      plan,
      publicationLimit,
      publicationUsed,
      availableGenerations,
      orgCreatedAt,
    });
  }

  // Also include organizations whose owner wasn't in users collection
  for (const org of orgDocs) {
    if (org.id && !processedOrgIds.has(org.id)) {
      const uid = org.ownerUid || org.id;
      if (!processedUids.has(uid)) {
        processedUids.add(uid);
        const email = org.ownerEmail || org.email || '';
        const isAdmin = allAdminEmails.includes(email.toLowerCase());
        const publicationLimit =
          org.publicationLimit !== undefined ? Number(org.publicationLimit) : DEFAULT_TRIAL_PUBLICATION_LIMIT;
        const publicationUsed = org.publicationUsed !== undefined ? Number(org.publicationUsed) : 0;
        const availableGenerations = Math.max(0, publicationLimit - publicationUsed);
        const orgCreatedAt = org.createdAt || new Date().toISOString();

        results.push({
          uid,
          email,
          role: isAdmin ? 'admin' : 'owner',
          isAdmin,
          userCreatedAt: orgCreatedAt,
          organizationId: org.id,
          organizationName: org.name || `Medio Digital (${org.id.slice(0, 5)})`,
          status: org.status || 'Activa',
          plan: org.plan || 'trial',
          publicationLimit,
          publicationUsed,
          availableGenerations,
          orgCreatedAt,
        });
      }
    }
  }

  // Sort descending by registration date
  results.sort((a, b) => new Date(b.userCreatedAt).getTime() - new Date(a.userCreatedAt).getTime());

  return results;
}

/**
 * Adds generations to an organization (increases publicationLimit) and appends a ledger movement.
 * Reuses the exact organizations/{organizationId} document as single source of truth.
 */
export async function adminAddGenerations(params: {
  adminUid: string;
  adminEmail: string;
  targetOrgId: string;
  targetUid: string;
  amount: number;
  reason?: string;
}): Promise<{
  newPublicationLimit: number;
  publicationUsed: number;
  availableGenerations: number;
  movement: GenerationMovement;
}> {
  const { adminUid, adminEmail, targetOrgId, targetUid, amount, reason } = params;

  if (!amount || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('La cantidad de generaciones debe ser un número entero mayor a 0.');
  }

  const db = getAdminDb();
  const orgRef = db.collection('organizations').doc(targetOrgId);

  return await db.runTransaction(async (transaction) => {
    const orgSnap = await transaction.get(orgRef);
    let currentLimit = DEFAULT_TRIAL_PUBLICATION_LIMIT;
    let currentUsed = 0;

    if (orgSnap.exists) {
      const orgData = orgSnap.data() || {};
      currentLimit =
        orgData.publicationLimit !== undefined
          ? Number(orgData.publicationLimit)
          : DEFAULT_TRIAL_PUBLICATION_LIMIT;
      currentUsed = orgData.publicationUsed !== undefined ? Number(orgData.publicationUsed) : 0;
    }

    const newLimit = currentLimit + amount;
    const previousAvailable = Math.max(0, currentLimit - currentUsed);
    const newAvailable = Math.max(0, newLimit - currentUsed);
    const now = new Date().toISOString();

    transaction.set(
      orgRef,
      {
        publicationLimit: newLimit,
        updatedAt: now,
      },
      { merge: true }
    );

    const ledgerRef = orgRef.collection('generationLedger').doc();
    const movement: GenerationMovement = {
      id: ledgerRef.id,
      type: 'ADMIN_GRANT',
      amountAdded: amount,
      previousPublicationLimit: currentLimit,
      newPublicationLimit: newLimit,
      publicationUsed: currentUsed,
      previousAvailable,
      newAvailable,
      adminUid,
      adminEmail: adminEmail || '',
      createdAt: now,
      reason: reason?.trim() || '',
    };

    transaction.set(ledgerRef, movement);

    return {
      newPublicationLimit: newLimit,
      publicationUsed: currentUsed,
      availableGenerations: newAvailable,
      movement,
    };
  });
}

/**
 * Retrieves the generation ledger history for a specific organization.
 */
export async function getOrganizationGenerationHistory(
  orgId: string
): Promise<GenerationMovement[]> {
  const db = getAdminDb();
  try {
    const snap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('generationLedger')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<GenerationMovement, 'id'>),
    }));
  } catch (err) {
    console.warn(`[getOrganizationGenerationHistory] Error leyendo historial para ${orgId}:`, err);
    return [];
  }
}

/**
 * Toggles administrative role for a user in users/{targetUid}.
 */
export async function adminToggleUserAdminRole(
  adminUid: string,
  targetUid: string,
  makeAdmin: boolean
): Promise<boolean> {
  const now = new Date().toISOString();
  const db = getAdminDb();
  const userRef = db.collection('users').doc(targetUid);
  await userRef.set(
    {
      role: makeAdmin ? 'admin' : 'user',
      isAdmin: makeAdmin,
      updatedAt: now,
    },
    { merge: true }
  );

  return makeAdmin;
}
