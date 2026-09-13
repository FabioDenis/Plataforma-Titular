/// <reference types="vite/client" />
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let isInitialized = false;

function getRequiredPublicEnv(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }

  throw new Error(`Missing required public Firebase env: ${name}`);
}

function getEnvConfig(): FirebaseConfig {
  const projectId = getRequiredPublicEnv('VITE_FIREBASE_PROJECT_ID');
  const apiKey = getRequiredPublicEnv('VITE_FIREBASE_API_KEY');
  const authDomain = getRequiredPublicEnv('VITE_FIREBASE_AUTH_DOMAIN');
  const storageBucket = getRequiredPublicEnv('VITE_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = getRequiredPublicEnv('VITE_FIREBASE_MESSAGING_SENDER_ID');
  const appId = getRequiredPublicEnv('VITE_FIREBASE_APP_ID');
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || '';
  const firestoreDatabaseId = import.meta.env.VITE_FIRESTORE_DATABASE_ID?.trim() || '(default)';

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
    firestoreDatabaseId,
  };
}

/**
 * Initializes and verifies Firebase App, Authentication, and Firestore instances.
 */
function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (app && authInstance && dbInstance) {
    return { app, auth: authInstance, db: dbInstance };
  }

  try {
    const config = getEnvConfig();

    if (!getApps().length) {
      app = initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId || undefined,
        appId: config.appId || undefined,
        measurementId: config.measurementId || undefined,
      });
    } else {
      app = getApp();
    }

    try {
      authInstance = getAuth(app);
    } catch (authErr) {
      console.warn('⚠️ Firebase Auth warning:', authErr);
    }

    try {
      const dbId = config.firestoreDatabaseId;
      dbInstance =
        dbId && dbId !== '(default)' && dbId !== ''
          ? getFirestore(app, dbId)
          : getFirestore(app);
    } catch (dbErr) {
      console.warn('⚠️ Firebase Firestore warning:', dbErr);
      dbInstance = getFirestore(app);
    }

    if (!isInitialized) {
      console.log('✅ Firebase inicializado correctamente.');
      console.log(`Proyecto: ${config.projectId}`);
      isInitialized = true;
    }

    return { app, auth: authInstance!, db: dbInstance! };
  } catch (error: any) {
    console.warn('⚠️ Warning initializing Firebase:', error?.message || error);
    if (!app) {
      app = getApps().length ? getApp() : initializeApp(getEnvConfig());
    }
    if (!authInstance) {
      try {
        authInstance = getAuth(app);
      } catch {
        // Safe fallback
      }
    }
    if (!dbInstance) {
      try {
        dbInstance = getFirestore(app);
      } catch {
        // Safe fallback
      }
    }
    return { app, auth: authInstance!, db: dbInstance! };
  }
}

// Verification upon module initialization
try {
  initFirebase();
} catch (e) {
  console.warn('Firebase silent init caught:', e);
}

/**
 * Asynchronously gets initialized Firebase App, Auth, and Firestore instances.
 */
export async function getFirebaseApp(): Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> {
  return initFirebase();
}

/**
 * Gets client Auth instance.
 */
export function getClientAuth(): Auth {
  const { auth } = initFirebase();
  return auth;
}

/**
 * Gets client Firestore instance.
 */
export function getClientDb(): Firestore {
  const { db } = initFirebase();
  return db;
}

/**
 * Structured Firestore error handler per security guidelines.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const auth = getClientAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
