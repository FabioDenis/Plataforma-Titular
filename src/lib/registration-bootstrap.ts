export interface RegistrationAuthUser {
  getIdToken: () => Promise<string>;
  delete: () => Promise<void>;
}

export interface BootstrapResponse {
  user: Record<string, unknown> & { id: string };
  organization: Record<string, unknown> & { id: string };
}

export class RegistrationBootstrapError extends Error {
  constructor(message: string, public readonly cleanupFailed: boolean) {
    super(message);
  }
}

export async function bootstrapRegistration(
  user: RegistrationAuthUser,
  fetcher: typeof fetch = fetch
): Promise<BootstrapResponse> {
  try {
    const token = await user.getIdToken();
    const response = await fetcher('/api/auth/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Bootstrap failed with status ${response.status}`);
    }

    return await response.json() as BootstrapResponse;
  } catch (bootstrapError) {
    try {
      // Only this freshly created Auth user is eligible for compensation.
      await user.delete();
    } catch {
      throw new RegistrationBootstrapError(
        'No fue posible completar el registro y la cuenta podría requerir un reintento o recuperación.',
        true
      );
    }

    throw new RegistrationBootstrapError(
      'No fue posible completar el registro. La cuenta de autenticación recién creada fue eliminada.',
      false
    );
  }
}
