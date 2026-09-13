import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, collection, query, where, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getClientDb } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { DEFAULT_TRIAL_PUBLICATION_LIMIT } from '../types';

export interface OrganizationData {
  id: string; // organizationId in Firestore
  name: string; // Nombre de la organización
  ownerUid: string;
  plan: string; // Plan contratado (ej. 'trial', 'starter', 'professional', 'newsroom')
  publicationLimit: number; // Límite de publicaciones permitidas
  publicationUsed: number; // Publicaciones utilizadas
  createdAt: string; // Fecha de creación
  status: string; // Estado de la organización (ej. 'Activa', 'active')
  orgType?: string; // Tipo de entidad (ej. 'Medio Digital', 'Diario', etc.)
  websiteUrl?: string;
  instagramHandle?: string;
  logoUrl?: string;
  [key: string]: any;
}

export interface UseOrganizationReturn {
  organization: OrganizationData | null;
  organizations: OrganizationData[];
  activeOrgId: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  updateOrganization: (updates: Partial<OrganizationData>) => Promise<void>;
  incrementPublicationUsed: () => Promise<void>;
  createOrganization: (name: string, orgType: string) => Promise<void>;
  selectOrganization: (orgId: string) => Promise<void>;
}

const OrganizationContext = createContext<UseOrganizationReturn | null>(null);

function formatCreatedAt(val: any): string {
  if (!val) return new Date().toLocaleDateString('es-AR');
  if (typeof val === 'string') {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
      return val;
    } catch {
      return val;
    }
  }
  if (typeof val === 'object' && val && typeof val.toDate === 'function') {
    return val.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(val);
}

