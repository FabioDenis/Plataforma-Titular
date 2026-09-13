import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { getOptionalServerEnv } from './config/env';

const projectId =
  getOptionalServerEnv('FIREBASE_PROJECT_ID') ||
  getOptionalServerEnv('VITE_FIREBASE_PROJECT_ID') ||
  getOptionalServerEnv('GCLOUD_PROJECT');

function initializeAdminApp() {
  if (getApps().length) {
    return getApp();
  }

  const serviceAccountJson = getOptionalServerEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    } catch {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON; falling back to application default credentials.');
    }
  }

  return initializeApp({ projectId: projectId || undefined });
}

export const adminApp = initializeAdminApp();

let adminDb: Firestore | undefined;

export function getAdminDb(): Firestore {
  if (!adminDb) {
    const databaseId =
      getOptionalServerEnv('VITE_FIRESTORE_DATABASE_ID') || getOptionalServerEnv('FIRESTORE_DATABASE_ID');
    adminDb = databaseId && databaseId !== '(default)' ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
  }
  return adminDb;
}

export function getAdminAuth() {
  return getAuth(adminApp);
}
