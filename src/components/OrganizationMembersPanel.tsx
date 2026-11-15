import React, { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, Clock, Crown, AlertCircle, Send, BadgeCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { describeSeats, isTeamFull } from '../utils/teamSeats';

interface MembersListing {
  owner: { uid: string; email: string } | null;
  members: Array<{ uid: string; email: string }>;
  invites: Array<{ email: string; createdAt: string }>;
  managerUid: string | null;
  seatLimit: number | null;
  seatsUsed: number;
}

interface OrganizationMembersPanelProps {
  orgId: string;
  orgName: string;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  /**
   * Who manages the team. The platform admin uses the admin endpoints, can go over the seat limit
   * and picks the newsroom manager; the manager uses /api/team/members for its own newsroom.
   */
  mode?: 'platform-admin' | 'manager';
  /** Called after a member is added or removed, so the parent can refresh its user list. */
  onChanged?: () => void;
}

/**
 * Team management for one newsroom: every account listed here shares the newsroom's identity,
 * templates, history and balance.
 */
export const OrganizationMembersPanel: React.FC<OrganizationMembersPanelProps> = ({
  orgId,
  orgName,
  authFetch,
  mode = 'platform-admin',
  onChanged,
}) => {
  const [listing, setListing] = useState<MembersListing | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const { user, sendPasswordSetupEmail } = useAuth();

  const isAdmin = mode === 'platform-admin';
  const base = isAdmin ? `/api/admin/organizations/${encodeURIComponent(orgId)}/members` : '/api/team/members';

  const load = useCallback(async () => {
    try {
      const res = await authFetch(base);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los miembros.');
      setListing(data);
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'No se pudieron cargar los miembros.' });
    }
  }, [authFetch, base]);

  useEffect(() => {
    setListing(null);
    setMessage(null);
    load();
  }, [load]);

  const submit = async (path: string, body: object, success: (data: any) => string | Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authFetch(path, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.');
      setMessage({ kind: 'ok', text: await success(data) });
      await load();
      onChanged?.();
      return true;
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'No se pudo completar la acción.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) return;
    const ok = await submit(base, { email: target }, async (data) => {
      if (data.status === 'created') {
        try {
          await sendPasswordSetupEmail(data.email);
          return `Cuenta creada para ${data.email}. Le enviamos un email para crear su contraseña y entrar a ${orgName}. El enlace vence en una hora: si no llega a tiempo, usá "Reenviar acceso".`;
        } catch {
          return `Cuenta creada para ${data.email}, pero no se pudo enviar el email. Usá "Reenviar acceso".`;
        }
      }
      return data.status === 'active'
        ? `${data.email} ya forma parte de ${orgName}.`
        : `Invitación pendiente para ${data.email}: se une a ${orgName} cuando confirme su email.`;
    });
    if (ok) setEmail('');
  };

  const handleResendAccess = async (target: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await sendPasswordSetupEmail(target);
      setMessage({ kind: 'ok', text: `Le reenviamos a ${target} el enlace para crear o recuperar su contraseña.` });
    } catch {
      setMessage({ kind: 'error', text: `No se pudo enviar el email a ${target}. Intentá nuevamente en unos minutos.` });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (target: string) =>
    submit(`${base}/remove`, { email: target }, () => `${target} ya no tiene acceso a ${orgName}.`);

  const handleManager = (target: string | null) =>
    submit(`/api/admin/organizations/${encodeURIComponent(orgId)}/manager`, { email: target }, () =>
      target ? `${target} ahora es responsable de ${orgName} y puede gestionar su equipo.` : `${orgName} quedó sin responsable.`
    );

  const full = listing ? isTeamFull(listing.seatsUsed, listing.seatLimit) : false;
  // The platform admin can go over the limit; the manager is stopped at it.
  const addBlocked = !isAdmin && full;
  const rowClass = 'flex items-center justify-between gap-3 rounded-lg border border-brand-navy/10 px-3 py-2 text-sm';
  const iconButton = 'rounded p-1 text-brand-navy/70 hover:bg-brand-navy/5 disabled:opacity-40';

  return (
    <div className="rounded-xl border border-brand-navy/15 bg-white p-5 space-y-4">
      <div>
        <h4 className="flex items-center gap-2 text-xs font-semibold text-brand-navy/80 uppercase tracking-wider">
          <Users className="h-3.5 w-3.5" /> Equipo del medio
        </h4>
        <p className="mt-1 text-xs text-brand-navy/60">
          Todas estas cuentas comparten la identidad, las plantillas, el historial y el saldo de {orgName}.
        </p>
        {listing && (
          <p className={`mt-2 text-xs font-medium ${full ? 'text-amber-700' : 'text-brand-navy/80'}`}>
            {describeSeats(listing.seatsUsed, listing.seatLimit)}
            {full && (isAdmin ? ' · cupo completo (como admin podés superarlo)' : ' · cupo completo')}
          </p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <label htmlFor={`member-email-${orgId}`} className="sr-only">Email de la cuenta</label>
        <input
          id={`member-email-${orgId}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="periodista@medio.com"
          disabled={addBlocked}
          className="min-w-0 flex-1 rounded-lg border border-brand-navy/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-brand-navy/5"
        />
        <button
          type="submit"
          disabled={busy || addBlocked}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-navy/90 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" /> Agregar al medio
        </button>
      </form>
      {addBlocked && (
        <p className="text-xs text-brand-navy/60">
          Para sumar otra cuenta, quitá una cuenta o una invitación pendiente, o pedile al equipo de Titular que amplíe el cupo.
        </p>
      )}

      {message && (
        <p
          role="status"
          className={`flex items-start gap-2 text-xs ${message.kind === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {message.kind === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          {message.text}
        </p>
      )}

      {!listing ? (
        <p className="text-xs text-brand-navy/50">Cargando equipo…</p>
      ) : (
        <ul className="space-y-2">
          {listing.owner && (
            <li className={rowClass}>
              <span className="min-w-0 break-all font-mono text-xs">{listing.owner.email || listing.owner.uid}</span>
              <span className="inline-flex items-center gap-1 rounded bg-brand-navy/5 px-2 py-0.5 text-[11px] font-medium text-brand-navy/70">
                <Crown className="h-3 w-3" /> Dueño
              </span>
            </li>
          )}
          {listing.members.map((m) => {
            const isManager = m.uid === listing.managerUid;
            const isSelf = m.uid === user?.uid;
            return (
              <li key={m.uid} className={rowClass}>
                <span className="min-w-0 break-all font-mono text-xs">{m.email || m.uid}</span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {isManager && (
                    <span className="inline-flex items-center gap-1 rounded bg-brand-primary-soft px-2 py-0.5 text-[11px] font-medium text-brand-primary-deep">
                      <BadgeCheck className="h-3 w-3" /> Responsable
                    </span>
                  )}
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Activa</span>
                  {isAdmin && m.email && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleManager(isManager ? null : m.email)}
                      className="rounded border border-brand-navy/15 px-2 py-0.5 text-[11px] font-medium text-brand-navy/80 hover:bg-brand-navy/5 disabled:opacity-40"
                    >
                      {isManager ? 'Quitar responsable' : 'Hacer responsable'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !m.email}
                    onClick={() => handleResendAccess(m.email)}
                    aria-label={`Reenviar acceso a ${m.email}`}
                    title="Reenviar el enlace para crear o recuperar la contraseña"
                    className={iconButton}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  {/* The manager cannot remove itself; the server refuses it too. */}
                  {(isAdmin || !isSelf) && (
                    <button
                      type="button"
                      disabled={busy || !m.email}
                      onClick={() => handleRemove(m.email)}
                      aria-label={`Quitar ${m.email} del medio`}
                      className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {listing.invites.map((i) => (
            <li key={i.email} className={rowClass}>
              <span className="min-w-0 break-all font-mono text-xs">{i.email}</span>
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  <Clock className="h-3 w-3" /> Pendiente
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemove(i.email)}
                  aria-label={`Cancelar la invitación de ${i.email}`}
                  className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
          {listing.members.length === 0 && listing.invites.length === 0 && (
            <li className="text-xs text-brand-navy/50">Todavía no hay otras cuentas en este medio.</li>
          )}
        </ul>
      )}
    </div>
  );
};
