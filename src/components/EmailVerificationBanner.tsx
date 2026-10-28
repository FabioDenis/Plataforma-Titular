import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Asks signed-in users to confirm their email. A verified address is required to join a shared
 * newsroom, so an invited teammate only sees their medio after confirming.
 */
export const EmailVerificationBanner: React.FC = () => {
  const { user, emailVerified, resendVerificationEmail, confirmEmailVerified } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user || emailVerified) return null;

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch {
      setStatus('No pudimos completar la acción. Esperá unos minutos e intentá nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 text-sm text-amber-900 sm:px-6 lg:px-8">
        <MailCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          Confirmá tu email: te enviamos un enlace a <span className="font-semibold">{user.email}</span>. Si tu medio
          te invitó, vas a acceder a él después de confirmarlo.
          {status && <span className="block text-amber-800">{status}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await resendVerificationEmail();
                return 'Te reenviamos el enlace de confirmación.';
              })
            }
            className="rounded border border-amber-300 px-3 py-1.5 font-medium hover:bg-amber-100 disabled:opacity-50"
          >
            Reenviar enlace
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () =>
                (await confirmEmailVerified())
                  ? 'Email confirmado.'
                  : 'Todavía no vemos la confirmación. Abrí el enlace del email y volvé a intentarlo.'
              )
            }
            className="rounded bg-amber-900 px-3 py-1.5 font-medium text-amber-50 hover:bg-amber-800 disabled:opacity-50"
          >
            Ya lo confirmé
          </button>
        </div>
      </div>
    </div>
  );
};
