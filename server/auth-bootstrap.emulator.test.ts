import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { deleteApp } from 'firebase-admin/app';

process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-titular';
process.env.GCLOUD_PROJECT = 'demo-titular';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085';

const { adminApp, getAdminDb } = await import('./firebase-admin');
const { bootstrapAccount, BootstrapConflictError } = await import('./auth-bootstrap');

after(async () => {
  await deleteApp(adminApp);
});

let sequence = 0;
function identity() {
  sequence += 1;
  return { uid: `bootstrap-user-${sequence}`, email: `bootstrap-${sequence}@example.test` };
}

test('new registration creates the canonical user and default organization atomically', async () => {
  const current = identity();
  const result = await bootstrapAccount(current);

  assert.equal(result.user.id, current.uid);
  assert.equal(result.user.organizationId, `org_${current.uid}`);
  assert.equal(result.organization.id, `org_${current.uid}`);
  assert.equal(result.organization.ownerUid, current.uid);
  assert.equal(result.organization.plan, 'trial');
  assert.equal(result.organization.publicationLimit, 3);
  assert.equal(result.organization.publicationUsed, 0);
  assert.equal(result.organization.status, 'Activa');
  assert.equal(result.organization.orgType, 'Medio Digital');
});

test('repeat bootstrap preserves the valid relationship, unknown fields, benefits, and trial usage', async () => {
  const current = identity();
  const first = await bootstrapAccount(current);
  const db = getAdminDb();
  await db.doc(`organizations/${first.organization.id}`).set({
    plan: 'professional',
    publicationLimit: 42,
    publicationUsed: 1,
    credits: 17,
    benefits: { welcome: true },
    branding: { color: '#123456' },
    subscriptionId: 'subscription-test',
    customField: 'preserve-me',
  }, { merge: true });
  const before = (await db.doc(`organizations/${first.organization.id}`).get()).data()!;

  const repeated = await bootstrapAccount(current);
  const after = (await db.doc(`organizations/${first.organization.id}`).get()).data()!;

  assert.equal(repeated.organization.id, first.organization.id);
  assert.deepEqual(after, before);
  assert.equal(after.publicationLimit, 42);
  assert.equal(after.publicationUsed, 1);
  assert.equal(after.benefits.welcome, true);
});

test('an existing valid non-default relationship is preserved without replacing document fields', async () => {
  const current = identity();
  const db = getAdminDb();
  const organizationId = `existing-${current.uid}`;
  const createdAt = '2024-01-01T00:00:00.000Z';
  await Promise.all([
    db.doc(`users/${current.uid}`).set({
      uid: current.uid,
      email: 'original@example.test',
      organizationId,
      role: 'admin',
      createdAt,
    }),
    db.doc(`organizations/${organizationId}`).set({
      ownerUid: current.uid,
      name: 'Established outlet',
      plan: 'newsroom',
      publicationUsed: 9,
      createdAt,
      custom: { preserved: true },
    }),
  ]);

  const result = await bootstrapAccount(current);
  assert.equal(result.organization.id, organizationId);
  assert.equal(result.user.email, 'original@example.test');
  assert.equal(result.user.role, 'admin');
  assert.equal(result.organization.plan, 'newsroom');
  assert.equal(result.organization.publicationLimit, undefined);
  assert.deepEqual(result.organization.custom, { preserved: true });
  assert.equal((await db.doc(`organizations/org_${current.uid}`).get()).exists, false);
});

