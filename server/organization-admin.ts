import { getAdminDb } from './firebase-admin';
import { MembershipError, requireOrganization } from './organization-members';
import { ORGANIZATION_LIFECYCLES, OrganizationLifecycle, organizationLifecycle } from './organization-lifecycle';

/**
 * Platform-admin view of newsrooms: lifecycle changes and AI consumption per newsroom.
 * Consumption comes from organizations/{orgId}/aiUsageMonthly/{YYYY-MM}, written by every completed generation.
 */

export interface MonthlyConsumption {
  publications: number;
  totalTokens: number;
  /** Null while the Gemini price table is not configured. */
  totalCostUsd: number | null;
}

export interface ManagedOrganizationRow {
  id: string;
  name: string;
  status: OrganizationLifecycle;
  ownerEmail: string;
  membersCount: number;
  pendingInvites: number;
  createdAt: string;
  lastGenerationAt: string | null;
  totalPublications: number;
  month: MonthlyConsumption;
}

export interface MonthlyUsageRow extends MonthlyConsumption {
  month: string;
}

function toConsumption(data: FirebaseFirestore.DocumentData | undefined): MonthlyConsumption {
  const cost = data?.totalCostUsd;
  return {
    publications: Number(data?.publications || 0),
    totalTokens: Number(data?.totalTokens || 0),
    totalCostUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
  };
}

export function currentMonthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** All newsrooms with their consumption in `month` (YYYY-MM), highest consumption first. */
export async function listManagedOrganizations(month: string = currentMonthKey()): Promise<ManagedOrganizationRow[]> {
  const db = getAdminDb();
  const orgs = (await db.collection('organizations').get()).docs;
  if (orgs.length === 0) return [];

  const usage = await db.getAll(...orgs.map((org) => org.ref.collection('aiUsageMonthly').doc(month)));
  const ownerUids = [...new Set(orgs.map((org) => org.data().ownerUid).filter((uid) => typeof uid === 'string' && uid))];
  const owners = ownerUids.length ? await db.getAll(...ownerUids.map((uid) => db.doc(`users/${uid}`))) : [];
  const emailOf = new Map(owners.map((snap) => [snap.id, String(snap.data()?.email || '')]));

  const invitesByOrg = new Map<string, number>();
  (await db.collection('invites').get()).docs.forEach((invite) => {
    const orgId = invite.data().orgId;
    if (typeof orgId === 'string') invitesByOrg.set(orgId, (invitesByOrg.get(orgId) || 0) + 1);
  });

  const rows = orgs.map((org, index): ManagedOrganizationRow => {
    const data = org.data();
    const members = Array.isArray(data.members) ? data.members : [];
    return {
      id: org.id,
      name: String(data.name || org.id),
      status: organizationLifecycle(data),
      ownerEmail: emailOf.get(data.ownerUid) || String(data.ownerEmail || ''),
      membersCount: members.length,
      pendingInvites: invitesByOrg.get(org.id) || 0,
      createdAt: String(data.createdAt || ''),
      lastGenerationAt: typeof data.lastGenerationAt === 'string' ? data.lastGenerationAt : null,
      totalPublications: Number(data.publicationUsed || 0),
      month: toConsumption(usage[index].data()),
    };
  });

  return rows.sort(
    (a, b) =>
      b.month.publications - a.month.publications ||
      b.month.totalTokens - a.month.totalTokens ||
      a.name.localeCompare(b.name)
  );
}

/** Month-by-month consumption of one newsroom, newest first (last 12 months with activity). */
export async function getOrganizationUsageHistory(orgId: string): Promise<MonthlyUsageRow[]> {
  const org = await requireOrganization(orgId);
  const snap = await org.ref.collection('aiUsageMonthly').orderBy('month', 'desc').limit(12).get();
  return snap.docs.map((doc) => ({ month: doc.id, ...toConsumption(doc.data()) }));
}

/** Moves a newsroom through its lifecycle and keeps an audit trail of who changed it. */
export async function setOrganizationLifecycle(input: { orgId: string; status: unknown; adminUid: string }): Promise<void> {
  const status = input.status as OrganizationLifecycle;
  if (!ORGANIZATION_LIFECYCLES.includes(status)) throw new MembershipError('INVALID_STATUS');
  const org = await requireOrganization(input.orgId);
  const now = new Date().toISOString();
  const db = getAdminDb();
  const batch = db.batch();
  batch.set(
    org.ref,
    {
      status,
      statusChangedAt: now,
      statusChangedBy: input.adminUid,
      ...(status === 'active' && !org.data()?.activatedAt ? { activatedAt: now } : {}),
      updatedAt: now,
    },
    { merge: true }
  );
  batch.set(org.ref.collection('statusEvents').doc(), { status, changedBy: input.adminUid, createdAt: now });
  await batch.commit();
}
