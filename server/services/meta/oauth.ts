import crypto from 'crypto';
import { getAdminDb } from '../../firebase-admin';
import { requireServerEnv } from '../../config/env';
import { getMetaConfig, requireMetaConfig, REQUIRED_META_SCOPES, isMetaConfigured } from './config';
import { parseMetaGraphError, MetaServiceError } from './errors';
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  saveOrganizationMetaTokens,
  deleteOrganizationMetaTokens,
  getOrganizationMetaTokens,
  encryptToken,
  decryptToken,
} from './tokens';

export interface AdministeredPageItem {
  id: string;
  name: string;
  category?: string;
  tasks?: string[];
  instagramAccount?: {
    id: string;
    username: string;
    name?: string;
    profilePictureUrl?: string;
  };
}

export interface PublicConnectionStatus {
  isConfiguredOnServer: boolean;
  facebook: {
    connected: boolean;
    pageId?: string;
    pageName?: string;
    category?: string;
    connectedAt?: string;
    connectedBy?: string;
  };
  instagram: {
    connected: boolean;
    igUserId?: string;
    username?: string;
    name?: string;
    profilePictureUrl?: string;
    connectedAt?: string;
    connectedBy?: string;
    reason?: string;
  };
}

/**
 * Creates a signed state string to protect against CSRF and identify the organization
 */
export function createOAuthState(orgId: string, userId: string): string {
  const secret = requireServerEnv('META_APP_SECRET', 'Required to sign Meta OAuth state.');
  const timestamp = Date.now();
  const data = `${orgId}:${userId}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(JSON.stringify({ orgId, userId, timestamp, hmac })).toString('base64url');
}

/**
 * Validates the state parameter returned by Meta
 */
export function verifyOAuthState(stateString: string): { orgId: string; userId: string } {
  try {
    const raw = Buffer.from(stateString, 'base64url').toString('utf8');
    const { orgId, userId, timestamp, hmac } = JSON.parse(raw);

    // State validity window: 20 minutes
    if (Date.now() - timestamp > 20 * 60 * 1000) {
      throw new Error('El enlace de autorización ha expirado. Por favor intenta de nuevo.');
    }

    const secret = requireServerEnv('META_APP_SECRET', 'Required to verify Meta OAuth state.');
    const data = `${orgId}:${userId}:${timestamp}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(data).digest('hex');

    // Timing-safe comparison; the type/length check satisfies timingSafeEqual's equal-length
    // requirement and keeps behavior identical for valid and invalid signatures.
    if (
      typeof hmac !== 'string' ||
      hmac.length !== expectedHmac.length ||
      !crypto.timingSafeEqual(Buffer.from(hmac, 'utf8'), Buffer.from(expectedHmac, 'utf8'))
    ) {
      throw new Error('Firma de seguridad inválida en la respuesta de autorización de Meta.');
    }

    return { orgId, userId };
  } catch (err: any) {
    throw new MetaServiceError(
      'Estado de seguridad inválido en la autorización de Meta. Por favor intenta conectar nuevamente.',
      'PERMISSION_DENIED',
      err
    );
  }
}

/**
 * Builds the official Meta OAuth Authorization URL
 */
export function generateMetaAuthUrl(orgId: string, userId: string, customRedirectUri?: string): string {
  const config = requireMetaConfig();

  const state = createOAuthState(orgId, userId);
  const redirectUri = customRedirectUri || config.redirectUri;

  const url = new URL(config.oauthDialogUrl);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', REQUIRED_META_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('auth_type', 'rerequest');

  return url.toString();
}

/**
 * Handles the OAuth callback from Meta, exchanges tokens, retrieves Pages and Instagram accounts,
 * stores a temporary authorization session, and returns the list of pages to let the user select.
 */
