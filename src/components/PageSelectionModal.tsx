import React, { useState } from 'react';
import {
  Facebook,
  Instagram,
  CheckCircle2,
  AlertCircle,
  Building2,
  Sparkles,
  ArrowRight,
  X,
  Loader2,
} from 'lucide-react';
import { AdministeredPageItem } from '../types';

interface PageSelectionModalProps {
  isOpen: boolean;
  pages: AdministeredPageItem[];
  organizationName: string;
  isSaving: boolean;
  onSelect: (pageId: string) => Promise<boolean>;
  onClose: () => void;
}

export const PageSelectionModal: React.FC<PageSelectionModalProps> = ({
  isOpen,
  pages,
  organizationName,
  isSaving,
  onSelect,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string>(pages[0]?.id || '');

  if (!isOpen) return null;

  const selectedPage = pages.find((p) => p.id === selectedId);

  const handleConfirm = async () => {
    if (!selectedId || isSaving) return;
    await onSelect(selectedId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl rounded-2xl border border-brand-navy/15 bg-white shadow-raised overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="border-b border-brand-navy/15 bg-white p-5 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary-deep border border-brand-primary/30">
              <Facebook className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-brand-ink tracking-tight">
                Seleccionar Página Oficial de Facebook
              </h3>
              <p className="text-xs text-brand-navy/60 mt-0.5">
                Se detectaron <span className="font-semibold text-brand-navy">{pages.length}</span> páginas administradas por tu cuenta de Meta. Elige cuál vincular a <strong className="text-brand-primary-deep">{organizationName}</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-brand-navy/60 hover:text-brand-ink p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: List of Pages */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-navy/60 mb-2">
            Páginas disponibles en tu cuenta de Meta:
          </p>

          <div className="space-y-2.5">
            {pages.map((page) => {
              const isSelected = page.id === selectedId;
              const hasIg = Boolean(page.instagramAccount?.id);

              return (
                <div
                  key={page.id}
                  onClick={() => !isSaving && setSelectedId(page.id)}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-brand-primary bg-blue-50 shadow-lg ring-1 ring-brand-primary/40'
                      : 'border-brand-navy/15 bg-white hover:border-brand-navy/30 hover:bg-brand-navy/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isSelected
                            ? 'border-brand-primary bg-brand-primary text-brand-ink'
                            : 'border-brand-navy/25 bg-brand-navy/5'
                        }`}
                      >
                        {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-brand-ink tracking-tight">
                            {page.name}
                          </p>
                          {page.category && (
                            <span className="text-[10px] font-medium bg-brand-navy/10 text-brand-navy/80 px-2 py-0.5 rounded-md border border-brand-navy/15">
                              {page.category}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-brand-navy/60">
                          ID de Página: <span className="font-mono text-brand-navy/60">{page.id}</span>
                        </p>

                        {/* Associated Instagram Account Discovery */}
                        <div className="mt-2.5 pt-2.5 border-t border-brand-navy/10">
                          {hasIg ? (
                            <div className="flex items-center gap-2.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-rose-500 text-white shrink-0">
                                <Instagram className="h-3 w-3" />
                              </div>
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-semibold text-brand-ink">
                                  @{page.instagramAccount?.username}
                                </span>
                                {page.instagramAccount?.name && (
                                  <span className="text-brand-navy/60 truncate">
                                    ({page.instagramAccount.name})
                                  </span>
                                )}
                              </div>
                              <span className="ml-auto text-[10px] font-bold text-emerald-600 shrink-0">
                                ✓ IG Profesional detectado
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-[11px] text-brand-navy/60 bg-brand-navy/5 border border-brand-navy/15 px-2.5 py-1.5 rounded-lg">
                              <Instagram className="h-3.5 w-3.5 text-brand-navy/50 shrink-0" />
                              <span>Sin cuenta de Instagram Profesional asociada en Meta Business Suite.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-brand-navy/15 bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-brand-navy/60">
            {selectedPage ? (
              <span>
                Página seleccionada: <strong className="text-brand-ink">{selectedPage.name}</strong>
              </span>
            ) : (
              <span>Selecciona una página para continuar</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto rounded-lg px-4 py-2 text-xs font-semibold text-brand-navy/60 hover:text-brand-ink transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId || isSaving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-5 py-2 text-xs font-bold text-brand-ink transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Vinculando cuentas...</span>
                </>
              ) : (
                <>
                  <span>Confirmar Vinculación Oficial</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