test('safe partial states are repaired deterministically', async () => {
  const db = getAdminDb();

  const missingReferenced = identity();
  const referencedId = `legacy-${missingReferenced.uid}`;
  await db.doc(`users/${missingReferenced.uid}`).set({ organizationId: referencedId, legacyUserField: true });
  const recreated = await bootstrapAccount(missingReferenced);
  assert.equal(recreated.organization.id, referencedId);
  assert.equal(recreated.organization.ownerUid, missingReferenced.uid);
  assert.equal(recreated.user.legacyUserField, true);

  const organizationOnly = identity();
  await db.doc(`organizations/org_${organizationOnly.uid}`).set({
    ownerUid: organizationOnly.uid,
    plan: 'starter',
    publicationLimit: 8,
    publicationUsed: 2,
  });
  const reused = await bootstrapAccount(organizationOnly);
  assert.equal(reused.organization.id, `org_${organizationOnly.uid}`);
  assert.equal(reused.organization.plan, 'starter');
  assert.equal(reused.organization.publicationUsed, 2);

  const oneOwnedOrganization = identity();
  await Promise.all([
    db.doc(`users/${oneOwnedOrganization.uid}`).set({ organizationId: 'missing-organization' }),
    db.doc(`organizations/only-${oneOwnedOrganization.uid}`).set({ ownerUid: oneOwnedOrganization.uid, name: 'Existing outlet' }),
  ]);
  const repaired = await bootstrapAccount(oneOwnedOrganization);
  assert.equal(repaired.organization.id, `only-${oneOwnedOrganization.uid}`);
  assert.equal(repaired.user.organizationId, `only-${oneOwnedOrganization.uid}`);
});

test('conflicting ownership returns 409 semantics without writes', async () => {
  const current = identity();
  const db = getAdminDb();
  const userRef = db.doc(`users/${current.uid}`);
  const conflictingOrgRef = db.doc(`organizations/conflict-${current.uid}`);
  await Promise.all([
    userRef.set({ organizationId: conflictingOrgRef.id, marker: 'unchanged' }),
    conflictingOrgRef.set({ ownerUid: 'another-user', plan: 'enterprise' }),
  ]);
  const userBefore = (await userRef.get()).data();
  const orgBefore = (await conflictingOrgRef.get()).data();

  await assert.rejects(
    () => bootstrapAccount(current),
    (error: any) => error instanceof BootstrapConflictError
  );

  assert.deepEqual((await userRef.get()).data(), userBefore);
  assert.deepEqual((await conflictingOrgRef.get()).data(), orgBefore);
  assert.equal((await db.doc(`organizations/org_${current.uid}`).get()).exists, false);
});

test('a conflicting default organization returns conflict without creating a user', async () => {
  const current = identity();
  const db = getAdminDb();
  const defaultOrgRef = db.doc(`organizations/org_${current.uid}`);
  await defaultOrgRef.set({ ownerUid: 'another-user', marker: 'unchanged' });
  const before = (await defaultOrgRef.get()).data();

  await assert.rejects(
    () => bootstrapAccount(current),
    (error: any) => error instanceof BootstrapConflictError
  );
  assert.deepEqual((await defaultOrgRef.get()).data(), before);
  assert.equal((await db.doc(`users/${current.uid}`).get()).exists, false);
});

test('ambiguous owned organizations return conflict without repairing the user', async () => {
  const current = identity();
  const db = getAdminDb();
  const userRef = db.doc(`users/${current.uid}`);
  await Promise.all([
    userRef.set({ email: current.email }),
    db.doc(`organizations/first-${current.uid}`).set({ ownerUid: current.uid }),
    db.doc(`organizations/second-${current.uid}`).set({ ownerUid: current.uid }),
  ]);

  await assert.rejects(
    () => bootstrapAccount(current),
    (error: any) => error instanceof BootstrapConflictError
  );
  assert.equal((await userRef.get()).data()?.organizationId, undefined);
});

test('concurrent bootstrap calls converge on one account and one free trial allocation', async () => {
  const current = identity();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => bootstrapAccount(current))
  );
  const organizationIds = new Set(results.map((result) => result.organization.id));
  const db = getAdminDb();
  const organizations = await db.collection('organizations').where('ownerUid', '==', current.uid).get();

  assert.deepEqual([...organizationIds], [`org_${current.uid}`]);
  assert.equal(organizations.size, 1);
  assert.equal(organizations.docs[0].data().publicationLimit, 3);
  assert.equal(organizations.docs[0].data().publicationUsed, 0);
});
