import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { deleteApp } from 'firebase-admin/app';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-titular';
process.env.GCLOUD_PROJECT = 'demo-titular';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

const { adminApp, getAdminDb } = await import('./firebase-admin');
const { createManagedOrganization, MembershipError } = await import('./organization-members');
const { listManagedOrganizations, setOrganizationLifecycle, getOrganizationUsageHistory } = await import('./organization-admin');

after(async () => {
  await deleteApp(adminApp);
});

const isCode = (code: string) => (error: unknown) => error instanceof MembershipError && error.code === code;
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('a newsroom created by the admin starts in preparation', async () => {
  const orgId = await createManagedOrganization({ name: `Draft ${unique()}`, adminUid: 'platform-admin' });
  assert.equal((await getAdminDb().doc(`organizations/${orgId}`).get()).data()!.status, 'draft');
});

test('the admin activates, suspends and reactivates a newsroom, and every change is recorded', async () => {
  const orgId = await createManagedOrganization({ name: `Lifecycle ${unique()}`, adminUid: 'platform-admin' });

  await setOrganizationLifecycle({ orgId, status: 'active', adminUid: 'platform-admin' });
  let org = (await getAdminDb().doc(`organizations/${orgId}`).get()).data()!;
  assert.equal(org.status, 'active');
  assert.equal(org.statusChangedBy, 'platform-admin');
  assert.ok(org.activatedAt);

  await setOrganizationLifecycle({ orgId, status: 'suspended', adminUid: 'platform-admin' });
  assert.equal((await getAdminDb().doc(`organizations/${orgId}`).get()).data()!.status, 'suspended');

  await setOrganizationLifecycle({ orgId, status: 'active', adminUid: 'platform-admin' });
  org = (await getAdminDb().doc(`organizations/${orgId}`).get()).data()!;
  assert.equal(org.status, 'active');

  const events = await getAdminDb().collection(`organizations/${orgId}/statusEvents`).get();
  assert.deepEqual(events.docs.map((d) => d.data().status).sort(), ['active', 'active', 'suspended']);
});

test('invalid lifecycle changes are rejected', async () => {
  const orgId = await createManagedOrganization({ name: `Invalid ${unique()}`, adminUid: 'platform-admin' });
  await assert.rejects(setOrganizationLifecycle({ orgId, status: 'paid', adminUid: 'a' }), isCode('INVALID_STATUS'));
  await assert.rejects(setOrganizationLifecycle({ orgId: 'missing-org', status: 'active', adminUid: 'a' }), isCode('ORGANIZATION_NOT_FOUND'));
});

test('the newsroom list shows status, team size and this month consumption, most expensive first', async () => {
  const db = getAdminDb();
  const month = '2031-01';
  const small = await createManagedOrganization({ name: `Small ${unique()}`, adminUid: 'platform-admin' });
  const big = await createManagedOrganization({ name: `Big ${unique()}`, adminUid: 'platform-admin' });
  await setOrganizationLifecycle({ orgId: big, status: 'active', adminUid: 'platform-admin' });
  await db.doc(`organizations/${big}`).set({ members: ['u1', 'u2'], lastGenerationAt: '2031-01-20T10:00:00.000Z', publicationUsed: 40 }, { merge: true });
  await db.doc(`organizations/${big}/aiUsageMonthly/${month}`).set({ month, publications: 30, totalTokens: 90000, totalCostUsd: 1.5 });
  await db.doc(`organizations/${small}/aiUsageMonthly/${month}`).set({ month, publications: 2, totalTokens: 4000, totalCostUsd: null });
  await db.doc(`invites/pending-${unique()}@example.test`).set({ orgId: big });

  const list = await listManagedOrganizations(month);
  const ours = list.filter((o) => o.id === big || o.id === small);

  assert.deepEqual(ours.map((o) => o.id), [big, small]);
  const bigRow = ours[0];
  assert.equal(bigRow.status, 'active');
  assert.equal(bigRow.membersCount, 2);
  assert.equal(bigRow.pendingInvites, 1);
  assert.equal(bigRow.month.publications, 30);
  assert.equal(bigRow.month.totalTokens, 90000);
  assert.equal(bigRow.month.totalCostUsd, 1.5);
  assert.equal(bigRow.totalPublications, 40);
  assert.equal(bigRow.lastGenerationAt, '2031-01-20T10:00:00.000Z');
  assert.equal(ours[1].status, 'draft');
  assert.equal(ours[1].month.totalCostUsd, null);
});

test('a newsroom without usage this month is listed with zero consumption', async () => {
  const orgId = await createManagedOrganization({ name: `Idle ${unique()}`, adminUid: 'platform-admin' });
  const row = (await listManagedOrganizations('2031-02')).find((o) => o.id === orgId)!;
  assert.deepEqual(row.month, { publications: 0, totalTokens: 0, totalCostUsd: null });
});

test('the usage history lists the newsroom months, newest first', async () => {
  const db = getAdminDb();
  const orgId = await createManagedOrganization({ name: `History ${unique()}`, adminUid: 'platform-admin' });
  for (const [month, publications] of [['2031-01', 5], ['2031-03', 9], ['2031-02', 7]] as const) {
    await db.doc(`organizations/${orgId}/aiUsageMonthly/${month}`).set({ month, publications, totalTokens: publications * 1000, totalCostUsd: null });
  }
  const history = await getOrganizationUsageHistory(orgId);
  assert.deepEqual(history.map((h) => [h.month, h.publications]), [['2031-03', 9], ['2031-02', 7], ['2031-01', 5]]);
});
