import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from './firebase-admin';
import { organizationLifecycle } from './organization-lifecycle';

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
  | 'INVALID_STATUS'
  | 'ACCOUNT_CREATION_UNAVAILABLE'
  | 'MEMBERSHIP_UNAVAILABLE'
  | 'ORGANIZATION_NOT_FOUND'
  | 'ALREADY_OWNER'
  | 'OWNER_CANNOT_BE_REMOVED'
  | 'MEMBER_NOT_FOUND'
  | 'INVALID_SEAT_LIMIT'
  | 'SEAT_LIMIT_REACHED'
  | 'MANAGER_MUST_BE_MEMBER'
  | 'NOT_TEAM_MANAGER'
  | 'TEAM_SUSPENDED'
  | 'MANAGER_CANNOT_REMOVE_SELF'
  | 'ACCOUNT_IN_OTHER_NEWSROOM';

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
export type CreateAccount = (email: string) => Promise<AccountLookup>;
export type DeleteAccount = (uid: string) => Promise<void>;

/**
 * Invitation-only access: creates the Auth account without a password. Only whoever controls the
 * mailbox can set one (through the emailed password link), so the address is treated as verified.
 */
export const createAuthAccount: CreateAccount = async (email) => {
  const record = await getAdminAuth().createUser({ email, emailVerified: true });
  return { uid: record.uid, email: (record.email || email).toLowerCase(), emailVerified: true };
};

export const deleteAuthAccount: DeleteAccount = async (uid) => {
  await getAdminAuth().deleteUser(uid);
};

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

export async function requireOrganization(orgId: unknown) {
  if (typeof orgId !== 'string' || !orgId.trim() || orgId.includes('/')) {
    throw new MembershipError('ORGANIZATION_NOT_FOUND');
  }
  const snap = await getAdminDb().doc(`organizations/${orgId}`).get();
  if (!snap.exists) throw new MembershipError('ORGANIZATION_NOT_FOUND');
  return snap;
}

// ==========================================
// Seats and the newsroom manager
// ==========================================

/**
 * Who is changing a team. The platform admin can do anything; a newsroom manager
 * (organizations/{id}.managerUid) only acts on its own newsroom, within its seat limit, and
 * cannot pull accounts that belong to another newsroom.
 */
export type MemberActor = { kind: 'platform-admin' } | { kind: 'manager'; uid: string };
const PLATFORM_ADMIN: MemberActor = { kind: 'platform-admin' };

const MAX_SEAT_LIMIT = 1000;

/** Validates a seat limit sent by the admin: a whole number from 1 to 1000, or null for no limit. */
function parseSeatLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SEAT_LIMIT) {
    throw new MembershipError('INVALID_SEAT_LIMIT');
  }
  return value;
}

