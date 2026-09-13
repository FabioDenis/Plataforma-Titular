import crypto from 'crypto';
import { getAdminDb } from '../../firebase-admin';
import { requireServerEnv } from '../../config/env';
import { requireMetaConfig } from './config';
import { parseMetaGraphError, MetaServiceError } from './errors';

export interface StoredMetaTokens {
  userAccessToken?: string;
  userTokenExpiresAt?: string;
  facebookPageId?: string;
  facebookPageName?: string;
  facebookPageAccessToken?: string;
  instagramBusinessId?: string;
  instagramUsername?: string;
  updatedAt: string;
}

function getDerivedKey(): Buffer {
  const encryptionSecret = requireServerEnv(
    'META_TOKEN_ENCRYPTION_KEY',
    'Required to encrypt and decrypt Meta tokens on the server.'
  );
  return crypto.createHash('sha256').update(encryptionSecret).digest();
}

/**
 * Encrypts a sensitive token before saving in database
 */
export function encryptToken(token: string): string {
  if (!token) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getDerivedKey(), iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a stored token
 */
export function decryptToken(encryptedString: string): string {
  if (!encryptedString) return '';
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedString.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) {
      // If legacy unencrypted or different format, return as is
      return encryptedString;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getDerivedKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt token:', err);
    return '';
  }
}

/**
 * Saves organization Meta tokens in a server-protected Firestore collection
 * (organizations/{orgId}/privateMetaTokens/meta)
 */
export async function saveOrganizationMetaTokens(
  orgId: string,
  tokens: {
    userAccessToken?: string;
    userTokenExpiresAt?: string;
    facebookPageId?: string;
    facebookPageName?: string;
    facebookPageAccessToken?: string;
    instagramBusinessId?: string;
    instagramUsername?: string;
  }
): Promise<void> {
  const db = getAdminDb();
  const tokenDocRef = db.doc(`organizations/${orgId}/privateMetaTokens/meta`);

  const payload: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (tokens.userAccessToken) {
    payload.userAccessToken = encryptToken(tokens.userAccessToken);
  }
  if (tokens.userTokenExpiresAt) {
    payload.userTokenExpiresAt = tokens.userTokenExpiresAt;
  }
  if (tokens.facebookPageId) {
    payload.facebookPageId = tokens.facebookPageId;
  }
  if (tokens.facebookPageName) {
    payload.facebookPageName = tokens.facebookPageName;
  }
  if (tokens.facebookPageAccessToken) {
    payload.facebookPageAccessToken = encryptToken(tokens.facebookPageAccessToken);
  }
  if (tokens.instagramBusinessId) {
    payload.instagramBusinessId = tokens.instagramBusinessId;
  }
  if (tokens.instagramUsername) {
    payload.instagramUsername = tokens.instagramUsername;
  }

  await tokenDocRef.set(payload, { merge: true });
}

/**
 * Retrieves decrypted organization tokens for server-side API calls
 */
export async function getOrganizationMetaTokens(orgId: string): Promise<StoredMetaTokens | null> {
  try {
    const db = getAdminDb();
    const tokenDocRef = db.doc(`organizations/${orgId}/privateMetaTokens/meta`);
    const snap = await tokenDocRef.get();

    if (!snap.exists) {
      return null;
    }

    const data = snap.data() || {};
    return {
      userAccessToken: data.userAccessToken ? decryptToken(data.userAccessToken) : undefined,
      userTokenExpiresAt: data.userTokenExpiresAt,
      facebookPageId: data.facebookPageId,
      facebookPageName: data.facebookPageName,
      facebookPageAccessToken: data.facebookPageAccessToken
        ? decryptToken(data.facebookPageAccessToken)
        : undefined,
      instagramBusinessId: data.instagramBusinessId,
      instagramUsername: data.instagramUsername,
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error(`Error loading tokens for organization ${orgId}:`, err);
    return null;
  }
}

/**
 * Deletes tokens upon user disconnection
 */
export async function deleteOrganizationMetaTokens(orgId: string): Promise<void> {
  const db = getAdminDb();
  const tokenDocRef = db.doc(`organizations/${orgId}/privateMetaTokens/meta`);
  await tokenDocRef.delete();
}

/**
 * Exchanges OAuth authorization code for a short-lived user access token
 */
export async function exchangeCodeForUserToken(code: string, redirectUri: string): Promise<{
  accessToken: string;
  expiresIn?: number;
}> {
  const config = requireMetaConfig();

  const tokenUrl = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', config.appId);
  tokenUrl.searchParams.set('client_secret', config.appSecret);
  tokenUrl.searchParams.set('redirect_uri', redirectUri);
  tokenUrl.searchParams.set('code', code);

  const res = await fetch(tokenUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw parseMetaGraphError(data, 'intercambio de código por token de usuario');
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Exchanges a short-lived user access token for a long-lived user token (valid for ~60 days)
 */
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresIn?: number;
}> {
  const config = requireMetaConfig();

  const exchangeUrl = new URL(`${config.graphBaseUrl}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', config.appId);
  exchangeUrl.searchParams.set('client_secret', config.appSecret);
  exchangeUrl.searchParams.set('fb_exchange_token', shortLivedToken);

  const res = await fetch(exchangeUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    // If long-lived exchange fails, short-lived token can still be used temporarily
    console.warn('Long lived token exchange failed, using short lived token:', data.error);
    return { accessToken: shortLivedToken };
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}