export const OrganizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, organizationReady, bootstrapOrganization } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(async () => {
    setReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!user) {
      setOrganizations([]);
      setActiveOrgId(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (!organizationReady) {
      setOrganizations([]);
      setActiveOrgId(null);
      setLoading(true);
      setError(null);
      return;
    }

    if (bootstrapOrganization) {
      const rawData = bootstrapOrganization;
      const initialOrganization: OrganizationData = {
        id: rawData.id,
        name: String(rawData.name || `Organización (${user.email?.split('@')[0] || 'Oficial'})`),
        ownerUid: String(rawData.ownerUid || user.uid),
        plan: String(rawData.plan || 'trial'),
        publicationLimit: Number(rawData.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT),
        publicationUsed: Number(rawData.publicationUsed ?? 0),
        createdAt: formatCreatedAt(rawData.createdAt),
        status: String(rawData.status || rawData.state || 'Activa'),
        orgType: String(rawData.orgType || 'Medio Digital'),
        ...rawData,
      } as OrganizationData;
      setOrganizations([initialOrganization]);
      setActiveOrgId(initialOrganization.id);
    }

    setLoading(true);
    setError(null);

    let unsubUser: (() => void) | null = null;
    let unsubOrgsQuery: (() => void) | null = null;
    let unsubSingleOrg: (() => void) | null = null;
    let isCancelled = false;

    try {
      const db = getClientDb();
      const userRef = doc(db, 'users', user.uid);

      // 1. Listen to users/{uid} to get organizationId
      unsubUser = onSnapshot(
        userRef,
        (userSnap) => {
          if (isCancelled) return;

          let userOrgId = userSnap.exists() ? userSnap.data()?.organizationId : undefined;
          if (!userOrgId) {
            userOrgId = `org_${user.uid}`;
          }

          setActiveOrgId(userOrgId);

          let queryOrgsList: OrganizationData[] = [];
          let singleOrgData: OrganizationData | null = null;

          const updateCombinedOrgs = () => {
            const combinedMap = new Map<string, OrganizationData>();
            if (singleOrgData) {
              combinedMap.set(singleOrgData.id, singleOrgData);
            }
            queryOrgsList.forEach((org) => {
              combinedMap.set(org.id, org);
            });
            const resultList = Array.from(combinedMap.values());
            setOrganizations(resultList);
            if (resultList.length > 0 && (!userOrgId || !combinedMap.has(userOrgId))) {
              setActiveOrgId(resultList[0].id);
            }
            setLoading(false);
            setError(null);
          };

          // Listen to organizations/{userOrgId}
          if (unsubSingleOrg) unsubSingleOrg();
          const singleOrgRef = doc(db, 'organizations', userOrgId);
          unsubSingleOrg = onSnapshot(
            singleOrgRef,
            (singleSnap) => {
              if (isCancelled) return;
              if (singleSnap.exists()) {
                const rawData = singleSnap.data();
                singleOrgData = {
                  id: singleSnap.id,
                  name: rawData.name || `Organización (${user.email?.split('@')[0] || 'Oficial'})`,
                  ownerUid: rawData.ownerUid || user.uid,
                  plan: rawData.plan || 'trial',
                  publicationLimit: rawData.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT,
                  publicationUsed: rawData.publicationUsed ?? 0,
                  createdAt: formatCreatedAt(rawData.createdAt),
                  status: rawData.status || rawData.state || 'Activa',
                  orgType: rawData.orgType || 'Medio Digital',
                  websiteUrl: rawData.websiteUrl || '',
                  instagramHandle: rawData.instagramHandle || '',
                  logoUrl: rawData.logoUrl || undefined,
                  ...rawData,
                };
              }
              updateCombinedOrgs();
            },
            (err) => {
              console.error('Error escuchando organizations/{userOrgId}:', err);
            }
          );

          // Listen to query organizations where ownerUid == user.uid
          if (unsubOrgsQuery) unsubOrgsQuery();
          const orgsQuery = query(
            collection(db, 'organizations'),
            where('ownerUid', '==', user.uid)
          );

          unsubOrgsQuery = onSnapshot(
            orgsQuery,
            (querySnap) => {
              if (isCancelled) return;

              let orgList: OrganizationData[] = [];
              querySnap.forEach((docSnap) => {
                const rawData = docSnap.data();
                orgList.push({
                  id: docSnap.id,
                  name: rawData.name || `Organización ${docSnap.id}`,
                  ownerUid: rawData.ownerUid || user.uid,
                  plan: rawData.plan || 'trial',
                  publicationLimit: rawData.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT,
                  publicationUsed: rawData.publicationUsed ?? 0,
                  createdAt: formatCreatedAt(rawData.createdAt),
                  status: rawData.status || rawData.state || 'Activa',
                  orgType: rawData.orgType || 'Medio Digital',
                  websiteUrl: rawData.websiteUrl || '',
                  instagramHandle: rawData.instagramHandle || '',
                  logoUrl: rawData.logoUrl || undefined,
                  ...rawData,
                });
              });

              queryOrgsList = orgList;

              updateCombinedOrgs();
            },
            (orgsErr) => {
              console.error('Error al consultar organizaciones en Firestore:', orgsErr);
              if (!isCancelled) {
                setError('No fue posible cargar la organización.');
                setLoading(false);
              }
            }
          );
        },
        (userErr) => {
          console.error('Error al consultar users/{uid}:', userErr);
          if (!isCancelled) {
            setError('No fue posible cargar la organización.');
            setOrganizations([]);
            setLoading(false);
          }
        }
      );

      return () => {
        isCancelled = true;
        if (unsubUser) unsubUser();
        if (unsubOrgsQuery) unsubOrgsQuery();
        if (unsubSingleOrg) unsubSingleOrg();
      };
    } catch (err) {
      console.error('Error conectando con Firestore:', err);
      setError('No fue posible cargar la organización.');
      setOrganizations([]);
      setLoading(false);
    }
  }, [user, organizationReady, bootstrapOrganization, reloadKey]);

  // Active Organization object
  const organization =
    organizations.find((o) => o.id === activeOrgId) || organizations[0] || null;

  const updateOrganization = useCallback(
    async (updates: Partial<OrganizationData>) => {
      const targetId = activeOrgId || organization?.id;
      if (!targetId || !user) return;
      try {
        const db = getClientDb();
        const orgRef = doc(db, 'organizations', targetId);
        await updateDoc(orgRef, updates);
      } catch (err) {
        console.error('Error al actualizar la organización:', err);
        throw err;
      }
    },
    [activeOrgId, organization?.id, user]
  );

  const incrementPublicationUsed = useCallback(async () => {
    const targetId = activeOrgId || organization?.id;
    if (!targetId || !user) return;
    try {
      const db = getClientDb();
      const orgRef = doc(db, 'organizations', targetId);
      const currentUsed = organization?.publicationUsed ?? 0;
      await updateDoc(orgRef, {
        publicationUsed: currentUsed + 1,
      });
    } catch (err) {
      console.error('Error al incrementar publicationUsed:', err);
    }
  }, [activeOrgId, organization?.id, organization?.publicationUsed, user]);

  const createOrganization = useCallback(
    async (name: string, orgType: string) => {
      if (!user) return;
      try {
        const db = getClientDb();
        const newOrgRef = doc(collection(db, 'organizations'));
        const newOrgData = {
          name,
          ownerUid: user.uid,
          plan: 'trial',
          publicationLimit: DEFAULT_TRIAL_PUBLICATION_LIMIT,
          publicationUsed: 0,
          createdAt: new Date().toISOString(),
          status: 'Activa',
          orgType: orgType || 'Medio Digital',
        };
        await setDoc(newOrgRef, newOrgData);

        // Update active org ID in users/{uid}
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { organizationId: newOrgRef.id }, { merge: true });
        setActiveOrgId(newOrgRef.id);
      } catch (err) {
        console.error('Error creando nueva organización en Firestore:', err);
        throw err;
      }
    },
    [user]
  );

  const selectOrganization = useCallback(
    async (orgId: string) => {
      if (!user) return;
      try {
        const db = getClientDb();
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { organizationId: orgId }, { merge: true });
        setActiveOrgId(orgId);
      } catch (err) {
        console.error('Error seleccionando organización:', err);
      }
    },
    [user]
  );

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        organizations,
        activeOrgId,
        loading,
        error,
        reload,
        updateOrganization,
        incrementPublicationUsed,
        createOrganization,
        selectOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = (): UseOrganizationReturn => {
  const context = useContext(OrganizationContext);
  if (!context) {
    return {
      organization: null,
      organizations: [],
      activeOrgId: null,
      loading: false,
      error: 'useOrganization debe utilizarse dentro de OrganizationProvider',
      reload: async () => {},
      updateOrganization: async () => {},
      incrementPublicationUsed: async () => {},
      createOrganization: async () => {},
      selectOrganization: async () => {},
    };
  }
  return context;
};
