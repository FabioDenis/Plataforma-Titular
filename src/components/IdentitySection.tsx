import React, { useState, useEffect } from 'react';
import {
  Building2,
  Upload,
  CheckCircle2,
  Palette,
  FileText,
  ShieldCheck,
  Globe,
  Loader2,
  AlertCircle,
  LayoutTemplate,
  Sparkles,
  ExternalLink,
  Instagram,
  AtSign,
} from 'lucide-react';
import {
  OrganizationIdentity,
  OrgType,
  DEFAULT_TRIAL_PUBLICATION_LIMIT,
  CustomMediaTemplate,
} from '../types';
import { useOrganization } from '../hooks/useOrganization';
import { HermesTemplatesGallery } from './HermesTemplatesGallery';

interface IdentitySectionProps {
  currentIdentity?: OrganizationIdentity;
  onUpdateIdentity: (updated: OrganizationIdentity) => void;
  allIdentities?: OrganizationIdentity[];
  onSelectIdentity?: (identity: OrganizationIdentity | string) => void;
  onCreateNewIdentity?: (name: string, orgType: OrgType) => void;

  identities?: OrganizationIdentity[];
  activeIdentityId?: string;
  onCreateIdentity?: (identity: OrganizationIdentity) => void;
  onDeleteIdentity?: (id: string) => void;
}