export async function handleMetaCallback(
  code: string,
  state: string,
  customRedirectUri?: string
): Promise<{
  orgId: string;
  userId: string;
  sessionKey: string;
  pages: AdministeredPageItem[];
}> {
  const { orgId, userId } = verifyOAuthState(state);
  const config = requireMetaConfig();
  const redirectUri = customRedirectUri || config.redirectUri;

  // 1. Exchange authorization code for short-lived user token
  const { accessToken: shortLivedUserToken, expiresIn } = await exchangeCodeForUserToken(code, redirectUri);

  // 2. Exchange for long-lived user token (~60 days)
  const { accessToken: longLivedUserToken } = await exchangeForLongLivedUserToken(shortLivedUserToken);

  // 3. Query user's Facebook Pages and linked Instagram accounts via official Graph API
  const accountsUrl = new URL(`${config.graphBaseUrl}/me/accounts`);
  accountsUrl.searchParams.set(
    'fields',
    'id,name,access_token,category,tasks,instagram_business_account{id,username,name,profile_picture_url}'
  );
  accountsUrl.searchParams.set('access_token', longLivedUserToken);

  const pagesRes = await fetch(accountsUrl.toString());
  const pagesData = await pagesRes.json();

  if (!pagesRes.ok || pagesData.error) {
    throw parseMetaGraphError(pagesData, 'consulta de páginas de Facebook vinculadas');
  }

  const rawPages: any[] = pagesData.data || [];
  if (rawPages.length === 0) {
    throw new MetaServiceError(
      'No se encontró ninguna Página de Facebook administrada por esta cuenta de Meta. Para vincular Hermes debes ser administrador de al menos una Página de Facebook.',
      'NO_PAGES_FOUND'
    );
  }

  // Format clean list of pages for user display
  const cleanPages: AdministeredPageItem[] = rawPages.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    tasks: p.tasks,
    instagramAccount: p.instagram_business_account
      ? {
          id: p.instagram_business_account.id,
          username: p.instagram_business_account.username || '',
          name: p.instagram_business_account.name || '',
          profilePictureUrl: p.instagram_business_account.profile_picture_url || '',
        }
      : undefined,
  }));

  // Create temporary OAuth session stored securely server-side for 15 minutes
  const sessionKey = crypto.randomBytes(24).toString('hex');
  const db = getAdminDb();
  const tempSessionRef = db.doc(`organizations/${orgId}/privateMetaTokens/temp_oauth_session`);

  // Encrypt page tokens in temp storage
  const encryptedPagesMap: Record<string, any> = {};
  for (const p of rawPages) {
    encryptedPagesMap[p.id] = {
      id: p.id,
      name: p.name,
      category: p.category || '',
      token: encryptToken(p.access_token),
      instagramAccount: p.instagram_business_account || null,
    };
  }

  await tempSessionRef.set({
    sessionKey,
    userId,
    userAccessToken: encryptToken(longLivedUserToken),
    userTokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    pages: encryptedPagesMap,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });

  return {
    orgId,
    userId,
    sessionKey,
    pages: cleanPages,
  };
}

/**
 * Confirms user's selection of a specific Facebook Page and linked Instagram account.
 * Persists the encrypted tokens and updates public organization social connection status.
 */
