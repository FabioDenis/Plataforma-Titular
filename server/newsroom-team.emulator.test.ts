import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test, { after } from 'node:test';
import { deleteApp } from 'firebase-admin/app';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-titular';
process.env.GCLOUD_PROJECT = 'demo-titular';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

const { adminApp, getAdminDb } = await import('./firebase-admin');
const { bootstrapAccount } = await import('./auth-bootstrap');
const { listManagedOrganizations } = await import('./organization-admin');
const {
  addOrganizationMember,
  removeOrganizationMember,
  listOrganizationMembers,
  acceptPendingInvites,
  createManagedOrganization,
  setOrganizationSeatLimit,
  setOrganizationManager,
  requireTeamManagerOrganization,
  MembershipError,
} = await import('./organization-members');
const { createApp } = await import('../server');

after(async () => {
  await deleteApp(adminApp);
});

let sequence = 0;
function account(verified = true) {
  sequence += 1;
  const stamp = `${sequence}-${Date.now()}`;
  return { uid: `team-user-${stamp}`, email: `team-${stamp}@example.test`, emailVerified: verified };
}
type Account = ReturnType<typeof account>;

function directory(...accounts: Account[]) {
  return async (email: string) => accounts.find((a) => a.email === email.toLowerCase()) || null;
}

const isCode = (code: string) => (error: unknown) => error instanceof MembershipError && error.code === code;
const admin = { kind: 'platform-admin' } as const;
const managedBy = (uid: string) => ({ kind: 'manager', uid }) as const;

/** A managed newsroom with a manager account already linked and assigned. */
async function managedNewsroom(seatLimit: number | null = null) {
  const orgId = await createManagedOrganization({ name: `Medio ${sequence}`, adminUid: 'platform-admin', seatLimit });
  const manager = account();
  await addOrganizationMember({ orgId, email: manager.email, invitedByUid: 'platform-admin' }, directory(manager));
  await setOrganizationManager({ orgId, email: manager.email }, directory(manager));
  return { orgId, manager };
}

const neverCreate = async () => {
  throw new Error('createAccount must not be called');
};

// --- Seat limit (S1) ---

test('a newsroom is created with a seat limit, which the admin can change or clear', async () => {
  const orgId = await createManagedOrganization({ name: 'Radio Cupo', adminUid: 'platform-admin', seatLimit: 5 });
  const db = getAdminDb();
  assert.equal((await db.doc(`organizations/${orgId}`).get()).data()!.seatLimit, 5);

  await setOrganizationSeatLimit({ orgId, seatLimit: 2 });
  assert.equal((await db.doc(`organizations/${orgId}`).get()).data()!.seatLimit, 2);
  await setOrganizationSeatLimit({ orgId, seatLimit: null });
  assert.equal((await db.doc(`organizations/${orgId}`).get()).data()!.seatLimit, undefined);
});

test('a newsroom created without a seat limit has none', async () => {
  const orgId = await createManagedOrganization({ name: 'Radio Libre', adminUid: 'platform-admin' });
  assert.equal((await getAdminDb().doc(`organizations/${orgId}`).get()).data()!.seatLimit, undefined);
  assert.equal((await listOrganizationMembers(orgId)).seatLimit, null);
});

test('seat limits must be whole numbers between 1 and 1000', async () => {
  const orgId = await createManagedOrganization({ name: 'Radio Validada', adminUid: 'platform-admin' });
  for (const seatLimit of [0, -1, 2.5, 1001, '3', Number.NaN]) {
    await assert.rejects(setOrganizationSeatLimit({ orgId, seatLimit }), isCode('INVALID_SEAT_LIMIT'), String(seatLimit));
    await assert.rejects(createManagedOrganization({ name: 'Radio X', adminUid: 'a', seatLimit }), isCode('INVALID_SEAT_LIMIT'), String(seatLimit));
  }
  await assert.rejects(setOrganizationSeatLimit({ orgId: 'missing-org', seatLimit: 3 }), isCode('ORGANIZATION_NOT_FOUND'));
});

test('the manager fills the seat limit with active accounts and pending invites, then is blocked', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  const reporter = account();
  const unverified = account(false);
  const find = directory(manager, reporter, unverified);

  assert.equal((await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find)).status, 'active');
  assert.equal((await addOrganizationMember({ orgId, email: unverified.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find)).status, 'pending');

  const listing = await listOrganizationMembers(orgId);
  assert.equal(listing.seatLimit, 3);
  assert.equal(listing.seatsUsed, 3);

  const extra = `extra-${Date.now()}@example.test`;
  await assert.rejects(
    addOrganizationMember({ orgId, email: extra, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find, neverCreate),
    isCode('SEAT_LIMIT_REACHED')
  );
  assert.equal((await getAdminDb().doc(`invites/${extra}`).get()).exists, false);
});

