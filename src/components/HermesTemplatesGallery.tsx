import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  LayoutTemplate,
  RotateCcw,
  Smartphone,
} from 'lucide-react';
import {
  HermesOfficialTemplate,
  HermesTemplateCustomization,
  HERMES_OFFICIAL_TEMPLATES,
  HermesCardFormat,
  HERMES_CARD_FORMATS,
} from '../data/hermesOfficialTemplates';
import { OrganizationIdentity } from '../types';
import { useOrganization } from '../hooks/useOrganization';
import { HermesCardCanvas } from './HermesCardCanvas';
import { HermesUnifiedEditorControls } from './HermesUnifiedEditorControls';

interface HermesTemplatesGalleryProps {
  currentIdentity: OrganizationIdentity;
  onUpdateIdentity: (updated: OrganizationIdentity) => void;
  showToast: (msg: string) => void;
}

export const HermesTemplatesGallery: React.FC<HermesTemplatesGalleryProps> = ({
  currentIdentity,
  onUpdateIdentity,
  showToast,
}) => {
  const { organization, updateOrganization } = useOrganization();
  const orgId = organization?.id || currentIdentity?.id || 'default';
  const storageKey = `hermes_active_official_template_${orgId}`;

  // Active Template ID stored in settings or fallback to 'hermes-editorial'
  const [activeTemplateId, setActiveTemplateId] = useState<string>('hermes-editorial');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('hermes-editorial');

  // Customization state for current selected template
  const [customization, setCustomization] = useState<HermesTemplateCustomization>(
    HERMES_OFFICIAL_TEMPLATES[0].defaultCustomization
  );

  // Active format for previewing
  const [selectedFormat, setSelectedFormat] = useState<HermesCardFormat>('instagram-feed');
  const currentFormatConfig = useMemo(() => {
    return HERMES_CARD_FORMATS.find((f) => f.id === selectedFormat) || HERMES_CARD_FORMATS[0];
  }, [selectedFormat]);

  // Active sub-tab in customization controls
  const [activeControlTab, setActiveControlTab] = useState<string>('templates');

  // Sample headline and subtitle for preview
  const [sampleHeadline, setSampleHeadline] = useState<string>(
    'Gobierno nacional presentó los lineamientos estratégicos para el presupuesto anual'
  );
  const [sampleSubtitle, setSampleSubtitle] = useState<string>(
    'La iniciativa contempla acuerdos federales, incentivos a la inversión y modernización tecnológica.'
  );
  const [sampleCategory, setSampleCategory] = useState<string>('ACTUALIDAD');

  // Custom preview image (if user uploads one to test)
  const [customPreviewImage, setCustomPreviewImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState<number>(100);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);

  // Load saved active template & customizations on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.templateId) {
          setActiveTemplateId(parsed.templateId);
          setSelectedTemplateId(parsed.templateId);
        }
        if (parsed.customization) {
          setCustomization(parsed.customization);
        }
      } else if (currentIdentity?.activeOfficialTemplateId) {
        setActiveTemplateId(currentIdentity.activeOfficialTemplateId);
        setSelectedTemplateId(currentIdentity.activeOfficialTemplateId);
        if (currentIdentity.activeOfficialTemplateCustomization) {
          setCustomization(currentIdentity.activeOfficialTemplateCustomization);
        }
      } else {
        // Use branding default if available
        const defaultTmpl = HERMES_OFFICIAL_TEMPLATES[0];
        setCustomization({
          ...defaultTmpl.defaultCustomization,
          primaryColor: currentIdentity?.visual?.primaryColor || defaultTmpl.defaultCustomization.primaryColor,
          secondaryColor: currentIdentity?.visual?.secondaryColor || defaultTmpl.defaultCustomization.secondaryColor,
        });
      }
    } catch (e) {
      console.error('Error loading active official template:', e);
    }
  }, [orgId, storageKey, currentIdentity]);

  // When switching selected template, update customization state
  const handleSelectTemplate = (template: HermesOfficialTemplate) => {
    setSelectedTemplateId(template.id);

    // Update sample headline adapted to template
    if (template.id === 'hermes-breaking') {
      setSampleHeadline('ÚLTIMA HORA: Anuncian paquete integral de medidas para el sector productivo');
      setSampleCategory('URGENTE');
    } else if (template.id === 'hermes-magazine') {
      setSampleHeadline('El futuro de la innovación sostenible y su impacto en las ciudades modernas');
      setSampleCategory('ESPECIALES');
    } else if (template.id === 'hermes-minimal') {
      setSampleHeadline('Tendencias que transforman la economía global en el nuevo ciclo');
      setSampleCategory('ECONOMÍA');
    } else {
      setSampleHeadline('Gobierno nacional presentó los lineamientos estratégicos para el presupuesto anual');
      setSampleCategory('ACTUALIDAD');
    }

    // Check if we have saved customization for this template
    const templateSpecificKey = `hermes_tmpl_custom_${orgId}_${template.id}`;
    const savedSpecific = localStorage.getItem(templateSpecificKey);

    if (savedSpecific) {
      try {
        setCustomization(JSON.parse(savedSpecific));
        return;
      } catch (err) {
        console.error('Error loading specific template customization:', err);
      }
    }

    // Otherwise apply default with media brand colors
    setCustomization({
      ...template.defaultCustomization,
      primaryColor: currentIdentity?.visual?.primaryColor || template.defaultCustomization.primaryColor,
      secondaryColor: currentIdentity?.visual?.secondaryColor || template.defaultCustomization.secondaryColor,
    });
  };

  // Save current template as ACTIVE template
  const handleSaveActiveTemplate = async () => {
    const selectedTemplate =
      HERMES_OFFICIAL_TEMPLATES.find((t) => t.id === selectedTemplateId) || HERMES_OFFICIAL_TEMPLATES[0];

    setActiveTemplateId(selectedTemplateId);

    // 1. Save to localStorage
    const payload = {
      templateId: selectedTemplateId,
      templateName: selectedTemplate.name,
      customization,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));

    // Also save template specific customization
    localStorage.setItem(`hermes_tmpl_custom_${orgId}_${selectedTemplateId}`, JSON.stringify(customization));

    // 2. Update current identity in state & parent
    const updatedIdentity: OrganizationIdentity = {
      ...currentIdentity,
      activeOfficialTemplateId: selectedTemplateId,
      activeOfficialTemplateName: selectedTemplate.name,
      activeOfficialTemplateCustomization: customization,
      visual: {
        ...currentIdentity.visual,
        primaryColor: customization.primaryColor,
        secondaryColor: customization.secondaryColor,
        borderRadiusPx: 0,
        borderStyle: 'none',
        shadowStyle: 'none',
      },
    };

    onUpdateIdentity(updatedIdentity);

    // 3. Update organization in hook
    if (organization) {
      updateOrganization({
        activeOfficialTemplateId: selectedTemplateId,
        activeOfficialTemplateName: selectedTemplate.name,
        activeOfficialTemplateCustomization: customization,
      });
    }

    showToast(`✅ Plantilla "${selectedTemplate.name}" guardada y activada para tu medio.`);
  };

  // Reset current customization to official defaults
  const handleResetToDefaults = () => {
    const tpl = HERMES_OFFICIAL_TEMPLATES.find((t) => t.id === selectedTemplateId) || HERMES_OFFICIAL_TEMPLATES[0];
    setCustomization(tpl.defaultCustomization);
    showToast(`Valores restablecidos al diseño oficial de "${tpl.name}".`);
  };

  // Handle preview image upload
  const handleUploadPreviewImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setCustomPreviewImage(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle logo upload
  const handleUploadLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const logoData = reader.result as string;
          const updatedIdentity: OrganizationIdentity = {
            ...currentIdentity,
            logoUrl: logoData,
          };
          onUpdateIdentity(updatedIdentity);
          showToast('Logotipo actualizado.');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const selectedTemplate = useMemo(() => {
    return HERMES_OFFICIAL_TEMPLATES.find((t) => t.id === selectedTemplateId) || HERMES_OFFICIAL_TEMPLATES[0];
  }, [selectedTemplateId]);

  const isCurrentActive = activeTemplateId === selectedTemplateId;

  // Selected preview background based on template
  const defaultSampleImage = useMemo(() => {
    if (customPreviewImage) return customPreviewImage;
    if (selectedTemplate.id === 'hermes-editorial') {
      return 'url("https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1000&q=80")';
    }
    if (selectedTemplate.id === 'hermes-breaking') {
      return 'url("https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1000&q=80")';
    }
    if (selectedTemplate.id === 'hermes-minimal') {
      return 'url("https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1000&q=80")';
    }
    return 'url("https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1000&q=80")';
  }, [selectedTemplate.id, customPreviewImage]);

  const effectiveImageUrl = customPreviewImage || (
    selectedTemplate.id === 'hermes-editorial'
      ? 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1000&q=80'
      : selectedTemplate.id === 'hermes-breaking'
      ? 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1000&q=80'
      : selectedTemplate.id === 'hermes-minimal'
      ? 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1000&q=80'
      : 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=1000&q=80'
  );

  const mediaLogo = currentIdentity?.logoUrl || '';
  const mediaName = currentIdentity?.name || 'TITULAR';
  const mediaWebsite = currentIdentity?.websiteUrl
    ? currentIdentity.websiteUrl.toUpperCase().replace(/^HTTPS?:\/\//, '').replace(/^WWW\./, '')
    : `${mediaName.toUpperCase().replace(/\s+/g, '')}.COM`;

  return (
    <div className="space-y-6">
      {/* HEADER EXPLANATION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-brand-navy/15 bg-white p-4 shadow-card">
        <div>
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-primary-deep" />
            <h3 className="text-sm font-bold text-brand-ink uppercase tracking-wider">
              Plantillas Oficiales de Titular
            </h3>
            <span className="rounded-full bg-brand-primary-soft px-2 py-0.5 text-[10px] font-mono font-bold text-brand-navy border border-brand-primary/40">
              Sistema Unificado
            </span>
          </div>
          <p className="mt-1 text-xs text-brand-navy/80">
            Personaliza tipografías, colores, logo y composición. Los cambios se aplicarán automáticamente a cada publicación generada.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetToDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-navy/80 hover:text-brand-ink bg-brand-navy/5 border border-brand-navy/15 rounded-md hover:bg-brand-navy/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restablecer Diseño</span>
          </button>
        </div>
      </div>

      {/* 2-COLUMN LAYOUT: UNIFIED EDITOR CONTROLS (LEFT) + REALTIME CARD PREVIEW (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: UNIFIED EDITOR CONTROLS */}
        <div className="lg:col-span-6 space-y-4">
          <HermesUnifiedEditorControls
            customization={customization}
            onChangeCustomization={setCustomization}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
            selectedFormat={selectedFormat}
            onChangeFormat={setSelectedFormat}
            headline={sampleHeadline}
            onChangeHeadline={setSampleHeadline}
            subtitle={sampleSubtitle}
            onChangeSubtitle={setSampleSubtitle}
            category={sampleCategory}
            onChangeCategory={setSampleCategory}
            imageZoom={imageZoom}
            onChangeImageZoom={setImageZoom}
            imageOffsetX={imageOffsetX}
            onChangeImageOffsetX={setImageOffsetX}
            imageOffsetY={imageOffsetY}
            onChangeImageOffsetY={setImageOffsetY}
            onResetImageTransform={() => {
              setImageZoom(100);
              setImageOffsetX(0);
              setImageOffsetY(0);
            }}
            onUploadImage={handleUploadPreviewImage}
            onUploadLogo={handleUploadLogo}
            activeControlTab={activeControlTab}
            onChangeControlTab={setActiveControlTab}
            isIdentityMode={true}
          />
        </div>

        {/* RIGHT COLUMN: REALTIME ADAPTIVE CARD PREVIEW */}
        <div className="lg:col-span-6 space-y-4 sticky top-6">
          <div className="rounded-xl border border-brand-navy/15 bg-white p-4 shadow-card space-y-3">
            {/* FORMAT SELECTOR PILLS */}
            <div className="space-y-2 pb-2 border-b border-brand-navy/15">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/80 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-brand-primary-deep" />
                  Formato de Prueba
                </span>
                <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {currentFormatConfig.ratioLabel} • {currentFormatConfig.resolutionLabel}
                </span>
              </div>

              {/* QUICK FORMAT BUTTONS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {HERMES_CARD_FORMATS.map((fmt) => {
                  const isSelected = selectedFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all flex flex-col items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'bg-brand-primary text-brand-ink shadow-none ring-1 ring-brand-primary/60'
                          : 'bg-brand-navy/5 text-brand-navy/80 border border-brand-navy/15 hover:bg-brand-navy/10 hover:text-brand-ink'
                      }`}
                    >
                      <span className="truncate w-full text-center">{fmt.shortName}</span>
                      <span className={`text-[9px] font-mono opacity-80 ${isSelected ? 'text-brand-ink/70' : 'text-brand-navy/60'}`}>
                        {fmt.ratioLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-ink">
                  Vista Previa en Vivo
                </span>
                <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Esquinas Rectas
                </span>
              </div>
              <span className="text-[10px] font-mono text-brand-navy/60 bg-brand-navy/5 px-2 py-0.5 rounded border border-brand-navy/15">
                {currentFormatConfig.resolutionLabel}
              </span>
            </div>

            {/* REAL VISUAL CARD CANVAS (Dynamic Aspect Ratio) */}
            <div className="w-full flex items-center justify-center bg-brand-navy/5 p-2 border border-brand-navy/10">
              <div className={`relative w-full ${currentFormatConfig.aspectRatioClass} max-w-[420px] mx-auto rounded-none overflow-hidden border border-brand-navy/15 bg-[#090d16] shadow-none transition-all duration-300`}>
                <HermesCardCanvas
                  customization={customization}
                  headline={sampleHeadline}
                  subtitle={sampleSubtitle}
                  category={sampleCategory}
                  imageUrl={effectiveImageUrl}
                  logoUrl={mediaLogo}
                  mediaName={mediaName}
                  websiteText={mediaWebsite}
                  callToAction={currentIdentity.editorial?.callToAction}
                  imageZoom={imageZoom}
                  imageOffsetX={imageOffsetX}
                  imageOffsetY={imageOffsetY}
                  format={selectedFormat}
                />
              </div>
            </div>
          </div>

          {/* ACTION BUTTON: USAR ESTA PLANTILLA */}
          <div className="rounded-xl border border-brand-navy/15 bg-white p-4 shadow-card space-y-3">
            <button
              onClick={handleSaveActiveTemplate}
              className={`w-full py-3 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isCurrentActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-brand-ink ring-1 ring-emerald-400'
                  : 'bg-brand-primary hover:bg-brand-primary-hover text-brand-ink'
              }`}
            >
              {isCurrentActive ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-brand-ink" />
                  <span>Plantilla Activa (Guardar Configuración)</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-brand-ink" />
                  <span>Activar y usar esta plantilla</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-brand-navy/60 font-normal">
              {isCurrentActive
                ? '✅ Esta plantilla está activa para todas las nuevas publicaciones de tu medio.'
                : 'Al hacer clic, esta plantilla se aplicará automáticamente al generar nuevas publicaciones.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
