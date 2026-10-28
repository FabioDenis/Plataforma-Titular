import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getClientDb } from '../lib/firebase';
import { useOrganization } from '../context/OrganizationContext';
import { DEFAULT_IDENTITY } from '../data/sampleIdentities';
import { GeneratedNewsResult, OrganizationIdentity, OutletBranding } from '../types';

const HISTORY_LIMIT = 50;

export const DEFAULT_BRANDING: OutletBranding = {
  name: 'Tu Medio Digital',
  accentColor: '#2563eb',
  themeStyle: 'dark',
};

// Browser keys from the single-user era. Their owner is unknown, so they are discarded, never migrated.
const LEGACY_STORAGE_PREFIXES = ['newsflow_ai_', 'hermes_active_official_template_', 'hermes_tmpl_custom_', 'hermes_custom_templates_'];

function clearLegacyBrowserStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && LEGACY_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable (private mode); nothing to clean then.
  }
}

/** Firestore rejects undefined values; JSON round-tripping drops them. */
function toFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export interface OrganizationWorkspace {
  ready: boolean;
  identities: OrganizationIdentity[];
  activeIdentityId: string;
  branding: OutletBranding;
  history: GeneratedNewsResult[];
  saveIdentity: (identity: OrganizationIdentity) => Promise<void>;
  deleteIdentity: (id: string) => Promise<void>;
  setActiveIdentityId: (id: string) => Promise<void>;
  saveBranding: (branding: OutletBranding) => Promise<void>;
  addHistoryItem: (item: GeneratedNewsResult, replaceSameUrl?: boolean) => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

/**
 * The newsroom workspace shared by every member of the active organization:
 * organizations/{orgId}/identities, organizations/{orgId}/history and the
 * organization's activeIdentityId and branding fields. Nothing is kept in browser storage,
 * so two accounts on the same browser never see each other's data.
 */
export function useOrganizationWorkspace(): OrganizationWorkspace {
  const { organization, updateOrganization } = useOrganization();
  const orgId = organization?.id || null;
  const orgName = organization?.name;

  const [identities, setIdentities] = useState<OrganizationIdentity[]>([]);
  const [history, setHistory] = useState<GeneratedNewsResult[]>([]);
  const [identitiesLoaded, setIdentitiesLoaded] = useState(false);
  const seededOrgRef = useRef<string | null>(null);
  const orgNameRef = useRef(orgName);
  orgNameRef.current = orgName;

  useEffect(() => {
    clearLegacyBrowserStorage();
  }, []);

  useEffect(() => {
    setIdentities([]);
    setHistory([]);
    setIdentitiesLoaded(false);
    if (!orgId) return;

    const db = getClientDb();
    const identitiesRef = collection(db, 'organizations', orgId, 'identities');
    const unsubIdentities = onSnapshot(
      identitiesRef,
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as OrganizationIdentity), id: d.id }));
        list.sort((a, b) => (a.id === DEFAULT_IDENTITY.id ? -1 : b.id === DEFAULT_IDENTITY.id ? 1 : a.name.localeCompare(b.name)));
        setIdentities(list);
        setIdentitiesLoaded(true);

        // A newsroom without identities gets the default one, named after the newsroom.
        if (list.length === 0 && !snap.metadata.fromCache && seededOrgRef.current !== orgId) {
          seededOrgRef.current = orgId;
          const seed: OrganizationIdentity = {
            ...DEFAULT_IDENTITY,
            name: orgNameRef.current || DEFAULT_IDENTITY.name,
            updatedAt: new Date().toISOString(),
          };
          // Transactional create-if-missing: concurrent members never overwrite each other's edits.
          const seedRef = doc(identitiesRef, seed.id);
          runTransaction(db, async (transaction) => {
            if ((await transaction.get(seedRef)).exists()) return;
            transaction.set(seedRef, toFirestore(seed));
          }).catch((err) => console.error('Error creating the default identity:', err));
        }
      },
      (err) => console.error('Error loading identities:', err)
    );

    const historyQuery = query(
      collection(db, 'organizations', orgId, 'history'),
      orderBy('createdAt', 'desc'),
      limit(HISTORY_LIMIT)
    );
    const unsubHistory = onSnapshot(
      historyQuery,
      (snap) => setHistory(snap.docs.map((d) => ({ ...(d.data() as GeneratedNewsResult), id: d.id }))),
      (err) => console.error('Error loading history:', err)
    );

    return () => {
      unsubIdentities();
      unsubHistory();
    };
  }, [orgId]);

  const requireOrgId = useCallback(() => {
    if (!orgId) throw new Error('No hay un medio activo.');
    return orgId;
  }, [orgId]);

  const saveIdentity = useCallback(
    async (identity: OrganizationIdentity) => {
      const id = requireOrgId();
      await setDoc(doc(getClientDb(), 'organizations', id, 'identities', identity.id), toFirestore(identity));
    },
    [requireOrgId]
  );

  const deleteIdentity = useCallback(
    async (identityId: string) => {
      const id = requireOrgId();
      await deleteDoc(doc(getClientDb(), 'organizations', id, 'identities', identityId));
    },
    [requireOrgId]
  );

  const setActiveIdentityId = useCallback(
    async (identityId: string) => {
      await updateOrganization({ activeIdentityId: identityId });
    },
    [updateOrganization]
  );

  const saveBranding = useCallback(
    async (branding: OutletBranding) => {
      await updateOrganization({ branding: toFirestore(branding) });
    },
    [updateOrganization]
  );

  const addHistoryItem = useCallback(
    async (item: GeneratedNewsResult, replaceSameUrl = false) => {
      const id = requireOrgId();
      const db = getClientDb();
      const batch = writeBatch(db);
      if (replaceSameUrl && item.article.url) {
        history
          .filter((h) => h.article?.url === item.article.url && h.id !== item.id)
          .forEach((h) => batch.delete(doc(db, 'organizations', id, 'history', h.id)));
      }
      batch.set(doc(db, 'organizations', id, 'history', item.id), toFirestore(item));
      await batch.commit();
    },
    [requireOrgId, history]
  );

  const deleteHistoryItem = useCallback(
    async (historyId: string) => {
      const id = requireOrgId();
      await deleteDoc(doc(getClientDb(), 'organizations', id, 'history', historyId));
    },
    [requireOrgId]
  );

  const clearHistory = useCallback(async () => {
    const id = requireOrgId();
    const db = getClientDb();
    const batch = writeBatch(db);
    history.forEach((h) => batch.delete(doc(db, 'organizations', id, 'history', h.id)));
    await batch.commit();
  }, [requireOrgId, history]);

  const storedActiveId = typeof organization?.activeIdentityId === 'string' ? organization.activeIdentityId : '';
  const activeIdentityId = identities.some((i) => i.id === storedActiveId)
    ? storedActiveId
    : identities[0]?.id || DEFAULT_IDENTITY.id;

  const storedBranding = organization?.branding;
  const branding: OutletBranding =
    storedBranding && typeof storedBranding === 'object' ? { ...DEFAULT_BRANDING, ...storedBranding } : DEFAULT_BRANDING;

  return {
    ready: Boolean(orgId) && identitiesLoaded,
    identities,
    activeIdentityId,
    branding,
    history,
    saveIdentity,
    deleteIdentity,
    setActiveIdentityId,
    saveBranding,
    addHistoryItem,
    deleteHistoryItem,
    clearHistory,
  };
}
