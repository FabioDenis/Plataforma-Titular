import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from './firebase-admin';
import { DEFAULT_TRIAL_PUBLICATION_LIMIT } from './billing';

export interface BootstrapIdentity {
  uid: string;
  email: string;
}

export interface BootstrapResult {
  user: DocumentData & { id: string };
  organization: DocumentData & { id: string };
}

export class BootstrapConflictError extends Error {
  readonly code = 'BOOTSTRAP_CONFLICT';

  constructor() {
    super('Account data conflicts with an existing organization.');
  }
}

function missingFields(existing: DocumentData, defaults: DocumentData): DocumentData {
  return Object.fromEntries(
    Object.entries(defaults).filter(([key]) => existing[key] === undefined)
  );
}

function organizationDefaults(identity: BootstrapIdentity, now: string): DocumentData {
  const username = identity.email.split('@')[0] || 'medio';
  return {
    name: `Medio Digital (${username})`,
    ownerUid: identity.uid,
    createdAt: now,
    status: 'Activa',
    orgType: 'Medio Digital',
  };
}

export async function bootstrapAccount(
  identity: BootstrapIdentity,
  db: Firestore = getAdminDb()
): Promise<BootstrapResult> {
  const userRef = db.doc(`users/${identity.uid}`);
  const defaultOrgRef = db.doc(`organizations/org_${identity.uid}`);

  return db.runTransaction(async (transaction) => {
    const [userSnap, defaultOrgSnap] = await transaction.getAll(userRef, defaultOrgRef);
    const existingUser = userSnap.data() || {};

    if (existingUser.uid !== undefined && existingUser.uid !== identity.uid) {
      throw new BootstrapConflictError();
    }

    const rawOrganizationId = existingUser.organizationId;
    if (
      rawOrganizationId !== undefined &&
      rawOrganizationId !== null &&
      (typeof rawOrganizationId !== 'string' ||
        rawOrganizationId.trim() === '' ||
        rawOrganizationId.includes('/'))
    ) {
      throw new BootstrapConflictError();
    }

    const referencedOrganizationId =
      typeof rawOrganizationId === 'string' && rawOrganizationId.trim()
        ? rawOrganizationId.trim()
        : null;
    let selectedOrgRef = referencedOrganizationId
      ? db.doc(`organizations/${referencedOrganizationId}`)
      : defaultOrgRef;
    let selectedOrgSnap = selectedOrgRef.path === defaultOrgRef.path
      ? defaultOrgSnap
      : await transaction.get(selectedOrgRef);

    if (referencedOrganizationId && selectedOrgSnap.exists) {
      if (selectedOrgSnap.data()?.ownerUid !== identity.uid) {
        throw new BootstrapConflictError();
      }
    } else {
      if (defaultOrgSnap.exists && defaultOrgSnap.data()?.ownerUid !== identity.uid) {
        throw new BootstrapConflictError();
      }

      const ownedOrganizations = await transaction.get(
        db.collection('organizations').where('ownerUid', '==', identity.uid)
      );
      if (ownedOrganizations.size > 1) {
        throw new BootstrapConflictError();
      }

      if (ownedOrganizations.size === 1) {
        selectedOrgSnap = ownedOrganizations.docs[0];
        selectedOrgRef = selectedOrgSnap.ref;
      } else if (!referencedOrganizationId) {
        selectedOrgRef = defaultOrgRef;
        selectedOrgSnap = defaultOrgSnap;
      }
      // With an explicit missing relationship and no owned organization, recreating
      // that referenced document is the only repair that preserves user intent.
    }

    const now = new Date().toISOString();
    const organizationData = selectedOrgSnap.data() || {};
    const organizationPatch = missingFields(
      organizationData,
      organizationDefaults(identity, now)
    );
    const effectivePlan = organizationData.plan ?? 'trial';
    if (organizationData.plan === undefined) organizationPatch.plan = 'trial';
    if (organizationData.publicationLimit === undefined && effectivePlan === 'trial') {
      organizationPatch.publicationLimit = DEFAULT_TRIAL_PUBLICATION_LIMIT;
    }
    if (organizationData.publicationUsed === undefined) organizationPatch.publicationUsed = 0;
    const userPatch = missingFields(existingUser, {
      uid: identity.uid,
      email: identity.email,
      createdAt: now,
      organizationId: selectedOrgRef.id,
      role: 'owner',
    });

    if (existingUser.organizationId !== selectedOrgRef.id) {
      userPatch.organizationId = selectedOrgRef.id;
    }

    if (Object.keys(organizationPatch).length > 0) {
      transaction.set(selectedOrgRef, organizationPatch, { merge: true });
    }
    if (Object.keys(userPatch).length > 0) {
      transaction.set(userRef, userPatch, { merge: true });
    }

    return {
      user: { ...existingUser, ...userPatch, id: userRef.id },
      organization: {
        ...organizationData,
        ...organizationPatch,
        id: selectedOrgRef.id,
      },
    };
  });
}