export const IdentitySection: React.FC<IdentitySectionProps> = ({
  currentIdentity: passedCurrentIdentity,
  onUpdateIdentity,
  allIdentities: passedAllIdentities,
  identities: passedIdentities,
  activeIdentityId,
}) => {
  const { organization, loading, error, updateOrganization } = useOrganization();

  const allIdentities = passedAllIdentities || passedIdentities || [];
  const currentIdentity =
    passedCurrentIdentity ||
    allIdentities.find((i) => i.id === activeIdentityId) ||
    allIdentities[0];

  const [activeTab, setActiveTab] = useState<'profile' | 'logo' | 'visual' | 'editorial' | 'templates'>('profile');
  const [notification, setNotification] = useState<string | null>(null);

  // Custom Templates State
  const [, setCustomTemplates] = useState<CustomMediaTemplate[]>([]);

  // Load custom templates from localStorage
  useEffect(() => {
    const storageKey = `hermes_custom_templates_${organization?.id || currentIdentity?.id || 'default'}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setCustomTemplates(JSON.parse(saved));
      } catch (err) {
        console.error('Error loading custom templates:', err);
      }
    }
  }, [organization?.id, currentIdentity?.id]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-brand-navy/15 bg-white space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <p className="text-xs text-brand-navy/60">
            Cargando información de la organización...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-rose-200 bg-white space-y-3">
          <AlertCircle className="h-6 w-6 text-rose-600" />
          <p className="text-xs text-rose-600">
            No fue posible cargar la organización.
          </p>
        </div>
      </div>
    );
  }

  // Active organization data derived from Firestore if available
  const orgName = organization?.name || currentIdentity.name;
  const logoUrl = organization?.logoUrl || currentIdentity.logoUrl;

  // Logo upload handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const newLogoUrl = event.target?.result as string;
        onUpdateIdentity({
          ...currentIdentity,
          logoUrl: newLogoUrl,
          updatedAt: 'Reciente',
        });
        if (organization?.id) {
          try {
            await updateOrganization({ logoUrl: newLogoUrl });
          } catch (err) {
            console.error('Error actualizando logo en Firestore:', err);
          }
        }
        showToast('Logo oficial actualizado correctamente.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOrgNameChange = async (newName: string) => {
    onUpdateIdentity({
      ...currentIdentity,
      name: newName,
    });
    if (organization?.id) {
      try {
        await updateOrganization({ name: newName });
      } catch (err) {
        console.error('Error actualizando nombre en Firestore:', err);
      }
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-5 text-brand-ink">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-white border border-brand-navy/15 px-3.5 py-2.5 text-xs text-brand-ink shadow-raised animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* HEADER: Organization Profile Banner */}
      <div className="rounded-lg border border-brand-navy/15 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative group shrink-0">
              <div className="h-12 w-12 rounded-lg bg-brand-navy/5 border border-brand-navy/15 flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt={orgName} className="h-full w-full object-contain p-1" />
                ) : (
                  <Building2 className="h-5 w-5 text-brand-primary-deep" />
                )}
              </div>
              <label
                className="absolute inset-0 bg-brand-navy/80 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px] font-semibold text-brand-ink text-center"
                title="Cambiar Logo"
              >
                Cargar
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-brand-ink tracking-tight">{orgName || 'Tu Medio Digital'}</h2>
                <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" />
                  Verificado
                </span>
              </div>
              <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
                Configuración de marca, logotipo, gama cromática y normas de estilo editorial.
              </p>
            </div>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex border-b border-brand-navy/10 gap-1 overflow-x-auto text-xs no-scrollbar pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-brand-primary text-brand-ink font-medium'
                : 'border-transparent text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Configuración</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logo')}
            className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'logo'
                ? 'border-brand-primary text-brand-ink font-medium'
                : 'border-transparent text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Logo e Isotipo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('visual')}
            className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'visual'
                ? 'border-brand-primary text-brand-ink font-medium'
                : 'border-transparent text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <Palette className="h-3.5 w-3.5" />
            <span>Colores y Estilo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('editorial')}
            className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'editorial'
                ? 'border-brand-primary text-brand-ink font-medium'
                : 'border-transparent text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Línea Editorial</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 pb-2 px-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-brand-primary text-brand-ink font-medium'
                : 'border-transparent text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            <span>Plantillas</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ORGANIZATION CONFIGURATION */}
      {activeTab === 'profile' && (
        <div className="rounded-lg border border-brand-navy/15 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="pb-2 border-b border-brand-navy/10">
            <h3 className="text-xs font-semibold text-brand-ink">Datos del Medio</h3>
            <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
              Defina los parámetros de marca y dominio web para personalizar sus publicaciones.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Nombre del Medio:</label>
              <input
                type="text"
                value={orgName}
                placeholder="Nombre de tu medio"
                onChange={(e) => handleOrgNameChange(e.target.value)}
                className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-brand-ink font-normal focus:border-brand-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Dominio Web Oficial:</label>
              <div className="relative">
                <Globe className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-brand-navy/50" />
                <input
                  type="text"
                  value={currentIdentity.websiteUrl || ''}
                  onChange={(e) =>
                    onUpdateIdentity({
                      ...currentIdentity,
                      websiteUrl: e.target.value,
                    })
                  }
                  placeholder="tumedio.com"
                  className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 pl-8 pr-3 py-2 text-brand-ink font-normal focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Usuario de Instagram:</label>
              <div className="relative">
                <AtSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-brand-navy/50" />
                <input
                  type="text"
                  value={currentIdentity.instagramHandle || ''}
                  onChange={(e) =>
                    onUpdateIdentity({
                      ...currentIdentity,
                      instagramHandle: e.target.value,
                    })
                  }
                  placeholder="@tumedio"
                  className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 pl-8 pr-3 py-2 text-brand-ink font-normal focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LOGO & BRANDING ASSETS */}
      {activeTab === 'logo' && (
        <div className="rounded-lg border border-brand-navy/15 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="pb-2 border-b border-brand-navy/10">
            <h3 className="text-xs font-semibold text-brand-ink">Logo e Isotipo Oficial</h3>
            <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
              El logotipo cargado se insertará automáticamente en las placas generadas.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="h-20 w-20 rounded-lg bg-brand-navy/5 border border-brand-navy/15 flex items-center justify-center p-2 shrink-0">
              {currentIdentity.logoUrl ? (
                <img src={currentIdentity.logoUrl} alt={currentIdentity.name} className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-7 w-7 text-brand-navy/50" />
              )}
            </div>

            <div className="space-y-2 text-center sm:text-left">
              <label className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-3.5 py-2 text-xs font-medium text-brand-ink cursor-pointer hover:bg-brand-primary-hover transition-colors shadow-xs">
                <Upload className="h-3.5 w-3.5" />
                <span>Cargar Logotipo Oficial (PNG / SVG)</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              <p className="text-xs text-brand-navy/60 leading-relaxed font-normal">
                Recomendación: Archivo en formato PNG con fondo transparente en alta definición.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COLORS & VISUAL STYLE */}
      {activeTab === 'visual' && (
        <div className="rounded-lg border border-brand-navy/15 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="pb-2 border-b border-brand-navy/10">
            <h3 className="text-xs font-semibold text-brand-ink">Paleta de Colores y Tipografía</h3>
            <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
              Ajuste los colores institucionales y tipografías asignadas a su organización.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Color Primario:</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={currentIdentity.visual.primaryColor}
                  onChange={(e) =>
                    onUpdateIdentity({
                      ...currentIdentity,
                      visual: { ...currentIdentity.visual, primaryColor: e.target.value },
                    })
                  }
                  className="h-8 w-10 rounded bg-transparent cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={currentIdentity.visual.primaryColor}
                  onChange={(e) =>
                    onUpdateIdentity({
                      ...currentIdentity,
                      visual: { ...currentIdentity.visual, primaryColor: e.target.value },
                    })
                  }
                  className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-brand-ink font-mono focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Familia Tipográfica:</label>
              <select
                value={currentIdentity.visual.fontFamily}
                onChange={(e) =>
                  onUpdateIdentity({
                    ...currentIdentity,
                    visual: { ...currentIdentity.visual, fontFamily: e.target.value },
                  })
                }
                className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-brand-ink font-normal focus:border-brand-primary focus:outline-none"
              >
                <option value="Montserrat, sans-serif">Montserrat (Corporativo / Editorial)</option>
                <option value="Plus Jakarta Sans, sans-serif">Plus Jakarta Sans (Moderno / Limpio)</option>
                <option value="Inter, sans-serif">Inter (Institucional neutral)</option>
                <option value="Playfair Display, serif">Playfair Display (Serif Elegante)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EDITORIAL GUIDELINES */}
      {activeTab === 'editorial' && (
        <div className="rounded-lg border border-brand-navy/15 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="pb-2 border-b border-brand-navy/10">
            <h3 className="text-xs font-semibold text-brand-ink">Línea Editorial</h3>
            <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
              Instrucciones principales para la generación automática de epígrafes y llamadas a la acción.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Nivel de Formalidad:</label>
              <select
                value={currentIdentity.editorial.formalityLevel}
                onChange={(e) =>
                  onUpdateIdentity({
                    ...currentIdentity,
                    editorial: { ...currentIdentity.editorial, formalityLevel: e.target.value },
                  })
                }
                className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-brand-ink font-normal focus:border-brand-primary focus:outline-none"
              >
                <option value="Alta">Alta (Informativo Institucional)</option>
                <option value="Media">Media (Divulgación General)</option>
                <option value="Informal">Informal (Comunicación Cercana)</option>
              </select>
            </div>

            <div>
              <label className="block text-brand-navy/80 font-medium mb-1">Llamado a la Acción (CTA):</label>
              <input
                type="text"
                value={currentIdentity.editorial.callToAction}
                onChange={(e) =>
                  onUpdateIdentity({
                    ...currentIdentity,
                    editorial: { ...currentIdentity.editorial, callToAction: e.target.value },
                  })
                }
                placeholder="Lee la nota completa en nuestro sitio web"
                className="w-full rounded-md border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-brand-ink font-normal focus:border-brand-primary focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: HERMES OFFICIAL TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <HermesTemplatesGallery
            currentIdentity={currentIdentity}
            onUpdateIdentity={(updated) => {
              onUpdateIdentity(updated);
            }}
            showToast={(msg) => showToast(msg)}
          />
        </div>
      )}
    </div>
  );
};