export async function confirmPageSelection(
  orgId: string,
  userId: string,
  sessionKey: string,
  selectedPageId: string
): Promise<PublicConnectionStatus> {
  const db = getAdminDb();
  const tempSessionRef = db.doc(`organizations/${orgId}/privateMetaTokens/temp_oauth_session`);
  const sessionSnap = await tempSessionRef.get();

  if (!sessionSnap.exists) {
    throw new MetaServiceError(
      'La sesión de autorización expiró. Por favor, inicia nuevamente la conexión con Facebook.',
      'EXPIRED_SESSION'
    );
  }

  const sessionData = sessionSnap.data() || {};
  if (sessionData.sessionKey !== sessionKey) {
    throw new MetaServiceError('Clave de sesión inválida.', 'INVALID_SESSION');
  }

  if (sessionData.expiresAt && new Date(sessionData.expiresAt).getTime() < Date.now()) {
    await tempSessionRef.delete().catch(() => {});
    throw new MetaServiceError('La sesión de selección ha expirado.', 'EXPIRED_SESSION');
  }

  const targetPage = sessionData.pages?.[selectedPageId];
  if (!targetPage) {
    throw new MetaServiceError('La página de Facebook seleccionada no es válida.', 'INVALID_PAGE');
  }

  const pageAccessToken = decryptToken(targetPage.token);
  const userAccessToken = decryptToken(sessionData.userAccessToken);

  const instagramAccount = targetPage.instagramAccount;
  const instagramBusinessId = instagramAccount?.id;
  const instagramUsername = instagramAccount?.username;
  const instagramName = instagramAccount?.name;
  const instagramProfilePic = instagramAccount?.profile_picture_url;

  // 1. Save permanent private tokens in Firestore
  await saveOrganizationMetaTokens(orgId, {
    userAccessToken,
    userTokenExpiresAt: sessionData.userTokenExpiresAt || undefined,
    facebookPageId: targetPage.id,
    facebookPageName: targetPage.name,
    facebookPageAccessToken: pageAccessToken,
    instagramBusinessId,
    instagramUsername,
  });

  // 2. Save public connection metadata
  const publicMetaRef = db.doc(`organizations/${orgId}/socialConnections/meta`);
  const now = new Date().toISOString();

  await publicMetaRef.set(
    {
      facebook: {
        connected: true,
        pageId: targetPage.id,
        pageName: targetPage.name,
        category: targetPage.category || '',
        connectedAt: now,
        connectedBy: userId,
      },
      instagram: instagramBusinessId
        ? {
            connected: true,
            igUserId: instagramBusinessId,
            username: instagramUsername || '',
            name: instagramName || '',
            profilePictureUrl: instagramProfilePic || '',
            connectedAt: now,
            connectedBy: userId,
          }
        : {
            connected: false,
            reason:
              'No se detectó una cuenta de Instagram Profesional (Business/Creator) vinculada a esta Página de Facebook.',
          },
      updatedAt: now,
    },
    { merge: true }
  );

  // 3. Delete temporary session
  await tempSessionRef.delete().catch(() => {});

  return getOrganizationSocialStatus(orgId);
}

/**
 * Returns public connection status for the organization
 */
export async function getOrganizationSocialStatus(orgId: string): Promise<PublicConnectionStatus> {
  const isConfigured = isMetaConfigured();
  const defaultStatus: PublicConnectionStatus = {
    isConfiguredOnServer: isConfigured,
    facebook: { connected: false },
    instagram: { connected: false },
  };

  if (!orgId) return defaultStatus;

  try {
    const db = getAdminDb();
    const publicMetaRef = db.doc(`organizations/${orgId}/socialConnections/meta`);
    const snap = await publicMetaRef.get();

    if (!snap.exists) {
      return defaultStatus;
    }

    const data = snap.data() || {};
    return {
      isConfiguredOnServer: isConfigured,
      facebook: {
        connected: Boolean(data.facebook?.connected && data.facebook?.pageId),
        pageId: data.facebook?.pageId,
        pageName: data.facebook?.pageName,
        category: data.facebook?.category,
        connectedAt: data.facebook?.connectedAt,
        connectedBy: data.facebook?.connectedBy,
      },
      instagram: {
        connected: Boolean(data.instagram?.connected && data.instagram?.igUserId),
        igUserId: data.instagram?.igUserId,
        username: data.instagram?.username,
        name: data.instagram?.name,
        profilePictureUrl: data.instagram?.profilePictureUrl,
        connectedAt: data.instagram?.connectedAt,
        connectedBy: data.instagram?.connectedBy,
        reason: data.instagram?.reason,
      },
    };
  } catch (err) {
    console.error(`Error fetching social status for ${orgId}:`, err);
    return defaultStatus;
  }
}

/**
 * Disconnects social accounts for the organization
 */
export async function disconnectSocialAccounts(
  orgId: string,
  platform: 'all' | 'facebook' | 'instagram' = 'all'
): Promise<void> {
  const db = getAdminDb();
  const publicMetaRef = db.doc(`organizations/${orgId}/socialConnections/meta`);

  if (platform === 'all') {
    await deleteOrganizationMetaTokens(orgId);
    await publicMetaRef.set(
      {
        facebook: { connected: false },
        instagram: { connected: false },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } else if (platform === 'facebook') {
    await publicMetaRef.set(
      {
        facebook: { connected: false },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } else if (platform === 'instagram') {
    await publicMetaRef.set(
      {
        instagram: { connected: false },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}
