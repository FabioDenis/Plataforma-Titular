import React, { useState } from 'react';
import {
  Facebook,
  Instagram,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Unlink,
  ShieldCheck,
  Building2,
  Clock,
  Info,
  Check,
  Settings2,
  ChevronDown,
} from 'lucide-react';
import { useMetaAccounts } from '../hooks/useMetaAccounts';
import { useOrganization } from '../hooks/useOrganization';
import { PageSelectionModal } from './PageSelectionModal';

export const SocialAccountsSection: React.FC = () => {
  const { organization } = useOrganization();
  const {
    status,
    loading,
    isConnecting,
    isSelectingPage,
    isSavingPage,
    availablePages,
    error,
    successMessage,
    clearError,
    clearSuccess,
    connect,
    selectPage,
    cancelPageSelection,
    disconnect,
    canManageConnections,
    userRole,
  } = useMetaAccounts();

  const [confirmDisconnect, setConfirmDisconnect] = useState<'all' | 'facebook' | 'instagram' | null>(null);
  const [showAdminMenu, setShowAdminMenu] = useState<boolean>(false);

  const orgName = organization?.name || 'Municipalidad de Leandro N. Alem';
  const isConnected = Boolean(status.facebook.connected || status.instagram.connected);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="rounded-xl border border-brand-navy/15 bg-white p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-brand-primary">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-brand-ink tracking-tight">
                Redes Sociales Oficiales
              </h2>
            </div>
            <p className="text-xs text-brand-navy/60 max-w-2xl leading-relaxed">
              Integración oficial con Meta (Graph API v22.0) para vincular la Página institucional de Facebook y la cuenta profesional de Instagram asociada.
            </p>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg bg-brand-navy/5 border border-brand-navy/15 px-3.5 py-2 shrink-0">
            <Building2 className="h-4 w-4 text-brand-primary-deep" />
            <div>
              <p className="text-[10px] uppercase font-bold text-brand-navy/60 tracking-wider">
                Institución Activa
              </p>
              <p className="text-xs font-semibold text-brand-ink truncate max-w-[200px]">
                {orgName}
              </p>
            </div>
          </div>
        </div>

        {/* Server Config Notice */}
        {!status.isConfiguredOnServer && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-700">
                Configuración de Meta en el Servidor
              </p>
              <p className="text-amber-800/90 leading-relaxed">
                Para completar la autorización OAuth oficial en vivo con Meta, define las variables{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-700">META_APP_ID</code> y{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-700">META_APP_SECRET</code> en los Secretos / Variables de entorno de la aplicación.
              </p>
            </div>
          </div>
        )}

        {/* Role Notice if not Admin */}
        {!canManageConnections && (
          <div className="mt-4 rounded-lg border border-brand-navy/15 bg-brand-navy/5 p-3 text-xs text-brand-navy/80 flex items-center gap-2">
            <Info className="h-4 w-4 text-brand-navy/60 shrink-0" />
            <span>
              Modo de solo lectura (Rol: {userRole}). Solo los usuarios con rol de <strong>Administrador</strong> pueden conectar o modificar redes oficiales.
            </span>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-xs text-rose-600 hover:text-brand-ink underline cursor-pointer"
            >
              Descartar
            </button>
          </div>
        )}

        {/* Success Notification */}
        {successMessage && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={clearSuccess}
              className="text-xs text-emerald-600 hover:text-brand-ink underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* Main Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* FACEBOOK CARD */}
        <div className="rounded-xl border border-brand-navy/15 bg-white p-6 shadow-card flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-brand-primary border border-blue-200">
                  <Facebook className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-ink">Facebook</h3>
                  <p className="text-xs text-brand-navy/60">Página Oficial</p>
                </div>
              </div>

              {status.facebook.connected ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Conectado
                </span>
              ) : (
                <span className="text-[11px] font-medium text-brand-navy/50 bg-brand-navy/5 px-2.5 py-1 rounded-full border border-brand-navy/15">
                  No conectado
                </span>
              )}
            </div>

            {status.facebook.connected ? (
              <div className="rounded-lg bg-white border border-brand-navy/15 p-4 space-y-2">
                <p className="text-sm font-bold text-brand-ink truncate">
                  {status.facebook.pageName || orgName}
                </p>
                {status.facebook.category && (
                  <p className="text-xs text-brand-navy/60">
                    Categoría: <span className="text-brand-navy/80">{status.facebook.category}</span>
                  </p>
                )}
                {status.facebook.connectedAt && (
                  <p className="text-[11px] text-brand-navy/50 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Conectado el {new Date(status.facebook.connectedAt).toLocaleDateString('es-AR')}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-lg bg-white border border-brand-navy/15 p-4 text-xs text-brand-navy/60 leading-relaxed">
                Permite conectar la Página de Facebook administrada oficialmente por la institución.
              </div>
            )}
          </div>

          {!status.facebook.connected && (
            <div className="pt-2 border-t border-brand-navy/15">
              <button
                onClick={connect}
                disabled={isConnecting || loading || !canManageConnections}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-4 py-2.5 text-xs font-bold text-brand-ink transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Facebook className="h-4 w-4" />
                    <span>Conectar Facebook</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* INSTAGRAM CARD */}
        <div className="rounded-xl border border-brand-navy/15 bg-white p-6 shadow-card flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-500 border border-rose-200">
                  <Instagram className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-ink">Instagram</h3>
                  <p className="text-xs text-brand-navy/60">Cuenta Profesional</p>
                </div>
              </div>

              {status.instagram.connected ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Conectado
                </span>
              ) : (
                <span className="text-[11px] font-medium text-brand-navy/50 bg-brand-navy/5 px-2.5 py-1 rounded-full border border-brand-navy/15">
                  No conectado
                </span>
              )}
            </div>

            {status.instagram.connected ? (
              <div className="rounded-lg bg-white border border-brand-navy/15 p-4 space-y-2">
                <div className="flex items-center gap-2.5">
                  {status.instagram.profilePictureUrl && (
                    <img
                      src={status.instagram.profilePictureUrl}
                      alt={status.instagram.username || 'IG'}
                      className="h-8 w-8 rounded-full border border-brand-navy/15 object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-bold text-brand-ink truncate">
                      @{status.instagram.username}
                    </p>
                    {status.instagram.name && (
                      <p className="text-[11px] text-brand-navy/60">{status.instagram.name}</p>
                    )}
                  </div>
                </div>
                {status.instagram.connectedAt && (
                  <p className="text-[11px] text-brand-navy/50 flex items-center gap-1 pt-1">
                    <Clock className="h-3 w-3" />
                    Conectado el {new Date(status.instagram.connectedAt).toLocaleDateString('es-AR')}
                  </p>
                )}
              </div>
            ) : status.facebook.connected && status.instagram.reason ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800/90 space-y-1.5">
                <p className="font-semibold text-amber-700">Cuenta no detectada</p>
                <p className="text-[11px] leading-relaxed">
                  Se conecta mediante una página de Facebook compatible. No se encontró una cuenta profesional vinculada en Meta Business Suite.
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-white border border-brand-navy/15 p-4 text-xs text-brand-navy/60 leading-relaxed">
                Se conecta mediante una página de Facebook compatible.
              </div>
            )}
          </div>

          {!status.instagram.connected && !status.facebook.connected && (
            <div className="pt-2 border-t border-brand-navy/15">
              <button
                onClick={connect}
                disabled={isConnecting || loading || !canManageConnections}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-4 py-2.5 text-xs font-bold text-brand-ink transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <Instagram className="h-4 w-4" />
                    <span>Conectar</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Administrar Conexión Section (Shown when connected) */}
      {isConnected && (
        <div className="rounded-xl border border-brand-navy/15 bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy/80 border border-brand-navy/15">
              <Settings2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-brand-ink">Estado de Vinculación</p>
              <p className="text-[11px] text-brand-navy/60">
                Las cuentas oficiales están sincronizadas con Titular para esta institución.
              </p>
            </div>
          </div>

          {canManageConnections && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={connect}
                disabled={isConnecting || loading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg bg-brand-navy/5 hover:bg-brand-navy/10 border border-brand-navy/15 px-3.5 py-2 text-xs font-semibold text-brand-navy/80 hover:text-brand-ink transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>Cambiar Página</span>
              </button>

              <button
                onClick={() => setConfirmDisconnect('all')}
                disabled={loading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 transition-colors cursor-pointer"
              >
                <Unlink className="h-3.5 w-3.5" />
                <span>Administrar conexión</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Page Selection Modal */}
      <PageSelectionModal
        isOpen={isSelectingPage}
        pages={availablePages}
        organizationName={orgName}
        isSaving={isSavingPage}
        onSelect={selectPage}
        onClose={cancelPageSelection}
      />

      {/* Disconnect Confirmation Modal */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-sm rounded-xl border border-brand-navy/15 bg-white p-6 shadow-raised space-y-4">
            <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              ¿Desconectar redes sociales oficiales?
            </h3>
            <p className="text-xs text-brand-navy/60 leading-relaxed">
              Titular desvinculará la Página de Facebook y la cuenta de Instagram de <strong className="text-brand-ink">{orgName}</strong>. Podrás volver a conectarlas en cualquier momento.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDisconnect(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-navy/60 hover:text-brand-ink cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const plat = confirmDisconnect;
                  setConfirmDisconnect(null);
                  await disconnect(plat);
                }}
                className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 text-xs font-bold text-brand-ink cursor-pointer"
              >
                Confirmar Desconexión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
