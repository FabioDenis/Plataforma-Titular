import { getMetaConfig } from './config';
import { parseMetaGraphError } from './errors';

export interface PublishFacebookPageOptions {
  pageId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl?: string;
  scheduledPublishTime?: number; // Unix timestamp in seconds (between 10 mins and 75 days)
}

export interface PublishFacebookPageResult {
  success: boolean;
  postId: string;
  photoId?: string;
  permalinkUrl?: string;
  publishedAt: string;
}

/**
 * Publishes a post or photo to a Facebook Page using official Meta Graph API
 */
export async function publishToFacebookPage(
  options: PublishFacebookPageOptions
): Promise<PublishFacebookPageResult> {
  const { pageId, pageAccessToken, caption, imageUrl, scheduledPublishTime } = options;
  const config = getMetaConfig();

  if (!pageId || !pageAccessToken) {
    throw new Error('Faltan las credenciales o identificador de la Página de Facebook.');
  }

  // 1. If imageUrl is provided, use the /{page-id}/photos endpoint
  if (imageUrl) {
    const photosEndpoint = `${config.graphBaseUrl}/${pageId}/photos`;

    const formData = new URLSearchParams();
    formData.append('access_token', pageAccessToken);
    formData.append('caption', caption || '');
    formData.append('url', imageUrl);

    if (scheduledPublishTime) {
      formData.append('published', 'false');
      formData.append('scheduled_publish_time', String(scheduledPublishTime));
    } else {
      formData.append('published', 'true');
    }

    const res = await fetch(photosEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formData.toString(),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw parseMetaGraphError(data, 'publicación de foto en Página de Facebook');
    }

    const photoId = data.id;
    const postId = data.post_id || `${pageId}_${photoId}`;

    return {
      success: true,
      postId,
      photoId,
      permalinkUrl: `https://www.facebook.com/${postId}`,
      publishedAt: new Date().toISOString(),
    };
  }

  // 2. If no image, publish standard text/link feed post to /{page-id}/feed
  const feedEndpoint = `${config.graphBaseUrl}/${pageId}/feed`;
  const formData = new URLSearchParams();
  formData.append('access_token', pageAccessToken);
  formData.append('message', caption || '');

  if (scheduledPublishTime) {
    formData.append('published', 'false');
    formData.append('scheduled_publish_time', String(scheduledPublishTime));
  }

  const res = await fetch(feedEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formData.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw parseMetaGraphError(data, 'publicación en muro de Página de Facebook');
  }

  const postId = data.id;
  return {
    success: true,
    postId,
    permalinkUrl: `https://www.facebook.com/${postId}`,
    publishedAt: new Date().toISOString(),
  };
}
