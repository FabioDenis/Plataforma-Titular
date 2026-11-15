import React from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import { OrganizationMembersPanel } from './OrganizationMembersPanel';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Team screen for the newsroom manager: invites and removes the accounts of its own newsroom. */
export const TeamModal: React.FC<TeamModalProps> = ({ isOpen, onClose }) => {
  const { authFetch } = useAuth();
  const { organization } = useOrganization();
  if (!isOpen || !organization) return null;
  const orgId = organization.id;
  const orgName = organization.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-brand-navy/15 bg-white shadow-raised">
        <div className="flex items-center justify-between gap-3 border-b border-brand-navy/10 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-brand-ink">Equipo de {orgName}</h2>
            <p className="text-xs text-brand-navy/60">Como responsable del medio, invitás y quitás las cuentas de tu equipo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-brand-navy/70 hover:bg-brand-navy/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <OrganizationMembersPanel orgId={orgId} orgName={orgName} authFetch={authFetch} mode="manager" />
        </div>
      </div>
    </div>
  );
};