test('a pending invite keeps its seat until it is removed', async () => {
  const { orgId, manager } = await managedNewsroom(2);
  const unverified = account(false);
  const later = account();
  const find = directory(manager, unverified, later);
  await addOrganizationMember({ orgId, email: unverified.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find);

  await assert.rejects(
    addOrganizationMember({ orgId, email: later.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find),
    isCode('SEAT_LIMIT_REACHED')
  );

  await removeOrganizationMember({ orgId, email: unverified.email, actor: managedBy(manager.uid) }, find);
  assert.equal((await addOrganizationMember({ orgId, email: later.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find)).status, 'active');
});

test('adding an account that already has a seat does not need a new one', async () => {
  const { orgId, manager } = await managedNewsroom(2);
  const reporter = account();
  const find = directory(manager, reporter);
  await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find);

  const again = await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find);
  assert.equal(again.status, 'active');
  assert.equal((await listOrganizationMembers(orgId)).seatsUsed, 2);
});

test('a manager invite for a new email is refused before any account is created when the newsroom is full', async () => {
  const { orgId, manager } = await managedNewsroom(1);
  await assert.rejects(
    addOrganizationMember({ orgId, email: `new-${Date.now()}@example.test`, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, directory(manager), neverCreate),
    isCode('SEAT_LIMIT_REACHED')
  );
});

test('a manager creates the account of a new email while there is a free seat', async () => {
  const { orgId, manager } = await managedNewsroom(2);
  const email = `fresh-${Date.now()}@example.test`;
  const created = { uid: `fresh-${Date.now()}`, email, emailVerified: true };
  const result = await addOrganizationMember(
    { orgId, email, invitedByUid: manager.uid, actor: managedBy(manager.uid) },
    directory(manager),
    async () => created
  );
  assert.deepEqual(result, { status: 'created', email, uid: created.uid });
  assert.equal((await listOrganizationMembers(orgId)).seatsUsed, 2);
});

test('the platform admin can go over the seat limit', async () => {
  const { orgId, manager } = await managedNewsroom(1);
  const reporter = account();
  const result = await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: 'platform-admin', actor: admin }, directory(manager, reporter));
  assert.equal(result.status, 'active');
  assert.equal((await listOrganizationMembers(orgId)).seatsUsed, 2);
});

