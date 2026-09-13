export interface MetaApiRawError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_user_title?: string;
  error_user_msg?: string;
  is_transient?: boolean;
}

export type MetaErrorCategory =
  | 'TOKEN_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'INCOMPATIBLE_ACCOUNT'
  | 'RATE_LIMIT'
  | 'MEDIA_ERROR'
  | 'NETWORK'
  | 'NO_PAGES_FOUND'
  | 'INVALID_SESSION'
  | 'EXPIRED_SESSION'
  | 'INVALID_PAGE'
  | 'UNKNOWN';

export class MetaServiceError extends Error {
  public code?: number;
  public subcode?: number;
  public fbtraceId?: string;
  public userMessage: string;
  public category: MetaErrorCategory;
  public technicalDetails?: string;

  constructor(
    userMessage: string,
    category: MetaErrorCategory,
    rawError?: any
  ) {
    super(userMessage);
    this.name = 'MetaServiceError';
    this.userMessage = userMessage;
    this.category = category;

    if (rawError) {
      const errObj = rawError.error || rawError;
      this.code = errObj.code;
      this.subcode = errObj.error_subcode;
      this.fbtraceId = errObj.fbtrace_id;
      this.technicalDetails = errObj.message || String(rawError);
    }
  }
}

/**
 * Sanitizes strings to prevent access tokens, app secrets or private credentials from leaking in logs or responses.
 */
export function sanitizeMetaLogs(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/access_token=[a-zA-Z0-9_-]+/gi, 'access_token=[REDACTED]')
    .replace(/client_secret=[a-zA-Z0-9_-]+/gi, 'client_secret=[REDACTED]')
    .replace(/EAA[a-zA-Z0-9_-]{20,}/g, '[REDACTED_META_TOKEN]')
    .replace(/[a-f0-9]{32}/gi, (match) => match.length === 32 ? '[REDACTED_SECRET]' : match);
}

/**
 * Parses a response from Meta Graph API and returns a structured, user-friendly MetaServiceError
 */
export function parseMetaGraphError(rawResponse: any, contextDescription = 'operación con Meta'): MetaServiceError {
  const err = rawResponse?.error || rawResponse;
  const code = err?.code;
  const subcode = err?.error_subcode;
  const rawMsg = err?.message || 'Error desconocido retornado por Meta Graph API';
  const userMsgFromMeta = err?.error_user_msg || err?.error_user_title;

  console.error(`[META GRAPH API ERROR] [${contextDescription}]:`, {
    code,
    subcode,
    type: err?.type,
    fbtrace_id: err?.fbtrace_id,
    message: sanitizeMetaLogs(rawMsg),
  });

  // 1. Token Expired or Invalid (OAuth error codes 190, subcode 463: expired, 467: invalidated, 460: password change)
  if (code === 190 || subcode === 463 || subcode === 467 || subcode === 460 || rawMsg.includes('Error validating access token') || rawMsg.includes('Session has expired')) {
    return new MetaServiceError(
      'La conexión con Facebook/Instagram necesita renovarse (el token de acceso ha expirado o fue revocado). Vuelve a conectar la cuenta.',
      'TOKEN_EXPIRED',
      rawResponse
    );
  }

  // 2. Insufficient Permissions (Codes 200 to 299, or permission specific error)
  if (code === 200 || (code && code >= 200 && code < 300) || rawMsg.includes('permission') || rawMsg.includes('Permissions error')) {
    return new MetaServiceError(
      'La cuenta conectada no tiene los permisos necesarios (pages_manage_posts o instagram_content_publish). Verifica que hayas otorgado todos los accesos solicitados en Meta.',
      'PERMISSION_DENIED',
      rawResponse
    );
  }

  // 3. Incompatible Account / Not a Business Account / Missing Linked IG (code 10, 100 with business message)
  if (
    subcode === 2207051 ||
    rawMsg.includes('Instagram account is not a business') ||
    rawMsg.includes('is not a business or creator account') ||
    rawMsg.includes('Instagram account does not exist') ||
    rawMsg.includes('Only professional accounts')
  ) {
    return new MetaServiceError(
      'Esta cuenta de Instagram no es compatible. Debe ser una cuenta Profesional (Empresa o Creador) vinculada a tu Página de Facebook.',
      'INCOMPATIBLE_ACCOUNT',
      rawResponse
    );
  }

  // 4. Rate Limiting / Calls exceeded
  if (code === 4 || code === 17 || code === 32 || code === 341 || rawMsg.includes('request limit reached') || rawMsg.includes('calls to this api have exceeded the rate limit')) {
    return new MetaServiceError(
      'Se ha alcanzado temporalmente el límite de solicitudes de Meta. Por favor espera unos minutos antes de intentar nuevamente.',
      'RATE_LIMIT',
      rawResponse
    );
  }

  // 5. Media & Image constraints (aspect ratio, download failure, corrupted image)
  if (
    code === 36000 ||
    code === 36003 ||
    rawMsg.includes('aspect ratio') ||
    rawMsg.includes('Media download failed') ||
    rawMsg.includes('image format') ||
    rawMsg.includes('media_type')
  ) {
    return new MetaServiceError(
      'Meta no pudo procesar la imagen proporcionada. Verifica que la imagen sea accesible públicamente y cumpla con las proporciones permitidas (4:5 para feed o 9:16 para historias).',
      'MEDIA_ERROR',
      rawResponse
    );
  }

  // 6. User friendly message from Meta or fallback
  if (userMsgFromMeta) {
    return new MetaServiceError(userMsgFromMeta, 'UNKNOWN', rawResponse);
  }

  return new MetaServiceError(
    `Error de Meta: ${sanitizeMetaLogs(rawMsg)}`,
    'UNKNOWN',
    rawResponse
  );
}
