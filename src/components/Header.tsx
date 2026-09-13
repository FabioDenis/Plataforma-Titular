import React, { useState } from 'react';
import { History, Settings, LogOut, LogIn, Loader2, AlertCircle, CreditCard, ShieldCheck } from 'lucide-react';
import titularStudioLogo from '../assets/titular-studio-logo.png';
import { OutletBranding, OrganizationIdentity, DEFAULT_TRIAL_PUBLICATION_LIMIT } from '../types';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../hooks/useOrganization';

interface HeaderProps {
  branding: OutletBranding;
  activeIdentity?: OrganizationIdentity;
  activeView: 'generator' | 'identity' | 'social';
  onChangeView: (view: 'generator' | 'identity' | 'social') => void;
  onOpenBranding: () => void;
  onOpenHistory: () => void;
  onOpenIntegrations: () => void;
  onOpenAdmin?: () => void;
  savedCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  branding,
  activeIdentity,
  activeView,
  onChangeView,
  onOpenBranding,
  onOpenHistory,
  onOpenAdmin,
  savedCount,
}) => {
  const { user, loading: authLoading, isAdmin, setIsBillingOpen, setIsAuthModalOpen, logout } = useAuth();
  const { organization, loading: orgLoading } = useOrganization();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const limit = organization?.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
  const used = organization?.publicationUsed ?? 0;
  const currentOrgName = organization?.name || activeIdentity?.name || branding.name || 'Mi Medio';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-brand-navy/10 bg-white/95 backdrop-blur-sm">
      <div className="flex h-16 sm:h-20 w-full items-center justify-between px-4 sm:px-6 lg:px-10 gap-4">
        {/* Left: Brand Logo & Main Navigation */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onChangeView('generator')}
            className="flex items-center gap-2 cursor-pointer text-left transition-opacity hover:opacity-90 py-1 shrink-0"
            title="Titular Studio"
          >
            <img
              src={titularStudioLogo}
              alt="Logo de Titular Studio"
              width={1153}
              height={431}
              className="h-12 w-auto sm:h-18"
            />
          </button>
        </div>

        {/* Center: Main Navigation */}
        <nav className="flex flex-1 items-center justify-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => onChangeView('generator')}
              className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'generator'
                  ? 'text-brand-navy bg-brand-primary-soft font-semibold'
                  : 'text-brand-navy/70 hover:text-brand-navy hover:bg-brand-navy/5'
              }`}
            >
              Generar
            </button>

            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer text-brand-navy/70 hover:text-brand-navy hover:bg-brand-navy/5 whitespace-nowrap shrink-0"
            >
              <span>Historial</span>
              {savedCount > 0 && (
                <span className="text-[10px] font-mono text-brand-navy/70 bg-brand-navy/10 px-1.5 py-0.2 rounded ml-0.5">
                  {savedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => onChangeView('identity')}
              className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'identity'
                  ? 'text-brand-navy bg-brand-primary-soft font-semibold'
                  : 'text-brand-navy/70 hover:text-brand-navy hover:bg-brand-navy/5'
              }`}
            >
              Identidad
            </button>

            <button
              type="button"
              onClick={() => onChangeView('social')}
              className={`px-3.5 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeView === 'social'
                  ? 'text-brand-navy bg-brand-primary-soft font-semibold'
                  : 'text-brand-navy/70 hover:text-brand-navy hover:bg-brand-navy/5'
              }`}
            >
              Redes sociales
            </button>

            {isAdmin && onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer text-amber-700 hover:text-amber-800 hover:bg-amber-100 border border-amber-400/40 ml-1 whitespace-nowrap shrink-0"
                title="Panel de Administrador de Titular Studio"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin</span>
              </button>
            )}
          </nav>

        {/* Right: Balance, Organization & User Menu */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Usage Counter: Uso X / Y - Always rendered stably without layout shifts */}
          <button
            type="button"
            onClick={() => setIsBillingOpen(true)}
            className="flex items-center gap-1.5 text-xs text-brand-navy/70 hover:text-brand-navy px-2 py-1 rounded transition-colors cursor-pointer"
            title="Gestionar publicaciones y plan"
          >
            <span className="text-[11px] text-brand-navy/50">Uso</span>
            <span className="font-medium text-brand-navy font-mono text-[11px]">
              {used} / {limit}
            </span>
            {orgLoading && user && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
            )}
          </button>

          {/* Active Organization Selector */}
          <button
            type="button"
            onClick={onOpenBranding}
            className="hidden sm:flex items-center gap-1.5 text-xs text-brand-navy/70 hover:text-brand-navy px-2 py-1 rounded transition-colors cursor-pointer max-w-[180px]"
            title="Configuración de la organización"
          >
            <span className="text-brand-navy/50 text-[11px]">Medio:</span>
            <span className="font-medium text-brand-navy truncate text-[11px]">
              {currentOrgName}
            </span>
          </button>

          {/* User Auth Control - Stable loading & authenticated state */}
          {authLoading ? (
            <div className="h-7 w-7 rounded bg-brand-navy/10 animate-pulse shrink-0" />
          ) : user ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5 p-1 text-xs text-brand-navy/90 hover:text-brand-navy transition-colors cursor-pointer"
                title="Cuenta de usuario"
                aria-label="Cuenta de usuario"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded bg-brand-navy/10 text-[11px] font-semibold text-brand-navy shrink-0 border border-brand-navy/20">
                  {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-brand-navy/15 bg-white p-1 shadow-card z-50 animate-fade-in">
                  <div className="px-3 py-2 border-b border-brand-navy/10">
                    <p className="text-[10px] text-brand-navy/50 font-medium">Cuenta activa</p>
                    <p className="text-xs font-semibold text-brand-navy truncate">{user.email}</p>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenBranding();
                      }}
                      className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-brand-navy/80 hover:bg-brand-navy/5 hover:text-brand-navy cursor-pointer"
                    >
                      <Settings className="h-3.5 w-3.5 text-brand-navy/60 shrink-0" />
                      <span>Configurar Organización</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsBillingOpen(true);
                      }}
                      className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-brand-navy/80 hover:bg-brand-navy/5 hover:text-brand-navy cursor-pointer"
                    >
                      <CreditCard className="h-3.5 w-3.5 text-brand-navy/60 shrink-0" />
                      <span>Planes y Facturación</span>
                    </button>

                    {isAdmin && onOpenAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenAdmin();
                        }}
                        className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-amber-600 hover:bg-amber-50 cursor-pointer font-medium"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>Panel de Administrador</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 cursor-pointer mt-0.5 border-t border-brand-navy/10 pt-1.5"
                    >
                      <LogOut className="h-3.5 w-3.5 shrink-0" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-primary hover:bg-brand-primary-hover px-3.5 py-2 text-sm font-medium text-brand-ink transition-colors cursor-pointer shadow-xs shrink-0"
            >
              <LogIn className="h-3 w-3 shrink-0" />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
