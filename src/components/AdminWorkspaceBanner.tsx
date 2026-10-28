import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';

/**
 * Shown while a platform admin has a client newsroom open: every identity, template or history
 * change made here is saved for that newsroom's whole team.
 */
export const AdminWorkspaceBanner: React.FC = () => {
  const { user, isAdmin, authFetch } = useAuth();
  const { organization } = useOrganization();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !isAdmin || !organization) return null;
  const members: unknown = organization.members;
  const belongs = organization.ownerUid === user.uid || (Array.isArray(members) && members.includes(user.uid));
  if (belongs) return null;

  const handleExit = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await authFetch('/api/admin/organizations/exit', { method: 'POST' });
      if (!res.ok) throw new Error();
    } catch {
      setError('No se pudo volver a tu medio. Intentá nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-brand-navy/15 bg-brand-navy text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1">
          Estás administrando <span className="font-semibold">{organization.name}</span>. La identidad, las plantillas y
          el historial que edites se guardan para todo su equipo.
          {error && <span className="block text-rose-200">{error}</span>}
        </p>
        <button
          type="button"
          onClick={handleExit}
          disabled={busy}
          className="rounded border border-white/40 px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-50"
        >
          Volver a mi medio
        </button>
      </div>
    </div>
  );
};
