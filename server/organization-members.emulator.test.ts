import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { deleteApp } from 'firebase-admin/app';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-titular';
process.env.GCLOUD_PROJECT = 'demo-titular';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

const { adminApp, getAdminDb } = await import('./firebase-admin');
const { bootstrapAccount } = await import('./auth-bootstrap');
const { syncPlatformAdminFlag } = await import('./billing');
const {
  addOrganizationMember,
  removeOrganizationMember,
  listOrganizationMembers,
  acceptPendingInvites,
  MembershipError,
  createManagedOrganization,
  enterOrganizationAsAdmin,
  exitOrganizationAsAdmin,
} = await import('./organization-members');

after(async () => {
  await deleteApp(adminApp);
});

let sequence = 0;
function account(verified = true) {
  sequence += 1;
  const uid = `member-user-${sequence}-${Date.now()}`;
  return { uid, email: `member-${sequence}-${Date.now()}@example.test`, emailVerified: verified };
}

type Account = ReturnType<typeof account>;

function directory(...accounts: Account[]) {
  return async (email: string) => accounts.find((a) => a.email === email.toLowerCase()) || null;
}

async function newsroom() {
  const owner = account();
  const result = await bootstrapAccount(owner);
  return { owner, orgId: result.organization.id };
}

const isCode = (code: string) => (error: unknown) => error instanceof MembershipError && error.code === code;

test('admin adds a verified registered account and it joins the newsroom immediately', async () => {
  const { orgId } = await newsroom();
  const reporter = account();
  await bootstrapAccount(reporter);

  const result = await addOrganizationMember({ orgId, email: reporter.email.toUpperCase(), invitedByUid: 'admin' }, directory(reporter));

  assert.deepEqual(result, { status: 'active', email: reporter.email, uid: reporter.uid });
  const db = getAdminDb();
  assert.deepEqual((await db.doc(`organizations/${orgId}`).get()).data()!.members, [reporter.uid]);
  assert.equal((await db.doc(`users/${reporter.uid}`).get()).data()!.organizationId, orgId);
});

test('a joined member bootstraps into the shared newsroom without conflict', async () => {
  const { orgId } = await newsroom();
  const reporter = account();
  await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: 'admin' }, directory(reporter));

  const result = await bootstrapAccount(reporter);

  assert.equal(result.organization.id, orgId);
  assert.equal(result.user.organizationId, orgId);
});

test('an unregistered email becomes a pending invite accepted on its first verified sign-in', async () => {
  const { orgId } = await newsroom();
  const reporter = account();

  const pending = await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: 'admin' }, directory());
  assert.deepEqual(pending, { status: 'pending', email: reporter.email });

  assert.equal(await acceptPendingInvites(reporter), orgId);
  const result = await bootstrapAccount(reporter);
  assert.equal(result.organization.id, orgId);
  assert.equal((await getAdminDb().doc(`invites/${reporter.email}`).get()).exists, false);
});

test('an unverified account cannot claim an invite or be attached directly', async () => {
  const { orgId } = await newsroom();
  const impostor = account(false);
  await bootstrapAccount(impostor);

  const result = await addOrganizationMember({ orgId, email: impostor.email, invitedByUid: 'admin' }, directory(impostor));
  assert.equal(result.status, 'pending');
  assert.equal(await acceptPendingInvites(impostor), null);
  assert.equal((await getAdminDb().doc(`organizations/${orgId}`).get()).data()!.members, undefined);
});

test('a member moved to another newsroom leaves the previous one', async () => {
  const first = await newsroom();
  const second = await newsroom();
  const reporter = account();
  const find = directory(reporter);
  await addOrganizationMember({ orgId: first.orgId, email: reporter.email, invitedByUid: 'admin' }, find);
  await addOrganizationMember({ orgId: second.orgId, email: reporter.email, invitedByUid: 'admin' }, find);

  const db = getAdminDb();
  assert.deepEqual((await db.doc(`organizations/${first.orgId}`).get()).data()!.members, []);
  assert.deepEqual((await db.doc(`organizations/${second.orgId}`).get()).data()!.members, [reporter.uid]);
});

test('removing a member revokes access and returns them to their own account on next sign-in', async () => {
  const { orgId } = await newsroom();
  const reporter = account();
  const find = directory(reporter);
  await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: 'admin' }, find);

  await removeOrganizationMember({ orgId, email: reporter.email }, find);

  const db = getAdminDb();
  assert.deepEqual((await db.doc(`organizations/${orgId}`).get()).data()!.members, []);
  assert.equal((await db.doc(`users/${reporter.uid}`).get()).data()!.organizationId, undefined);
  const result = await bootstrapAccount(reporter);
  assert.notEqual(result.organization.id, orgId);
  assert.equal(result.organization.ownerUid, reporter.uid);
});

test('removing a pending invite deletes it', async () => {
  const { orgId } = await newsroom();
  const reporter = account();
  await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: 'admin' }, directory());

  await removeOrganizationMember({ orgId, email: reporter.email }, directory());

  assert.equal(await acceptPendingInvites(reporter), null);
});

test('the listing shows owner, active members and pending invites', async () => {
  const { owner, orgId } = await newsroom();
  const active = account();
  await bootstrapAccount(active);
  const invited = account();
  await addOrganizationMember({ orgId, email: active.email, invitedByUid: 'admin' }, directory(active));
  await addOrganizationMember({ orgId, email: invited.email, invitedByUid: 'admin' }, directory());

  const listing = await listOrganizationMembers(orgId);

  assert.equal(listing.owner?.uid, owner.uid);
  assert.equal(listing.owner?.email, owner.email);
  assert.deepEqual(listing.members.map((m) => [m.uid, m.email]), [[active.uid, active.email]]);
  assert.deepEqual(listing.invites.map((i) => i.email), [invited.email]);
});

