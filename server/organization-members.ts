import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import { DEFAULT_TRIAL_PUBLICATION_LIMIT } from './billing';

/**
 * Organization membership (team accounts).
 *
 * organizations/{orgId}.members holds the uids that share the organization with its owner.
 * Only platform admins manage it (server-side). An email that is not yet registered, or whose
 * address is not verified, is kept as a pending invite in invites/{email} and is accepted on the
 * first sign-in with a verified address. Clients can never read or write invites.
 */

export type MembershipErrorCode =
  | 'INVALID_EMAIL'
  | 'INVALID_NAME'
  | 'ORGANIZATION_NOT_FOUND'
  | 'ALREADY_OWNER'
  | 'OWNER_CANNOT_BE_REMOVED'
  | 'MEMBER_NOT_FOUND';

export class MembershipError extends Error {
  constructor(public readonly code: MembershipErrorCode) {
    super(code);
  }
}

export interface AccountLookup {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export type FindAccountByEmail = (email: string) => Promise<AccountLookup | null>;

export const findAccountByEmail: FindAccountByEmail = async (email) => {
  try {
    const record = await getAdminAuth().getUserByEmail(email);
    return { uid: record.uid, email: (record.email || email).toLowerCase(), emailVerified: record.emailVerified === true };
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
};

const EMAIL_PATTERN = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

function normalizeEmail(email: unknown): string {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw new MembershipError('INVALID_EMAIL');
  }
  return normalized;
}

function membersOf(data: FirebaseFirestore.DocumentData | undefined): string[] {
  return Array.isArray(data?.members) ? data!.members.filter((m: unknown) => typeof m === 'string') : [];
}

async function requireOrganization(orgId: unknown) {
  if (typeof orgId !== 'string' || !orgId.trim() || orgId.includes('/')) {
    throw new MembershipError('ORGANIZATION_NOT_FOUND');
  }
  const snap = await getAdminDb().doc(`organizations/${orgId}`).get();
  if (!snap.exists) throw new MembershipError('ORGANIZATION_NOT_FOUND');
  return snap;
}

/** Links a verified account to the organization, leaving every other organization it was a member of. */
async function attachMember(account: AccountLookup, orgId: string): Promise<void> {
  const db = getAdminDb();
  const orgRef = db.doc(`organizations/${orgId}`);
  const userRef = db.doc(`users/${account.uid}`);
  const inviteRef = db.doc(`invites/${account.email}`);

  await db.runTransaction(async (transaction) => {
    const orgSnap = await transaction.get(orgRef);
    if (!orgSnap.exists) throw new MembershipError('ORGANIZATION_NOT_FOUND');
    if (orgSnap.data()?.ownerUid === account.uid) throw new MembershipError('ALREADY_OWNER');

    // The user's pointer may have moved (e.g. back to a personal organization), so search by membership.
    const previous = await transaction.get(
      db.collection('organizations').where('members', 'array-contains', account.uid)
    );

    previous.docs
      .filter((doc) => doc.id !== orgId)
      .forEach((doc) => transaction.update(doc.ref, { members: FieldValue.arrayRemove(account.uid) }));
    transaction.set(orgRef, { members: FieldValue.arrayUnion(account.uid) }, { merge: true });
    transaction.set(userRef, { organizationId: orgId, email: account.email }, { merge: true });
    transaction.delete(inviteRef);
  });
}

export async function addOrganizationMember(
  input: { orgId: string; email: unknown; invitedByUid: string; invitedByEmail?: string },
  findAccount: FindAccountByEmail = findAccountByEmail
): Promise<{ status: 'active'; email: string; uid: string } | { status: 'pending'; email: string }> {
  const email = normalizeEmail(input.email);
  const org = await requireOrganization(input.orgId);
  const account = await findAccount(email);

  if (account && org.data()?.ownerUid === account.uid) throw new MembershipError('ALREADY_OWNER');

  if (account?.emailVerified) {
    await attachMember({ ...account, email }, input.orgId);
    return { status: 'active', email, uid: account.uid };
  }

  await getAdminDb().doc(`invites/${email}`).set({
    email,
    orgId: input.orgId,
    invitedByUid: input.invitedByUid,
    invitedByEmail: input.invitedByEmail || '',
    createdAt: new Date().toISOString(),
  });
  return { status: 'pending', email };
}

export async function removeOrganizationMember(
  input: { orgId: string; email: unknown },
  findAccount: FindAccountByEmail = findAccountByEmail
): Promise<void> {
  const email = normalizeEmail(input.email);
  const org = await requireOrganization(input.orgId);
  const db = getAdminDb();

  // Validate before mutating anything, so a rejected request leaves no partial changes.
  const account = await findAccount(email);
  if (account && org.data()?.ownerUid === account.uid) throw new MembershipError('OWNER_CANNOT_BE_REMOVED');

  const inviteRef = db.doc(`invites/${email}`);
  const invite = await inviteRef.get();
  const hadInvite = invite.exists && invite.data()?.orgId === input.orgId;
  if (hadInvite) await inviteRef.delete();

  let wasMember = false;
  if (account) {
    const orgRef = db.doc(`organizations/${input.orgId}`);
    const userRef = db.doc(`users/${account.uid}`);
    wasMember = await db.runTransaction(async (transaction) => {
      const [orgSnap, userSnap] = await transaction.getAll(orgRef, userRef);
      const isMember = membersOf(orgSnap.data()).includes(account.uid);
      if (isMember) transaction.update(orgRef, { members: FieldValue.arrayRemove(account.uid) });
      // Without a pointer the next sign-in falls back to the account's own organization.
      if (userSnap.data()?.organizationId === input.orgId) {
        transaction.update(userRef, { organizationId: FieldValue.delete() });
      }
      return isMember;
    });
  }

  if (!wasMember && !hadInvite) throw new MembershipError('MEMBER_NOT_FOUND');
}

export interface OrganizationMembersListing {
  owner: { uid: string; email: string } | null;
  members: Array<{ uid: string; email: string }>;
  invites: Array<{ email: string; createdAt: string }>;
}

export async function listOrganizationMembers(orgId: string): Promise<OrganizationMembersListing> {
  const org = await requireOrganization(orgId);
  const db = getAdminDb();
  const ownerUid = typeof org.data()?.ownerUid === 'string' ? org.data()!.ownerUid : '';
  const memberUids = membersOf(org.data());
  const uids = [ownerUid, ...memberUids].filter(Boolean);
  const userSnaps = uids.length ? await db.getAll(...uids.map((uid) => db.doc(`users/${uid}`))) : [];
  const emailOf = new Map(userSnaps.map((snap) => [snap.id, String(snap.data()?.email || '')]));

  const invites = await db.collection('invites').where('orgId', '==', orgId).get();

  return {
    owner: ownerUid ? { uid: ownerUid, email: emailOf.get(ownerUid) || org.data()?.ownerEmail || '' } : null,
    members: memberUids.map((uid) => ({ uid, email: emailOf.get(uid) || '' })),
    invites: invites.docs
      .map((doc) => ({ email: doc.id, createdAt: String(doc.data().createdAt || '') }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };
}

/**
 * Accepts the pending invite for a signed-in account. Only verified addresses qualify, so nobody can
 * register someone else's email and inherit their newsroom. Returns the joined organization id.
 */
export async function acceptPendingInvites(identity: { uid: string; email: string; emailVerified?: boolean }): Promise<string | null> {
  if (!identity.emailVerified || !identity.email) return null;
  let email: string;
  try {
    email = normalizeEmail(identity.email);
  } catch {
    return null;
  }
  const invite = await getAdminDb().doc(`invites/${email}`).get();
  const orgId = invite.data()?.orgId;
  if (!invite.exists || typeof orgId !== 'string') return null;

  try {
    await attachMember({ uid: identity.uid, email, emailVerified: true }, orgId);
  } catch (error) {
    if (error instanceof MembershipError) {
      // The organization vanished or the account already owns it: the invite is obsolete.
      await getAdminDb().doc(`invites/${email}`).delete();
      return null;
    }
    throw error;
  }
  return orgId;
}

// ==========================================
// Newsrooms managed by the platform admin
// ==========================================

/**
 * Creates a newsroom without an owner so the platform admin can prepare its identity and templates
 * before adding the client's accounts as members.
 */
export async function createManagedOrganization(input: { name: unknown; adminUid: string }): Promise<string> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw new MembershipError('INVALID_NAME');

  const ref = getAdminDb().collection('organizations').doc();
  await ref.set({
    name,
    ownerUid: '',
    members: [],
    plan: 'trial',
    publicationLimit: DEFAULT_TRIAL_PUBLICATION_LIMIT,
    publicationUsed: 0,
    status: 'Activa',
    orgType: 'Medio Digital',
    createdAt: new Date().toISOString(),
    createdByAdminUid: input.adminUid,
  });
  return ref.id;
}

/**
 * Points the admin's session at a client newsroom so the regular app screens edit it.
 * The admin does not become a member: access comes from the platform-admin rules.
 */
export async function enterOrganizationAsAdmin(adminUid: string, orgId: string): Promise<void> {
  await requireOrganization(orgId);
  // isAdmin is what the Firestore rules check to let the admin read and edit the newsroom.
  await getAdminDb().doc(`users/${adminUid}`).set({ organizationId: orgId, isAdmin: true }, { merge: true });
}

/** Returns the admin's session to the organization they own (or to the default one on next sign-in). */
export async function exitOrganizationAsAdmin(adminUid: string): Promise<void> {
  const db = getAdminDb();
  const owned = await db.collection('organizations').where('ownerUid', '==', adminUid).limit(1).get();
  await db.doc(`users/${adminUid}`).set(
    { organizationId: owned.empty ? FieldValue.delete() : owned.docs[0].id },
    { merge: true }
  );
}
