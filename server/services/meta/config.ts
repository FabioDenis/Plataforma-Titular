import { getOptionalServerEnv, requireServerEnv } from '../../config/env';

export interface MetaAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion: string;
  graphBaseUrl: string;
  oauthDialogUrl: string;
}

export function getMetaConfig(): MetaAppConfig {
  const appId = getOptionalServerEnv('META_APP_ID') || getOptionalServerEnv('FACEBOOK_APP_ID');
  const appSecret = getOptionalServerEnv('META_APP_SECRET') || getOptionalServerEnv('FACEBOOK_APP_SECRET');
  const graphVersion = getOptionalServerEnv('META_GRAPH_VERSION', 'v22.0');
  const appUrl = getOptionalServerEnv('APP_URL').replace(/\/$/, '');
  const configuredRedirectUri = getOptionalServerEnv('META_REDIRECT_URI');

  // Default redirect URI matches our callback endpoint
  const redirectUri = configuredRedirectUri || (appUrl ? `${appUrl}/api/meta/oauth/callback` : '');

  return {
    appId,
    appSecret,
    redirectUri,
    graphVersion,
    graphBaseUrl: `https://graph.facebook.com/${graphVersion}`,
    oauthDialogUrl: `https://www.facebook.com/${graphVersion}/dialog/oauth`,
  };
}

export function requireMetaConfig(): MetaAppConfig {
  const config = getMetaConfig();

  if (!config.appId) {
    requireServerEnv('META_APP_ID', 'Required to use the Meta integration.');
  }

  if (!config.appSecret) {
    requireServerEnv('META_APP_SECRET', 'Required to use the Meta integration.');
  }

  if (!config.redirectUri) {
    throw new Error(
      'Missing required server environment variable META_REDIRECT_URI. Set META_REDIRECT_URI or APP_URL to use the Meta integration.'
    );
  }

  return config;
}

export function isMetaConfigured(): boolean {
  const config = getMetaConfig();
  return Boolean(config.appId && config.appSecret && config.redirectUri);
}

// Default requested scopes for official Meta Graph API
export const REQUIRED_META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];
