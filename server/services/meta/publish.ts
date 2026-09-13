import { getAdminDb } from '../../firebase-admin';
import { getOrganizationMetaTokens } from './tokens';
import { publishToFacebookPage } from './facebook';
import { publishToInstagram } from './instagram';
import { storeMediaForMeta } from './mediaServer';
import { MetaServiceError } from './errors';

export interface PublishRequestPayload {
  orgId: string;
  orgName?: string;
  userId: string;
  userEmail: string;
  approvedBy?: string;
  approvedAt?: string;
  articleTitle: string;
  category: string;
  headline: string;
  subtitle: string;
  facebookCaption: string;
  instagramCaption: string;
  imageUrl: string;
  format: 'feed' | 'story';
  targets: {
    facebook: boolean;
    instagram: boolean;
  };
  scheduledPublishTime?: number; // Unix seconds
}

export interface PlatformPublishResult {
  status: 'published' | 'error' | 'skipped';
  postId?: string;
  mediaId?: string;
  permalinkUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  publishedAt?: string;
}

export interface UnifiedPublishResponse {
  success: boolean;
  publicationId: string;
  overallStatus: 'PUBLICADO' | 'ERROR' | 'PUBLICANDO';
  results: {
    facebook?: PlatformPublishResult;
    instagram?: PlatformPublishResult;
  };
}

/**
 * Executes multi-platform publication to Facebook & Instagram
 */
export async function executeMultiPlatformPublish(
  payload: PublishRequestPayload
): Promise<UnifiedPublishResponse> {
  const {
    orgId,
    orgName = 'Institución',
    userId,
    userEmail,
    approvedBy,
    approvedAt,
    articleTitle,
    category,
    headline,
    subtitle,
    facebookCaption,
    instagramCaption,
    imageUrl,
    format = 'feed',
    targets,
    scheduledPublishTime,
  } = payload;

  if (!targets.facebook && !targets.instagram) {
    throw new Error('Debes seleccionar al menos una red social (Facebook o Instagram).');
  }

  // 1. Retrieve stored tokens for this organization
  const tokens = await getOrganizationMetaTokens(orgId);
  if (!tokens) {
    throw new Error(
      'La institución no tiene cuentas de redes sociales conectadas. Por favor conecta Facebook o Instagram primero.'
    );
  }

  // 2. Prepare public media URL if image is provided
  let publicMediaUrl = imageUrl;
  if (imageUrl) {
    try {
      const stored = await storeMediaForMeta(imageUrl);
      publicMediaUrl = stored.publicUrl;
    } catch (e) {
      console.warn('Failed to store media on local server, using original image URL:', e);
    }
  }

  const results: {
    facebook?: PlatformPublishResult;
    instagram?: PlatformPublishResult;
  } = {};

  let atLeastOneSuccess = false;
  let hasErrors = false;

  // 3. Publish to Facebook Page if requested
  if (targets.facebook) {
    if (!tokens.facebookPageId || !tokens.facebookPageAccessToken) {
      results.facebook = {
        status: 'error',
        errorMessage: 'La institución no tiene una Página de Facebook conectada o el token es inválido.',
        errorCode: 'NOT_CONNECTED',
      };
      hasErrors = true;
    } else {
      try {
        const fbRes = await publishToFacebookPage({
          pageId: tokens.facebookPageId,
          pageAccessToken: tokens.facebookPageAccessToken,
          caption: facebookCaption || `${headline}\n\n${subtitle}`,
          imageUrl: publicMediaUrl,
          scheduledPublishTime,
        });

        results.facebook = {
          status: 'published',
          postId: fbRes.postId,
          permalinkUrl: fbRes.permalinkUrl,
          publishedAt: fbRes.publishedAt,
        };
        atLeastOneSuccess = true;
      } catch (err: any) {
        console.error('Error publicando en Facebook:', err);
        hasErrors = true;
        results.facebook = {
          status: 'error',
          errorMessage: err.userMessage || err.message || 'Error desconocido al publicar en Facebook',
          errorCode: err.category || 'FACEBOOK_ERROR',
        };
      }
    }
  }

  // 4. Publish to Instagram if requested
  if (targets.instagram) {
    if (!tokens.instagramBusinessId) {
      results.instagram = {
        status: 'error',
        errorMessage: 'No hay una cuenta de Instagram Profesional (Business/Creator) vinculada a esta institución.',
        errorCode: 'NOT_CONNECTED',
      };
      hasErrors = true;
    } else if (!publicMediaUrl) {
      results.instagram = {
        status: 'error',
        errorMessage: 'Instagram requiere obligatoriamente una imagen para publicar.',
        errorCode: 'MISSING_IMAGE',
      };
      hasErrors = true;
    } else {
      try {
        const pageToken = tokens.facebookPageAccessToken || tokens.userAccessToken;
        if (!pageToken) {
          throw new Error('Falta el token de acceso para publicar en Instagram.');
        }

        const igRes = await publishToInstagram({
          igUserId: tokens.instagramBusinessId,
          accessToken: pageToken,
          imageUrl: publicMediaUrl,
          caption: format === 'story' ? undefined : instagramCaption || `${headline}\n\n${subtitle}`,
          mediaType: format === 'story' ? 'STORIES' : 'FEED',
        });

        results.instagram = {
          status: 'published',
          mediaId: igRes.mediaId,
          publishedAt: igRes.publishedAt,
        };
        atLeastOneSuccess = true;
      } catch (err: any) {
        console.error('Error publicando en Instagram:', err);
        hasErrors = true;
        results.instagram = {
          status: 'error',
          errorMessage: err.userMessage || err.message || 'Error desconocido al publicar en Instagram',
          errorCode: err.category || 'INSTAGRAM_ERROR',
        };
      }
    }
  }

  // Determine overall status
  const overallStatus: 'PUBLICADO' | 'ERROR' = atLeastOneSuccess && !hasErrors ? 'PUBLICADO' : hasErrors && !atLeastOneSuccess ? 'ERROR' : 'PUBLICADO';

  // 5. Save persistent record in Firestore under organizations/{orgId}/publications/{pubId}
  const db = getAdminDb();
  const pubRef = db.collection(`organizations/${orgId}/publications`).doc();
  const now = new Date().toISOString();

  const record = {
    id: pubRef.id,
    organizationId: orgId,
    organizationName: orgName,
    status: overallStatus,
    approvedBy: approvedBy || userEmail,
    approvedAt: approvedAt || now,
    publishedBy: userEmail,
    publishedAt: now,
    createdAt: now,
    articleTitle,
    category,
    content: {
      headline,
      subtitle,
      facebookCaption,
      instagramCaption,
      imageUrl: publicMediaUrl,
      format,
    },
    targets,
    results,
    scheduledPublishTime: scheduledPublishTime || null,
  };

  await pubRef.set(record);

  return {
    success: atLeastOneSuccess,
    publicationId: pubRef.id,
    overallStatus,
    results,
  };
}