export function seatLimitOf(data: FirebaseFirestore.DocumentData | undefined): number | null {
  const value = data?.seatLimit;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

/** Accounts holding a seat: the owner (if any) and every member. Pending invites are counted apart. */
export function seatHolders(data: FirebaseFirestore.DocumentData | undefined): Set<string> {
  const owner = typeof data?.ownerUid === 'string' ? data.ownerUid : '';
  return new Set([owner, ...membersOf(data)].filter(Boolean));
}

type QueryReader = (query: FirebaseFirestore.Query) => Promise<FirebaseFirestore.QuerySnapshot>;

/** Seats in use; the invite of `exceptEmail` is left out because adding that email reuses its seat. */
async function seatsInUse(read: QueryReader, orgId: string, data: FirebaseFirestore.DocumentData | undefined, exceptEmail?: string) {
  const invites = await read(getAdminDb().collection('invites').where('orgId', '==', orgId));
  return seatHolders(data).size + invites.docs.filter((doc) => doc.id !== exceptEmail).length;
}

function assertManagerOf(data: FirebaseFirestore.DocumentData | undefined, actor: MemberActor) {
  if (actor.kind !== 'manager') return;
  if (!actor.uid || data?.managerUid !== actor.uid) throw new MembershipError('NOT_TEAM_MANAGER');
  if (organizationLifecycle(data) === 'suspended') throw new MembershipError('TEAM_SUSPENDED');
}

/**
 * The personal newsroom every account gets when it signs in without one: self-created, still in
 * preparation, with no team and no manager. Owning only that does not tie the account to a newsroom.
 */
function isUnusedPersonalNewsroom(doc: FirebaseFirestore.DocumentSnapshot, uid: string): boolean {
  const data = doc.data();
  return (
    data?.selfSignup === true &&
    data?.ownerUid === uid &&
    organizationLifecycle(data) === 'draft' &&
    membersOf(data).length === 0 &&
    !data?.managerUid
  );
}

/** Rejects, for a manager, an account or email that already belongs to or is invited to another newsroom. */
async function assertNotInOtherNewsroom(
  transaction: FirebaseFirestore.Transaction,
  orgId: string,
  email: string,
  accountUid: string | null
) {
  const db = getAdminDb();
  const invite = await transaction.get(db.doc(`invites/${email}`));
  if (invite.exists && invite.data()?.orgId !== orgId) throw new MembershipError('ACCOUNT_IN_OTHER_NEWSROOM');
  if (!accountUid) return;

  const [memberOf, ownerOf, user] = await Promise.all([
    transaction.get(db.collection('organizations').where('members', 'array-contains', accountUid)),
    transaction.get(db.collection('organizations').where('ownerUid', '==', accountUid)),
    transaction.get(db.doc(`users/${accountUid}`)),
  ]);
  // Platform admins are never pulled into a client team by its manager.
  const userData = user.data();
  if (userData?.isAdmin === true || userData?.role === 'admin' || userData?.role === 'superadmin') {
    throw new MembershipError('ACCOUNT_IN_OTHER_NEWSROOM');
  }

  const belongsTo = (doc: FirebaseFirestore.DocumentSnapshot) => doc.id !== orgId && !isUnusedPersonalNewsroom(doc, accountUid);
  const elsewhere = memberOf.docs.some((doc) => doc.id !== orgId) || ownerOf.docs.some(belongsTo);
  const pointer = userData?.organizationId;
  let pointsElsewhere = false;
  if (typeof pointer === 'string' && pointer !== '' && pointer !== orgId && !pointer.includes('/')) {
    const pointed = await transaction.get(db.doc(`organizations/${pointer}`));
    pointsElsewhere = pointed.exists && belongsTo(pointed);
  }
  if (elsewhere || pointsElsewhere) throw new MembershipError('ACCOUNT_IN_OTHER_NEWSROOM');
}

/** Sets or clears (null) the seat limit of a newsroom. Lowering it never removes anyone. */
export async function setOrganizationSeatLimit(input: { orgId: string; seatLimit: unknown }): Promise<void> {
  const seatLimit = parseSeatLimit(input.seatLimit);
  const org = await requireOrganization(input.orgId);
  await org.ref.update({ seatLimit: seatLimit === null ? FieldValue.delete() : seatLimit, updatedAt: new Date().toISOString() });
}

/** Makes an account of the newsroom its manager, or clears the manager when `email` is null. */
export async function setOrganizationManager(
  input: { orgId: string; email: unknown },
  findAccount: FindAccountByEmail = findAccountByEmail
): Promise<void> {
  const org = await requireOrganization(input.orgId);
  if (input.email === null) {
    await org.ref.update({ managerUid: FieldValue.delete(), updatedAt: new Date().toISOString() });
    return;
  }
  const account = await findAccount(normalizeEmail(input.email));
  if (!account) throw new MembershipError('MANAGER_MUST_BE_MEMBER');

  await getAdminDb().runTransaction(async (transaction) => {
    const snap = await transaction.get(org.ref);
    if (!seatHolders(snap.data()).has(account.uid)) throw new MembershipError('MANAGER_MUST_BE_MEMBER');
    transaction.update(org.ref, { managerUid: account.uid, updatedAt: new Date().toISOString() });
  });
}

/** Returns the newsroom the signed-in account manages, or rejects it. */
export async function requireTeamManagerOrganization(uid: string): Promise<string> {
  const db = getAdminDb();
  const orgId = (await db.doc(`users/${uid}`).get()).data()?.organizationId;
  if (typeof orgId !== 'string' || !orgId || orgId.includes('/')) throw new MembershipError('NOT_TEAM_MANAGER');
  const org = await db.doc(`organizations/${orgId}`).get();
  if (!org.exists) throw new MembershipError('NOT_TEAM_MANAGER');
  assertManagerOf(org.data(), { kind: 'manager', uid });
  return orgId;
}

/** Links a verified account to the organization, leaving every other organization it was a member of. */
async function attachMember(account: AccountLookup, orgId: string, actor: MemberActor = PLATFORM_ADMIN): Promise<void> {
  const db = getAdminDb();
  const orgRef = db.doc(`organizations/${orgId}`);
  const userRef = db.doc(`users/${account.uid}`);
  const inviteRef = db.doc(`invites/${account.email}`);

  await db.runTransaction(async (transaction) => {
    const orgSnap = await transaction.get(orgRef);
    if (!orgSnap.exists) throw new MembershipError('ORGANIZATION_NOT_FOUND');
    const org = orgSnap.data();
    if (org?.ownerUid === account.uid) throw new MembershipError('ALREADY_OWNER');

    // The user's pointer may have moved (e.g. back to a personal organization), so search by membership.
    const previous = await transaction.get(
      db.collection('organizations').where('members', 'array-contains', account.uid)
    );

    if (actor.kind === 'manager') {
      assertManagerOf(org, actor);
      // The seat check runs first: a full newsroom answers the same for every email, so it
      // cannot be used to learn which accounts belong to other newsrooms.
      const limit = seatLimitOf(org);
      const alreadyHoldsSeat = seatHolders(org).has(account.uid);
      if (!alreadyHoldsSeat && limit !== null) {
        const used = await seatsInUse((query) => transaction.get(query), orgId, org, account.email);
        if (used + 1 > limit) throw new MembershipError('SEAT_LIMIT_REACHED');
      }
      await assertNotInOtherNewsroom(transaction, orgId, account.email, account.uid);
    }

    previous.docs
      .filter((doc) => doc.id !== orgId)
      .forEach((doc) =>
        transaction.update(doc.ref, {
          members: FieldValue.arrayRemove(account.uid),
          // An account that leaves a newsroom cannot keep managing it.
          ...(doc.data().managerUid === account.uid ? { managerUid: FieldValue.delete() } : {}),
        })
      );
    transaction.set(orgRef, { members: FieldValue.arrayUnion(account.uid) }, { merge: true });
    transaction.set(userRef, { organizationId: orgId, email: account.email }, { merge: true });
    transaction.delete(inviteRef);
  });
}

/** Records a pending invite; for a manager it is checked against the seat limit and other newsrooms. */
async function recordPendingInvite(
  input: { orgId: string; email: string; invitedByUid: string; invitedByEmail?: string },
  account: AccountLookup | null,
  actor: MemberActor
): Promise<void> {
  const db = getAdminDb();
  const orgRef = db.doc(`organizations/${input.orgId}`);
  const inviteRef = db.doc(`invites/${input.email}`);
  await db.runTransaction(async (transaction) => {
    if (actor.kind === 'manager') {
      const orgSnap = await transaction.get(orgRef);
      if (!orgSnap.exists) throw new MembershipError('ORGANIZATION_NOT_FOUND');
      const org = orgSnap.data();
      assertManagerOf(org, actor);
      // Seat check first, for the same reason as in attachMember.
      const limit = seatLimitOf(org);
      if (limit !== null && (await seatsInUse((query) => transaction.get(query), input.orgId, org, input.email)) + 1 > limit) {
        throw new MembershipError('SEAT_LIMIT_REACHED');
      }
      await assertNotInOtherNewsroom(transaction, input.orgId, input.email, account?.uid || null);
    }
    transaction.set(inviteRef, {
      email: input.email,
      orgId: input.orgId,
      invitedByUid: input.invitedByUid,
      invitedByEmail: input.invitedByEmail || '',
      createdAt: new Date().toISOString(),
    });
  });
}

export async function addOrganizationMember(
  input: { orgId: string; email: unknown; invitedByUid: string; invitedByEmail?: string; actor?: MemberActor },
  findAccount: FindAccountByEmail = findAccountByEmail,
  createAccount: CreateAccount | null = createAuthAccount,
  deleteAccount: DeleteAccount = deleteAuthAccount
): Promise<
  | { status: 'active'; email: string; uid: string }
  | { status: 'created'; email: string; uid: string }
  | { status: 'pending'; email: string }
> {
  const actor = input.actor || PLATFORM_ADMIN;
  const email = normalizeEmail(input.email);
  const org = await requireOrganization(input.orgId);
  assertManagerOf(org.data(), actor);
  let account = await findAccount(email);

  // New person: create the account now; the admin's browser then emails the set-password link.
  if (!account && createAccount) {
    if (actor.kind === 'manager') {
      // Checked before creating anything, so a full newsroom or a foreign invite never creates an
      // account. The seat check goes first so a full newsroom reveals nothing about other emails.
      const limit = seatLimitOf(org.data());
      if (limit !== null && (await seatsInUse((query) => query.get(), input.orgId, org.data(), email)) + 1 > limit) {
        throw new MembershipError('SEAT_LIMIT_REACHED');
      }
      const invite = await getAdminDb().doc(`invites/${email}`).get();
      if (invite.exists && invite.data()?.orgId !== input.orgId) throw new MembershipError('ACCOUNT_IN_OTHER_NEWSROOM');
    }
    let createdAccount: AccountLookup | null = null;
    try {
      createdAccount = await createAccount(email);
    } catch (error: any) {
      // Registered between the lookup and createUser: continue as an existing account.
      if (error?.code !== 'auth/email-already-exists') {
        console.error('[addOrganizationMember] Could not create the account:', error?.code || error?.message);
        throw new MembershipError('ACCOUNT_CREATION_UNAVAILABLE');
      }
      account = await findAccount(email);
    }

    if (createdAccount) {
      try {
        await attachMember({ ...createdAccount, email }, input.orgId, actor);
        return { status: 'created', email, uid: createdAccount.uid };
      } catch (error: any) {
        // The account exists only for this invite and was never used: remove it so a retry starts clean.
        await deleteAccount(createdAccount.uid).catch((deleteError: any) => {
          console.error('[addOrganizationMember] Could not remove the unused account', createdAccount!.uid, deleteError?.code || deleteError?.message);
        });
        if (error instanceof MembershipError) throw error;
        console.error('[addOrganizationMember] Could not link the new account:', error?.code || error?.message);
        throw new MembershipError('MEMBERSHIP_UNAVAILABLE');
      }
    }
  }

  if (account && org.data()?.ownerUid === account.uid) throw new MembershipError('ALREADY_OWNER');

  if (account?.emailVerified) {
    await attachMember({ ...account, email }, input.orgId, actor);
    return { status: 'active', email, uid: account.uid };
  }

  // Pending invite: an existing but unverified account must prove the address first (prevents
  // squatting an email), or no account exists and account creation is disabled.
  await recordPendingInvite({ ...input, email }, account, actor);
  return { status: 'pending', email };
}

export async function removeOrganizationMember(
  input: { orgId: string; email: unknown; actor?: MemberActor },
  findAccount: FindAccountByEmail = findAccountByEmail
): Promise<void> {
  const actor = input.actor || PLATFORM_ADMIN;
  const email = normalizeEmail(input.email);
  const org = await requireOrganization(input.orgId);
  assertManagerOf(org.data(), actor);
  const db = getAdminDb();

  // Validate before mutating anything, so a rejected request leaves no partial changes.
  const account = await findAccount(email);
  if (account && org.data()?.ownerUid === account.uid) throw new MembershipError('OWNER_CANNOT_BE_REMOVED');
  if (account && actor.kind === 'manager' && account.uid === actor.uid) throw new MembershipError('MANAGER_CANNOT_REMOVE_SELF');

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
      if (isMember) {
        transaction.update(orgRef, {
          members: FieldValue.arrayRemove(account.uid),
          ...(orgSnap.data()?.managerUid === account.uid ? { managerUid: FieldValue.delete() } : {}),
        });
      }
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
  managerUid: string | null;
  /** Null when the newsroom has no seat limit. */
  seatLimit: number | null;
  /** Owner, members and pending invites. */
  seatsUsed: number;
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
    managerUid: typeof org.data()?.managerUid === 'string' && org.data()!.managerUid ? org.data()!.managerUid : null,
    seatLimit: seatLimitOf(org.data()),
    seatsUsed: seatHolders(org.data()).size + invites.size,
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
export async function createManagedOrganization(input: { name: unknown; adminUid: string; seatLimit?: unknown }): Promise<string> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw new MembershipError('INVALID_NAME');
  const seatLimit = parseSeatLimit(input.seatLimit);

  const ref = getAdminDb().collection('organizations').doc();
  await ref.set({
    name,
    ownerUid: '',
    members: [],
    publicationUsed: 0,
    // In preparation until the admin activates it; the team cannot generate before that.
    status: 'draft',
    orgType: 'Medio Digital',
    createdAt: new Date().toISOString(),
    createdByAdminUid: input.adminUid,
    ...(seatLimit === null ? {} : { seatLimit }),
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