test('lowering the limit below the current team keeps everyone and only blocks new accounts', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  const first = account();
  const second = account();
  const third = account();
  const find = directory(manager, first, second, third);
  await addOrganizationMember({ orgId, email: first.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find);
  await addOrganizationMember({ orgId, email: second.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find);

  await setOrganizationSeatLimit({ orgId, seatLimit: 1 });

  const listing = await listOrganizationMembers(orgId);
  assert.deepEqual(listing.members.map((m) => m.uid).sort(), [manager.uid, first.uid, second.uid].sort());
  assert.equal(listing.seatsUsed, 3);
  await assert.rejects(
    addOrganizationMember({ orgId, email: third.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find),
    isCode('SEAT_LIMIT_REACHED')
  );
});

test('without a seat limit the manager can add accounts freely', async () => {
  const { orgId, manager } = await managedNewsroom(null);
  const accounts = [account(), account(), account()];
  const find = directory(manager, ...accounts);
  for (const a of accounts) {
    assert.equal((await addOrganizationMember({ orgId, email: a.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find)).status, 'active');
  }
});

test('a pending invite is accepted even after the limit was lowered, because it already holds a seat', async () => {
  const { orgId, manager } = await managedNewsroom(2);
  const invited = account(false);
  await addOrganizationMember({ orgId, email: invited.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, directory(manager, invited));
  await setOrganizationSeatLimit({ orgId, seatLimit: 1 });

  assert.equal(await acceptPendingInvites({ uid: invited.uid, email: invited.email, emailVerified: true }), orgId);
  assert.ok((await listOrganizationMembers(orgId)).members.some((m) => m.uid === invited.uid));
});

// --- Manager (S2) ---

test('the manager must be an account of the newsroom, and the admin can clear it', async () => {
  const orgId = await createManagedOrganization({ name: 'Radio Responsable', adminUid: 'platform-admin' });
  const outsider = account();
  const member = account();
  await addOrganizationMember({ orgId, email: member.email, invitedByUid: 'platform-admin' }, directory(member));

  await assert.rejects(setOrganizationManager({ orgId, email: outsider.email }, directory(outsider, member)), isCode('MANAGER_MUST_BE_MEMBER'));
  await assert.rejects(setOrganizationManager({ orgId, email: 'nobody@example.test' }, directory(member)), isCode('MANAGER_MUST_BE_MEMBER'));

  await setOrganizationManager({ orgId, email: member.email }, directory(member));
  assert.equal((await listOrganizationMembers(orgId)).managerUid, member.uid);

  await setOrganizationManager({ orgId, email: null }, directory(member));
  assert.equal((await listOrganizationMembers(orgId)).managerUid, null);
});

test('only the manager of an active or in-preparation newsroom can manage its team', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  const member = account();
  await addOrganizationMember({ orgId, email: member.email, invitedByUid: 'platform-admin' }, directory(member));

  assert.equal(await requireTeamManagerOrganization(manager.uid), orgId);
  await assert.rejects(requireTeamManagerOrganization(member.uid), isCode('NOT_TEAM_MANAGER'));
  await assert.rejects(requireTeamManagerOrganization('unknown-user'), isCode('NOT_TEAM_MANAGER'));

  await getAdminDb().doc(`organizations/${orgId}`).set({ status: 'suspended' }, { merge: true });
  await assert.rejects(requireTeamManagerOrganization(manager.uid), isCode('TEAM_SUSPENDED'));
});

test('the manager can remove other accounts but not itself', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  const reporter = account();
  const find = directory(manager, reporter);
  await addOrganizationMember({ orgId, email: reporter.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, find);

  await assert.rejects(removeOrganizationMember({ orgId, email: manager.email, actor: managedBy(manager.uid) }, find), isCode('MANAGER_CANNOT_REMOVE_SELF'));
  await removeOrganizationMember({ orgId, email: reporter.email, actor: managedBy(manager.uid) }, find);

  const listing = await listOrganizationMembers(orgId);
  assert.deepEqual(listing.members.map((m) => m.uid), [manager.uid]);
});

test('when the admin removes the manager the newsroom is left without one', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  await removeOrganizationMember({ orgId, email: manager.email }, directory(manager));
  assert.equal((await getAdminDb().doc(`organizations/${orgId}`).get()).data()!.managerUid, undefined);
  await assert.rejects(requireTeamManagerOrganization(manager.uid), isCode('NOT_TEAM_MANAGER'));
});

// --- Safety (S3) ---

test('a manager cannot pull an account that belongs to another newsroom', async () => {
  const first = await managedNewsroom(5);
  const second = await managedNewsroom(5);
  const reporter = account();
  const find = directory(first.manager, second.manager, reporter);
  await addOrganizationMember({ orgId: first.orgId, email: reporter.email, invitedByUid: 'platform-admin' }, find);

  await assert.rejects(
    addOrganizationMember({ orgId: second.orgId, email: reporter.email, invitedByUid: second.manager.uid, actor: managedBy(second.manager.uid) }, find),
    isCode('ACCOUNT_IN_OTHER_NEWSROOM')
  );
  // Nor the other newsroom's manager, nor an account that owns its own newsroom.
  await assert.rejects(
    addOrganizationMember({ orgId: second.orgId, email: first.manager.email, invitedByUid: second.manager.uid, actor: managedBy(second.manager.uid) }, find),
    isCode('ACCOUNT_IN_OTHER_NEWSROOM')
  );
  const owner = account();
  await bootstrapAccount(owner);
  await assert.rejects(
    addOrganizationMember({ orgId: second.orgId, email: owner.email, invitedByUid: second.manager.uid, actor: managedBy(second.manager.uid) }, directory(owner)),
    isCode('ACCOUNT_IN_OTHER_NEWSROOM')
  );

  const db = getAdminDb();
  assert.ok(((await db.doc(`organizations/${first.orgId}`).get()).data()!.members as string[]).includes(reporter.uid));
  assert.equal((await db.doc(`users/${reporter.uid}`).get()).data()!.organizationId, first.orgId);
});

test('a manager cannot take over an invite to another newsroom', async () => {
  const first = await managedNewsroom(5);
  const second = await managedNewsroom(5);
  const invited = account(false);
  await addOrganizationMember({ orgId: first.orgId, email: invited.email, invitedByUid: 'platform-admin' }, directory(invited));

  await assert.rejects(
    addOrganizationMember({ orgId: second.orgId, email: invited.email, invitedByUid: second.manager.uid, actor: managedBy(second.manager.uid) }, directory(invited)),
    isCode('ACCOUNT_IN_OTHER_NEWSROOM')
  );
  assert.equal((await getAdminDb().doc(`invites/${invited.email}`).get()).data()!.orgId, first.orgId);
});

test('a manager cannot remove accounts of another newsroom', async () => {
  const first = await managedNewsroom(5);
  const second = await managedNewsroom(5);
  await assert.rejects(
    removeOrganizationMember({ orgId: first.orgId, email: first.manager.email, actor: managedBy(second.manager.uid) }, directory(first.manager)),
    isCode('NOT_TEAM_MANAGER')
  );
});

test('the platform admin still moves an account between newsrooms', async () => {
  const first = await managedNewsroom(5);
  const second = await managedNewsroom(5);
  const reporter = account();
  const find = directory(reporter);
  await addOrganizationMember({ orgId: first.orgId, email: reporter.email, invitedByUid: 'platform-admin' }, find);
  await addOrganizationMember({ orgId: second.orgId, email: reporter.email, invitedByUid: 'platform-admin' }, find);
  assert.equal((await getAdminDb().doc(`users/${reporter.uid}`).get()).data()!.organizationId, second.orgId);
});

test('the admin newsroom list shows the seat limit, seats in use and the manager', async () => {
  const { orgId, manager } = await managedNewsroom(4);
  const invited = account(false);
  await addOrganizationMember({ orgId, email: invited.email, invitedByUid: manager.uid, actor: managedBy(manager.uid) }, directory(manager, invited));

  const row = (await listManagedOrganizations()).find((r) => r.id === orgId)!;
  assert.equal(row.seatLimit, 4);
  assert.equal(row.seatsUsed, 2);
  assert.equal(row.managerEmail, manager.email);
});

// --- Team endpoints used by the manager ---

function fakeAuth(req: any, res: any, next: any) {
  if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ code: 'INVALID_TOKEN' });
  req.user = { uid: req.headers['x-test-user'], email: req.headers['x-test-email'] || 'test@example.invalid' };
  return next();
}

