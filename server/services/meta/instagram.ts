import { getMetaConfig } from './config';
import { parseMetaGraphError, MetaServiceError } from './errors';

export interface PublishInstagramOptions {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  mediaType?: 'FEED' | 'STORIES';
}

export interface PublishInstagramResult {
  success: boolean;
  mediaId: string;
  permalink?: string;
  publishedAt: string;
}

/**
 * Checks container status for Instagram Content Publishing
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  maxWaitSeconds = 45
): Promise<void> {
  const config = getMetaConfig();
  const statusUrl = new URL(`${config.graphBaseUrl}/${containerId}`);
  statusUrl.searchParams.set('fields', 'status_code,status');
  statusUrl.searchParams.set('access_token', accessToken);

  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const res = await fetch(statusUrl.toString());
    const data = await res.json();

    if (!res.ok || data.error) {
      throw parseMetaGraphError(data, 'verificación de estado de contenedor Instagram');
    }

    const statusCode = data.status_code;
    if (statusCode === 'FINISHED') {
      return; // Ready to publish
    }

    if (statusCode === 'ERROR') {
      throw new MetaServiceError(
        'Meta reportó un error al procesar el contenedor multimedia de Instagram.',
        'MEDIA_ERROR',
        data
      );
    }

    if (statusCode === 'EXPIRED') {
      throw new MetaServiceError(
        'El contenedor multimedia de Instagram ha expirado antes de ser publicado.',
        'MEDIA_ERROR',
        data
      );
    }

    // Wait 2 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new MetaServiceError(
    'Tiempo de espera agotado mientras Instagram procesaba la imagen. Por favor reintenta.',
    'NETWORK'
  );
}

/**
 * Publishes an image to Instagram Business/Creator account (Feed or Stories) using official Meta Graph API
 */
export async function publishToInstagram(
  options: PublishInstagramOptions
): Promise<PublishInstagramResult> {
  const { igUserId, accessToken, imageUrl, caption, mediaType = 'FEED' } = options;
  const config = getMetaConfig();

  if (!igUserId || !accessToken) {
    throw new Error('Faltan las credenciales o identificador de cuenta de Instagram.');
  }
  if (!imageUrl) {
    throw new Error('Instagram requiere obligatoriamente una imagen accesible mediante URL HTTPS.');
  }

  // 1. Step 1: Create Media Container
  const containerEndpoint = `${config.graphBaseUrl}/${igUserId}/media`;
  const containerParams = new URLSearchParams();
  containerParams.append('access_token', accessToken);
  containerParams.append('image_url', imageUrl);

  if (mediaType === 'STORIES') {
    containerParams.append('media_type', 'STORIES');
    // Note: Official Instagram Graph API does not support caption text on Stories
  } else {
    // Feed post
    if (caption) {
      containerParams.append('caption', caption);
    }
  }

  const containerRes = await fetch(containerEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: containerParams.toString(),
  });

  const containerData = await containerRes.json();
  if (!containerRes.ok || containerData.error) {
    throw parseMetaGraphError(
      containerData,
      mediaType === 'STORIES' ? 'creación de Historia de Instagram' : 'creación de post en Feed de Instagram'
    );
  }

  const containerId = containerData.id;
  if (!containerId) {
    throw new MetaServiceError(
      'Meta no devolvió un identificador de contenedor válido para Instagram.',
      'MEDIA_ERROR',
      containerData
    );
  }

  // 2. Step 2: Verify container is finished processing
  await waitForContainerReady(containerId, accessToken);

  // 3. Step 3: Publish Media Container
  const publishEndpoint = `${config.graphBaseUrl}/${igUserId}/media_publish`;
  const publishParams = new URLSearchParams();
  publishParams.append('access_token', accessToken);
  publishParams.append('creation_id', containerId);

  const publishRes = await fetch(publishEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: publishParams.toString(),
  });

  const publishData = await publishRes.json();
  if (!publishRes.ok || publishData.error) {
    throw parseMetaGraphError(publishData, 'publicación definitiva en Instagram');
  }

  const mediaId = publishData.id;

  return {
    success: true,
    mediaId,
    publishedAt: new Date().toISOString(),
  };
}