/**
 * Retries publication on a specific failed platform without duplicating successful ones
 */
export async function retryPlatformPublish(
  orgId: string,
  publicationId: string,
  platform: 'facebook' | 'instagram',
  userEmail: string
): Promise<PlatformPublishResult> {
  const db = getAdminDb();
  const pubRef = db.doc(`organizations/${orgId}/publications/${publicationId}`);
  const snap = await pubRef.get();

  if (!snap.exists) {
    throw new Error('No se encontró la publicación a reintentar.');
  }

  const data = snap.data() || {};
  const tokens = await getOrganizationMetaTokens(orgId);
  if (!tokens) {
    throw new Error('La institución no tiene cuentas de redes sociales conectadas.');
  }

  let result: PlatformPublishResult;

  if (platform === 'facebook') {
    if (!tokens.facebookPageId || !tokens.facebookPageAccessToken) {
      throw new Error('No hay una Página de Facebook conectada.');
    }
    try {
      const fbRes = await publishToFacebookPage({
        pageId: tokens.facebookPageId,
        pageAccessToken: tokens.facebookPageAccessToken,
        caption: data.content?.facebookCaption || data.content?.headline || '',
        imageUrl: data.content?.imageUrl,
      });
      result = {
        status: 'published',
        postId: fbRes.postId,
        permalinkUrl: fbRes.permalinkUrl,
        publishedAt: fbRes.publishedAt,
      };
    } catch (err: any) {
      result = {
        status: 'error',
        errorMessage: err.userMessage || err.message,
        errorCode: err.category,
      };
    }
  } else {
    if (!tokens.instagramBusinessId) {
      throw new Error('No hay una cuenta de Instagram Profesional conectada.');
    }
    try {
      const token = tokens.facebookPageAccessToken || tokens.userAccessToken;
      if (!token) throw new Error('Token de acceso faltante para Instagram.');

      const igRes = await publishToInstagram({
        igUserId: tokens.instagramBusinessId,
        accessToken: token,
        imageUrl: data.content?.imageUrl,
        caption: data.content?.format === 'story' ? undefined : data.content?.instagramCaption,
        mediaType: data.content?.format === 'story' ? 'STORIES' : 'FEED',
      });
      result = {
        status: 'published',
        mediaId: igRes.mediaId,
        publishedAt: igRes.publishedAt,
      };
    } catch (err: any) {
      result = {
        status: 'error',
        errorMessage: err.userMessage || err.message,
        errorCode: err.category,
      };
    }
  }

  // Update record in Firestore
  const updatePayload: Record<string, any> = {
    [`results.${platform}`]: result,
    updatedAt: new Date().toISOString(),
  };

  if (result.status === 'published') {
    updatePayload.status = 'PUBLICADO';
  }

  await pubRef.update(updatePayload);
  return result;
}
