import React, { useState } from 'react';
import { X, Settings, Check } from 'lucide-react';
import { OutletBranding } from '../types';

interface BrandingModalProps {
  isOpen: boolean;
  onClose: () => void;
  branding: OutletBranding;
  onSaveBranding: (newBranding: OutletBranding) => void;
}

const COLOR_PRESETS = [
  { name: 'Azul Periodístico', hex: '#2563eb' },
  { name: 'Rojo Diario / Alerta', hex: '#dc2626' },
  { name: 'Verde Sustentable', hex: '#059669' },
  { name: 'Ámbar / Ejecutivo', hex: '#d97706' },
  { name: 'Violeta Digital', hex: '#7c3aed' },
  { name: 'Obsidiana Minimal', hex: '#18181b' },
];

export const BrandingModal: React.FC<BrandingModalProps> = ({
  isOpen,
  onClose,
  branding,
  onSaveBranding,
}) => {
  const [name, setName] = useState(branding.name);
  const [accentColor, setAccentColor] = useState(branding.accentColor);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveBranding({
      ...branding,
      name: name.trim() || 'Medio Digital',
      accentColor,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-ink/40 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg rounded-xl border border-brand-navy/15 bg-white p-6 text-brand-ink shadow-raised space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-brand-navy/15">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 border border-blue-200 text-brand-primary-deep">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-brand-ink">Identidad del Medio Digital</h3>
              <p className="text-xs text-brand-navy/60 font-normal">Personaliza el nombre y color de firma de tu medio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-brand-navy/80 font-semibold mb-1.5">
              Nombre del Medio o Periódico:
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Diario Noticias, Infobae, Clarín, Diario Local..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-ink placeholder-brand-navy/40 font-medium focus:border-brand-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-brand-navy/80 font-semibold mb-2">
              Color de Marca Institucional:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setAccentColor(preset.hex)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 transition-all text-left cursor-pointer ${
                    accentColor === preset.hex
                      ? 'border-brand-primary bg-brand-primary-soft text-brand-ink'
                      : 'border-brand-navy/15 bg-brand-navy/5 hover:border-brand-navy/40 text-brand-navy/80'
                  }`}
                >
                  <div
                    className="h-3.5 w-3.5 rounded-full border border-brand-navy/25 shrink-0"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <span className="text-[11px] font-semibold truncate">{preset.name}</span>
                  {accentColor === preset.hex && <Check className="h-3.5 w-3.5 text-brand-primary-deep ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Preview Card */}
          <div className="rounded-lg border border-brand-navy/15 bg-brand-navy/5 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
              <span className="text-xs font-bold text-brand-ink">{name || 'Nombre del Medio'}</span>
            </div>
            <span className="text-[10px] text-brand-navy/60 font-mono font-medium">Firma gráfica</span>
          </div>

          <div className="pt-3 border-t border-brand-navy/15 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-brand-navy/15 bg-brand-navy/5 px-4 py-2 text-xs font-semibold text-brand-navy/80 hover:bg-brand-navy/10 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-brand-primary px-5 py-2 text-xs font-bold text-brand-ink hover:bg-brand-primary-hover transition-colors shadow-md cursor-pointer"
            >
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

