import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-titular-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});

after(async () => {
  await env?.cleanup();
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { uid: 'alice', email: 'alice@example.test', role: 'owner', organizationId: 'org_alice' });
    await setDoc(doc(db, 'users/bob'), { uid: 'bob', email: 'bob@example.test', role: 'owner', organizationId: 'org_bob' });
    await setDoc(doc(db, 'users/admin'), { uid: 'admin', email: 'admin@example.test', role: 'admin', isAdmin: true, organizationId: 'org_admin' });
    await setDoc(doc(db, 'organizations/org_alice'), { name: 'Alice Media', ownerUid: 'alice', plan: 'trial', publicationLimit: 3, publicationUsed: 2, status: 'Activa' });
    await setDoc(doc(db, 'organizations/org_bob'), { name: 'Bob Media', ownerUid: 'bob', members: ['carol'], plan: 'trial', publicationLimit: 3, publicationUsed: 0, status: 'Activa' });
    await setDoc(doc(db, 'users/carol'), { uid: 'carol', email: 'carol@example.test', role: 'owner', organizationId: 'org_bob' });
    await setDoc(doc(db, 'invites/dave@example.test'), { email: 'dave@example.test', orgId: 'org_bob' });
    await setDoc(doc(db, 'organizations/org_bob/publications/p1'), { title: 'Bob post' });
    await setDoc(doc(db, 'organizations/org_bob/generationLedger/m1'), { amountAdded: 10 });
  });
}

const as = (uid: string, email = `${uid}@example.test`) => env.authenticatedContext(uid, { email }).firestore();

// --- Privilege escalation ---

test('a new user cannot create their own profile with an admin role', async () => {
  await seed();
  const db = as('mallory');
  await assertFails(setDoc(doc(db, 'users/mallory'), { uid: 'mallory', role: 'admin', isAdmin: true }));
});

test('a user cannot grant themselves admin on an existing profile', async () => {
  await seed();
  await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { isAdmin: true, role: 'admin' }));
});

// --- Credits ---

test('a client cannot create an organization (and its trial credits) directly', async () => {
  await seed();
  await assertFails(
    setDoc(doc(as('alice'), 'organizations/org_free'), {
      name: 'Free', ownerUid: 'alice', plan: 'trial', publicationLimit: 999999, publicationUsed: 0, status: 'Activa',
    })
  );
});

test('an owner cannot reset their own consumption counter', async () => {
  await seed();
  await assertFails(updateDoc(doc(as('alice'), 'organizations/org_alice'), { publicationUsed: 0 }));
});

test('an owner cannot change plan, limit, status or ownership', async () => {
  await seed();
  const ref = doc(as('alice'), 'organizations/org_alice');
  await assertFails(updateDoc(ref, { plan: 'professional' }));
  await assertFails(updateDoc(ref, { publicationLimit: 1 }));
  await assertFails(updateDoc(ref, { status: 'Suspendida' }));
  await assertFails(updateDoc(ref, { ownerUid: 'bob' }));
  await assertFails(updateDoc(ref, { members: ['alice', 'mallory'] }));
});

test('an owner can still update branding fields used by the app', async () => {
  await seed();
  const ref = doc(as('alice'), 'organizations/org_alice');
  await assertSucceeds(updateDoc(ref, { name: 'Alice News' }));
  await assertSucceeds(updateDoc(ref, { logoUrl: 'https://example.test/logo.png' }));
  await assertSucceeds(
    updateDoc(ref, {
      activeOfficialTemplateId: 'tpl-1',
      activeOfficialTemplateName: 'Clásica',
      activeOfficialTemplateCustomization: { accent: '#fff' },
    })
  );
});

// --- Tenant isolation ---

test('a user cannot point their profile at another organization', async () => {
  await seed();
  await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { organizationId: 'org_bob' }));
});

test('a user can keep their profile pointed at an organization they own', async () => {
  await seed();
  await assertSucceeds(setDoc(doc(as('alice'), 'users/alice'), { organizationId: 'org_alice' }, { merge: true }));
});

test('a user cannot read or modify another organization', async () => {
  await seed();
  const db = as('alice');
  await assertFails(getDoc(doc(db, 'organizations/org_bob')));
  await assertFails(updateDoc(doc(db, 'organizations/org_bob'), { name: 'Hacked' }));
  await assertFails(deleteDoc(doc(db, 'organizations/org_bob')));
  await assertFails(getDocs(collection(db, 'organizations')));
});

test('a user cannot read or write another organization publications or ledger', async () => {
  await seed();
  const db = as('alice');
  await assertFails(getDoc(doc(db, 'organizations/org_bob/publications/p1')));
  await assertFails(setDoc(doc(db, 'organizations/org_bob/publications/p2'), { title: 'Injected' }));
  await assertFails(getDoc(doc(db, 'organizations/org_bob/generationLedger/m1')));
});

test('an owner can read their own organization, profile and owned-organizations query', async () => {
  await seed();
  const db = as('alice');
  await assertSucceeds(getDoc(doc(db, 'users/alice')));
  await assertSucceeds(getDoc(doc(db, 'organizations/org_alice')));
  await assertSucceeds(getDocs(query(collection(db, 'organizations'), where('ownerUid', '==', 'alice'))));
});

test('an owner cannot write publications or ledger entries from the client', async () => {
  await seed();
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'organizations/org_alice/publications/p9'), { title: 'x' }));
  await assertFails(setDoc(doc(db, 'organizations/org_alice/generationLedger/m9'), { amountAdded: 1000 }));
});

test('a platform admin (server-assigned) can read any organization', async () => {
  await seed();
  await assertSucceeds(getDoc(doc(as('admin'), 'organizations/org_bob')));
});

test('an email that used to be hardcoded as admin is not admin by itself', async () => {
  await seed();
  await assertFails(getDoc(doc(as('ex', 'delgado122016@gmail.com'), 'organizations/org_bob')));
});

// --- Team members ---

test('a member of a newsroom can read it and edit its branding, but not its members or balance', async () => {
  await seed();
  const db = as('carol');
  await assertSucceeds(getDoc(doc(db, 'organizations/org_bob')));
  await assertSucceeds(updateDoc(doc(db, 'organizations/org_bob'), { name: 'Bob Media Noticias' }));
  await assertFails(updateDoc(doc(db, 'organizations/org_bob'), { members: ['carol', 'mallory'] }));
  await assertFails(updateDoc(doc(db, 'organizations/org_bob'), { publicationLimit: 999 }));
  await assertSucceeds(getDoc(doc(db, 'organizations/org_bob/publications/p1')));
});

test('invites are never readable or writable from the client', async () => {
  await seed();
  await assertFails(getDoc(doc(as('dave', 'dave@example.test'), 'invites/dave@example.test')));
  await assertFails(setDoc(doc(as('mallory'), 'invites/mallory@example.test'), { orgId: 'org_bob' }));
});