test('invalid requests are rejected with explicit codes', async () => {
  const { owner, orgId } = await newsroom();
  const find = directory(owner);
  await assert.rejects(addOrganizationMember({ orgId, email: 'not-an-email', invitedByUid: 'admin' }, find), isCode('INVALID_EMAIL'));
  await assert.rejects(addOrganizationMember({ orgId: 'missing-org', email: 'x@example.test', invitedByUid: 'admin' }, find), isCode('ORGANIZATION_NOT_FOUND'));
  await assert.rejects(addOrganizationMember({ orgId, email: owner.email, invitedByUid: 'admin' }, find), isCode('ALREADY_OWNER'));
  await assert.rejects(removeOrganizationMember({ orgId, email: owner.email }, find), isCode('OWNER_CANNOT_BE_REMOVED'));
  await assert.rejects(removeOrganizationMember({ orgId, email: 'nobody@example.test' }, find), isCode('MEMBER_NOT_FOUND'));
});

test('adding a member to a newsroom removes them from every other newsroom, even if their pointer moved away', async () => {
  const first = await newsroom();
  const second = await newsroom();
  const reporter = account();
  const find = directory(reporter);
  await addOrganizationMember({ orgId: first.orgId, email: reporter.email, invitedByUid: 'admin' }, find);
  // The member switched back to a personal organization before being moved.
  await getAdminDb().doc(`users/${reporter.uid}`).set({ organizationId: `org_${reporter.uid}` }, { merge: true });

  await addOrganizationMember({ orgId: second.orgId, email: reporter.email, invitedByUid: 'admin' }, find);

  const db = getAdminDb();
  assert.deepEqual((await db.doc(`organizations/${first.orgId}`).get()).data()!.members, []);
  assert.deepEqual((await db.doc(`organizations/${second.orgId}`).get()).data()!.members, [reporter.uid]);
});

test('a rejected owner removal leaves every document untouched', async () => {
  const { owner, orgId } = await newsroom();
  const db = getAdminDb();
  await db.doc(`invites/${owner.email}`).set({ email: owner.email, orgId });

  await assert.rejects(removeOrganizationMember({ orgId, email: owner.email }, directory(owner)), isCode('OWNER_CANNOT_BE_REMOVED'));

  assert.equal((await db.doc(`invites/${owner.email}`).get()).exists, true);
});

// --- Newsrooms managed by the platform admin ---

test('an admin creates an ownerless newsroom with the trial balance and then adds the client accounts', async () => {
  const orgId = await createManagedOrganization({ name: '  Radio Sol  ', adminUid: 'platform-admin' });
  const db = getAdminDb();
  const org = (await db.doc(`organizations/${orgId}`).get()).data()!;
  assert.equal(org.name, 'Radio Sol');
  assert.equal(org.ownerUid, '');
  assert.deepEqual(org.members, []);
  assert.equal(org.publicationLimit, 3);
  assert.equal(org.publicationUsed, 0);
  assert.equal(org.createdByAdminUid, 'platform-admin');

  const reporter = account();
  await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: 'platform-admin' }, directory(reporter));
  const result = await bootstrapAccount(reporter);
  assert.equal(result.organization.id, orgId);
  const listing = await listOrganizationMembers(orgId);
  assert.equal(listing.owner, null);
  assert.deepEqual(listing.members.map((m) => m.email), [reporter.email]);
});

test('a newsroom needs a name', async () => {
  await assert.rejects(createManagedOrganization({ name: '   ', adminUid: 'platform-admin' }), isCode('INVALID_NAME'));
});

test('an admin enters a client newsroom to edit it and goes back to their own', async () => {
  const admin = account();
  const own = await bootstrapAccount(admin);
  const client = await newsroom();
  const db = getAdminDb();

  await enterOrganizationAsAdmin(admin.uid, client.orgId);
  assert.equal((await db.doc(`users/${admin.uid}`).get()).data()!.organizationId, client.orgId);
  // Firestore rules recognize platform admins by this flag, so it must be set when entering.
  assert.equal((await db.doc(`users/${admin.uid}`).get()).data()!.isAdmin, true);
  // Entering never makes the admin a member of the client newsroom.
  assert.equal((await db.doc(`organizations/${client.orgId}`).get()).data()!.members, undefined);

  await exitOrganizationAsAdmin(admin.uid);
  assert.equal((await db.doc(`users/${admin.uid}`).get()).data()!.organizationId, own.organization.id);
});

test('entering a missing newsroom is rejected', async () => {
  await assert.rejects(enterOrganizationAsAdmin('platform-admin', 'missing-org'), isCode('ORGANIZATION_NOT_FOUND'));
});

test('an admin listed in ADMIN_EMAILS gets the admin flag the Firestore rules rely on', async () => {
  const admin = account();
  await bootstrapAccount(admin);
  const previous = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = `other@example.test, ${admin.email.toUpperCase()}`;
  try {
    assert.equal(await syncPlatformAdminFlag(admin.uid, admin.email), true);
  } finally {
    process.env.ADMIN_EMAILS = previous;
  }
  const doc = (await getAdminDb().doc(`users/${admin.uid}`).get()).data()!;
  assert.equal(doc.isAdmin, true);
  assert.equal(doc.role, 'owner');

  const regular = account();
  await bootstrapAccount(regular);
  assert.equal(await syncPlatformAdminFlag(regular.uid, regular.email), false);
  assert.equal((await getAdminDb().doc(`users/${regular.uid}`).get()).data()!.isAdmin, undefined);
});
