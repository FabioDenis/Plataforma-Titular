import React, { useState, useEffect } from 'react';
import {
  X,
  Newspaper,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { DEFAULT_TRIAL_PUBLICATION_LIMIT } from '../types';

// Constante fácilmente editable para el número de soporte de WhatsApp
export const SUPPORT_WHATSAPP_NUMBER = '543764524095';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  billingMessage?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trial: { label: 'Prueba Gratuita', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  free: { label: 'Prueba Gratuita', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  starter: { label: 'Plan Inicial', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  professional: { label: 'Plan Profesional', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  newsroom: { label: 'Plan Redacción', color: 'bg-brand-navy/5 text-brand-navy border-brand-navy/15' },
  authorized: { label: 'Suscripción Activa', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  pending: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  inactive: { label: 'Sin Suscripción', color: 'bg-brand-navy/5 text-brand-navy/60 border-brand-navy/15' },
};

export const BillingModal: React.FC<BillingModalProps> = ({ isOpen, onClose, billingMessage }) => {
  const { billingProfile, refreshBillingProfile } = useAuth();
  const orgContext = useOrganization();
  const organization = orgContext?.organization;

  const [errorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(billingMessage || null);

  useEffect(() => {
    if (billingMessage) setSuccessMsg(billingMessage);
  }, [billingMessage]);

  useEffect(() => {
    if (isOpen) {
      refreshBillingProfile().catch(() => {});
      if (orgContext?.reload) {
        orgContext.reload().catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Active Organization metrics
  const plan = organization?.plan || billingProfile?.planId || 'trial';
  const publicationLimit = organization?.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
  const publicationUsed = organization?.publicationUsed ?? 0;
  const remaining = Math.max(0, publicationLimit - publicationUsed);
  const usagePercentage = Math.min(100, Math.round((publicationUsed / publicationLimit) * 100));
  const isLimitReached = publicationUsed >= publicationLimit;

  const getPlanDisplayName = (id: string) => {
    if (id === 'starter') return 'Plan Inicial';
    if (id === 'professional') return 'Plan Profesional';
    if (id === 'newsroom') return 'Plan Redacción';
    return 'Prueba Gratuita';
  };

  const handleWhatsAppContact = () => {
    const text = "Hola Luciano. Ya utilicé las 3 publicaciones gratuitas de Hermes y quiero conocer los planes disponibles.";
    const url = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative my-8 w-full max-w-2xl rounded-2xl border border-brand-navy/15 bg-white p-6 shadow-raised text-brand-ink font-sans">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/10 hover:text-brand-ink transition-all cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-brand-navy/15 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary-deep border border-brand-primary/30">
              <Newspaper className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-brand-ink">Tu Plan</h2>
              <p className="text-xs text-brand-navy/60">
                Gestioná la capacidad de generación periodística para las redes sociales de tu medio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshBillingProfile().catch(() => {});
                if (orgContext?.reload) orgContext.reload().catch(() => {});
              }}
              className="flex items-center gap-1.5 rounded-lg border border-brand-navy/15 bg-brand-navy/5 px-3 py-1.5 text-xs font-semibold text-brand-navy/80 hover:text-brand-ink hover:border-brand-navy/40 cursor-pointer transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5 text-brand-primary-deep" />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* CONDITION 1: User still has publications remaining (publicationUsed < publicationLimit) */}
        {!isLimitReached ? (
          <>
            {/* Banner de prueba gratuita */}
            <div className="mt-5 rounded-2xl border border-brand-primary/30 bg-brand-primary-soft p-4 shadow-card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-primary-deep border border-brand-primary/30 shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-ink flex items-center gap-2">
                    <span>🎉 Tu prueba gratuita ya está activa.</span>
                  </h4>
                  <p className="text-xs text-brand-navy/80 mt-0.5">
                    Generá hasta {DEFAULT_TRIAL_PUBLICATION_LIMIT} publicaciones para conocer Hermes y automatizar tus redes periodísticas.
                  </p>
                </div>
              </div>
            </div>

            {/* Estado del Plan Activo & Métricas */}
            <div className="mt-5 rounded-2xl border border-brand-navy/15 bg-brand-navy/5 p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-brand-navy/15 pb-3">
                <div>
                  <span className="text-[11px] font-bold text-brand-navy/60 uppercase tracking-wider">
                    Estado del Plan Activo
                  </span>
                  <h3 className="text-lg font-extrabold text-brand-ink mt-0.5">
                    {getPlanDisplayName(plan)}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold bg-amber-50 text-amber-600 border-amber-200">
                    {STATUS_LABELS[plan]?.label || 'Activo'}
                  </span>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Limit */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-3 text-center">
                  <span className="text-[10px] font-semibold text-brand-navy/60 uppercase">Publicaciones Incluidas</span>
                  <div className="mt-1 text-xl font-black text-brand-ink font-mono">{publicationLimit}</div>
                </div>

                {/* Used */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-3 text-center">
                  <span className="text-[10px] font-semibold text-brand-navy/60 uppercase">Publicaciones Utilizadas</span>
                  <div className="mt-1 text-xl font-black text-amber-600 font-mono">{publicationUsed}</div>
                </div>

                {/* Remaining */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-3 text-center">
                  <span className="text-[10px] font-semibold text-brand-navy/60 uppercase">Publicaciones Restantes</span>
                  <div className="mt-1 text-xl font-black text-emerald-600 font-mono">{remaining}</div>
                </div>

                {/* Progress */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-3 text-center flex flex-col justify-center">
                  <span className="text-[10px] font-semibold text-brand-navy/60 uppercase">Uso de Capacidad</span>
                  <div className="mt-1 text-xl font-black text-brand-primary-deep font-mono">{publicationUsed} / {publicationLimit}</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs font-medium text-brand-navy/80 mb-1.5">
                  <span>Progreso de publicaciones</span>
                  <span className="font-mono font-bold text-brand-primary-deep">{usagePercentage}% consumido</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-white border border-brand-navy/15">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-brand-primary"
                    style={{ width: `${usagePercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* CONDITION 2: Limit reached (publicationUsed >= publicationLimit) */
          <div className="mt-6 rounded-2xl border border-brand-primary/30 bg-white p-8 shadow-raised text-center flex flex-col items-center justify-center space-y-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary-soft border border-brand-primary/30 text-brand-primary-deep shadow-lg">
              <Sparkles className="h-8 w-8" />
            </div>

            <div className="space-y-3 max-w-lg">
              <h3 className="text-2xl font-black text-brand-ink tracking-tight">
                Has utilizado todas las publicaciones incluidas en tu prueba gratuita.
              </h3>
              <p className="text-sm text-brand-navy/80 leading-relaxed font-medium">
                Si querés seguir utilizando Hermes para generar contenido para tus redes sociales, escribime y te cuento los planes disponibles.
              </p>
            </div>

            <button
              onClick={handleWhatsAppContact}
              className="mt-2 inline-flex items-center justify-center gap-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3.5 text-sm font-extrabold shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <MessageCircle className="h-5 w-5 fill-current" />
              <span>Contactarme</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
