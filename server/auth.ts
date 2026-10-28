import { Request, Response, NextFunction } from 'express';
import { getAdminAuth } from './firebase-admin';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    emailVerified?: boolean;
  };
}

export async function authenticateFirebaseRequest(req: Request): Promise<{ uid: string; email: string; emailVerified: boolean }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const error = new Error('Authentication is required.');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    const error = new Error('Authentication token is empty.');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const decodedToken = await getAdminAuth().verifyIdToken(idToken);
  return { uid: decodedToken.uid, email: decodedToken.email || '', emailVerified: decodedToken.email_verified === true };
}

export async function verifyFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    req.user = await authenticateFirebaseRequest(req);
    return next();
  } catch (err: any) {
    console.warn('Firebase ID Token verification failed:', err?.message || err);
    return res.status(401).json({
      error: 'Sesión expirada o token de acceso inválido. Vuelva a iniciar sesión.',
      code: 'INVALID_TOKEN',
    });
  }
}
