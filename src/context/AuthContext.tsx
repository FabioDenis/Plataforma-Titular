import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { getClientAuth, getFirebaseApp } from '../lib/firebase';
import { bootstrapRegistration, BootstrapResponse } from '../lib/registration-bootstrap';

export interface BillingProfileState {
  uid: string;
  email: string;
  planId: string;
  isAdmin?: boolean;
  subscriptionStatus: 'trial' | 'pending' | 'authorized' | 'paused' | 'cancelled' | 'inactive';
  subscriptionId: string;
  monthlyCreditsRemaining: number;
  purchasedCreditsRemaining: number;
  creditsRemaining: number;
  totalCreditsUsed: number;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
  ledger?: Array<{
    id: string;
    type: 'trial_grant' | 'subscription_grant' | 'purchase' | 'consumption' | 'refund';
    amount: number;
    description: string;
    createdAt: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  billingProfile: BillingProfileState | null;
  organizationReady: boolean;
  bootstrapOrganization: BootstrapResponse['organization'] | null;
  isBillingOpen: boolean;
  isAuthModalOpen: boolean;
  setIsBillingOpen: (open: boolean) => void;
  setIsAuthModalOpen: (open: boolean) => void;
  refreshBillingProfile: () => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Whether the signed-in email address is verified (required to join a shared newsroom). */
  emailVerified: boolean;
  resendVerificationEmail: () => Promise<void>;
  /** Reloads the account after the user clicked the email link; joins any pending newsroom invite. */
  confirmEmailVerified: () => Promise<boolean>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [billingProfile, setBillingProfile] = useState<BillingProfileState | null>(null);
  const [organizationReady, setOrganizationReady] = useState(false);
  const [bootstrapOrganization, setBootstrapOrganization] = useState<BootstrapResponse['organization'] | null>(null);
  const [isBillingOpen, setIsBillingOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const registrationInProgressRef = useRef(false);
  const syncedUidRef = useRef<string | null>(null);
  const syncInFlightRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);
  const billingProfileRef = useRef<BillingProfileState | null>(null);
  billingProfileRef.current = billingProfile;
  const [emailVerified, setEmailVerified] = useState(false);

  // Idempotent server sync on every sign-in: repairs the account and joins pending newsroom invites.
  // Best effort: a failure here must never block signing in.
  // Marked as synced only after a successful response, so a transient failure is retried on the next call.
  const syncAccount = useCallback(async (account: User, forceRefresh = false, attempt = 0): Promise<void> => {
    if (!forceRefresh && syncedUidRef.current === account.uid) return;
    const inFlight = syncInFlightRef.current;
    if (!forceRefresh && inFlight?.uid === account.uid) return inFlight.promise;

    const promise = (async () => {
      try {
        const token = await account.getIdToken(forceRefresh);
        const res = await fetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          syncedUidRef.current = account.uid;
          return;
        }
        console.warn('Account sync returned status', res.status);
      } catch (err) {
        console.warn('Account sync failed:', err);
      } finally {
        if (syncInFlightRef.current?.promise === promise) syncInFlightRef.current = null;
      }
      // Bounded background retry (5s, then 10s) so a transient error does not strand a pending invite.
      if (attempt < 2) {
        setTimeout(() => {
          if (getClientAuth().currentUser?.uid === account.uid) void syncAccount(account, false, attempt + 1);
        }, 5000 * (attempt + 1));
      }
    })();
    syncInFlightRef.current = { uid: account.uid, promise };
    return promise;
  }, []);

  useEffect(() => {
    getFirebaseApp().catch((err) => console.error('Firebase init error:', err));
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const auth = getClientAuth();
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      return null;
    }
  }, []);

  const refreshBillingProfile = useCallback(async () => {
    const auth = getClientAuth();
    if (!auth.currentUser) {
      setBillingProfile(null);
      return;
    }
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/api/billing/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setBillingProfile(data);
      }
    } catch (err) {
      console.warn('Failed to fetch billing profile:', err);
    }
  }, []);

  useEffect(() => {
    const auth = getClientAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setEmailVerified(Boolean(currentUser?.emailVerified));
      if (currentUser) {
        if (registrationInProgressRef.current) return;
        await syncAccount(currentUser);
        setOrganizationReady(true);
        setBootstrapOrganization(null);
        await refreshBillingProfile();
      } else {
        syncedUidRef.current = null;
        setBillingProfile(null);
        setOrganizationReady(false);
        setBootstrapOrganization(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [refreshBillingProfile, syncAccount]);

  const registerWithEmail = async (email: string, pass: string) => {
    const auth = getClientAuth();
    let userCredential;

    registrationInProgressRef.current = true;
    setLoading(true);
    setOrganizationReady(false);
    setBootstrapOrganization(null);

    try {
      userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    } catch (authErr: any) {
      registrationInProgressRef.current = false;
      setLoading(false);
      console.error('Error en Firebase Auth durante el registro:', authErr);
      throw authErr;
    }

    try {
      const result = await bootstrapRegistration(userCredential.user);
      syncedUidRef.current = userCredential.user.uid;
      registrationInProgressRef.current = false;
      sendEmailVerification(userCredential.user).catch((err) =>
        console.warn('Could not send the verification email:', err)
      );
      setUser(userCredential.user);
      setBootstrapOrganization(result.organization);
      setOrganizationReady(true);
      await refreshBillingProfile();
      setLoading(false);
    } catch (bootstrapError) {
      registrationInProgressRef.current = false;
      setUser(null);
      setBillingProfile(null);
      setOrganizationReady(false);
      setLoading(false);
      throw bootstrapError;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    const auth = getClientAuth();
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    await syncAccount(userCredential.user);
    setUser(userCredential.user);
    setEmailVerified(userCredential.user.emailVerified);
    setBootstrapOrganization(null);
    setOrganizationReady(true);
    await refreshBillingProfile();
  };

  const resendVerificationEmail = async () => {
    const current = getClientAuth().currentUser;
    if (!current) return;
    await sendEmailVerification(current);
  };

  const confirmEmailVerified = async () => {
    const current = getClientAuth().currentUser;
    if (!current) return false;
    await current.reload();
    setEmailVerified(current.emailVerified);
    if (current.emailVerified) {
      // A fresh token carries email_verified=true, which the server requires to accept invites.
      await syncAccount(current, true);
    }
    return current.emailVerified;
  };

  const logout = async () => {
    const auth = getClientAuth();
    await firebaseSignOut(auth);
    setUser(null);
    setBillingProfile(null);
    setOrganizationReady(false);
    setBootstrapOrganization(null);
  };

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const auth = getClientAuth();
      if (!auth.currentUser) {
        setIsAuthModalOpen(true);
        throw new Error('Debe iniciar sesión para utilizar las funciones de IA.');
      }

      const token = await auth.currentUser.getIdToken();
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(url, { ...options, headers });

      // Clients pay a flat fee: only platform admins are sent to billing when a balance runs out.
      if (res.status === 402 && billingProfileRef.current?.isAdmin) {
        await refreshBillingProfile();
        setIsBillingOpen(true);
      }

      return res;
    },
    [refreshBillingProfile]
  );

  const isAdmin = Boolean(billingProfile?.isAdmin);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        billingProfile,
        organizationReady,
        bootstrapOrganization,
        isBillingOpen,
        isAuthModalOpen,
        setIsBillingOpen,
        setIsAuthModalOpen,
        refreshBillingProfile,
        registerWithEmail,
        loginWithEmail,
        logout,
        emailVerified,
        resendVerificationEmail,
        confirmEmailVerified,
        authFetch,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