async function withTeamApp(accounts: Account[], run: (baseUrl: string) => Promise<void>) {
  const app = await createApp({
    verifyAuth: fakeAuth as any,
    skipStatic: true,
    membership: { findAccount: directory(...accounts), createAccount: neverCreate, deleteAccount: async () => {} },
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function as(user: Account) {
  return { authorization: 'Bearer test-token', 'x-test-user': user.uid, 'x-test-email': user.email, 'content-type': 'application/json' };
}

test('the team endpoints let only the manager list, add and remove accounts of its newsroom', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  const reporter = account();
  const member = account();
  await addOrganizationMember({ orgId, email: member.email, invitedByUid: 'platform-admin' }, directory(member));

  await withTeamApp([manager, reporter, member], async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/team/members`)).status, 401);
    const denied = await fetch(`${baseUrl}/api/team/members`, { headers: as(member) });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).code, 'NOT_TEAM_MANAGER');

    const add = await fetch(`${baseUrl}/api/team/members`, { method: 'POST', headers: as(manager), body: JSON.stringify({ email: reporter.email }) });
    assert.equal(add.status, 200);
    assert.equal((await add.json()).status, 'active');

    const listing = await (await fetch(`${baseUrl}/api/team/members`, { headers: as(manager) })).json();
    assert.equal(listing.seatLimit, 3);
    assert.equal(listing.seatsUsed, 3);
    assert.equal(listing.managerUid, manager.uid);

    const full = await fetch(`${baseUrl}/api/team/members`, { method: 'POST', headers: as(manager), body: JSON.stringify({ email: 'one-more@example.test' }) });
    assert.equal(full.status, 409);
    assert.equal((await full.json()).code, 'SEAT_LIMIT_REACHED');

    const self = await fetch(`${baseUrl}/api/team/members/remove`, { method: 'POST', headers: as(manager), body: JSON.stringify({ email: manager.email }) });
    assert.equal(self.status, 409);
    const removed = await fetch(`${baseUrl}/api/team/members/remove`, { method: 'POST', headers: as(manager), body: JSON.stringify({ email: reporter.email }) });
    assert.equal(removed.status, 200);
  });
});

test('invites sent by a manager record who sent them and are rate limited per hour', async () => {
  const { orgId, manager } = await managedNewsroom(10);
  const first = account(false);
  const second = account(false);
  process.env.TEAM_INVITES_PER_HOUR = '1';
  try {
    await withTeamApp([manager, first, second], async (baseUrl) => {
      const ok = await fetch(`${baseUrl}/api/team/members`, { method: 'POST', headers: as(manager), body: JSON.stringify({ email: first.email }) });
      assert.equal(ok.status, 200);
      const limited = await fetch(`${baseUrl}/api/team/members`, { method: 'POST', headers: as(manager), body: JSON.stringify({ email: second.email }) });
      assert.equal(limited.status, 429);
    });
  } finally {
    delete process.env.TEAM_INVITES_PER_HOUR;
  }
  const invite = (await getAdminDb().doc(`invites/${first.email}`).get()).data()!;
  assert.equal(invite.orgId, orgId);
  assert.equal(invite.invitedByUid, manager.uid);
  assert.equal((await getAdminDb().doc(`invites/${second.email}`).get()).exists, false);
});

test('a suspended newsroom cannot be managed through the team endpoints', async () => {
  const { orgId, manager } = await managedNewsroom(3);
  await getAdminDb().doc(`organizations/${orgId}`).set({ status: 'suspended' }, { merge: true });
  await withTeamApp([manager], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/team/members`, { headers: as(manager) });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'TEAM_SUSPENDED');
  });
});
