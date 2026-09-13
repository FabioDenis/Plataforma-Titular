import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Download,
  Check,
  RefreshCw,
  Sparkles,
  Zap,
  RotateCcw,
  AlertCircle,
  Upload,
  CheckCircle2,
  Smartphone,
} from 'lucide-react';
import {
  SocialPostsOutput,
  NewsArticleData,
  OutletBranding,
  OrganizationIdentity,
} from '../types';
import {
  HERMES_OFFICIAL_TEMPLATES,
  HermesOfficialTemplate,
  HermesTemplateCustomization,
  HermesCardFormat,
  HERMES_CARD_FORMATS,
} from '../data/hermesOfficialTemplates';
import { HermesCardCanvas } from './HermesCardCanvas';
import { HermesUnifiedEditorControls } from './HermesUnifiedEditorControls';
import { exportCardToExactPng } from '../utils/imageExportHelper';

interface VisualCardPreviewProps {
  posts: SocialPostsOutput;
  article: NewsArticleData;
  branding: OutletBranding;
  activeIdentity?: OrganizationIdentity;
}

export const VisualCardPreview: React.FC<VisualCardPreviewProps> = ({
  posts,
  article,
  branding,
  activeIdentity,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const orgId = activeIdentity?.id || 'default';
  const activeTemplateStorageKey = `hermes_active_official_template_${orgId}`;

  // 1. ACTIVE TEMPLATE & CUSTOMIZATION STATE
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('hermes-editorial');
  const [customization, setCustomization] = useState<HermesTemplateCustomization>(
    HERMES_OFFICIAL_TEMPLATES[0].defaultCustomization
  );

  // 2. ACTIVE FORMAT STATE (Instagram Feed 4:5 by default, Story 9:16, FB Feed 4:5, Square 1:1)
  const [selectedFormat, setSelectedFormat] = useState<HermesCardFormat>('instagram-feed');
  const currentFormatConfig = useMemo(() => {
    return HERMES_CARD_FORMATS.find((f) => f.id === selectedFormat) || HERMES_CARD_FORMATS[0];
  }, [selectedFormat]);

  // Active Control Tab in Sidebar
  const [activeControlTab, setActiveControlTab] = useState<string>('content');

  // 3. EDITABLE TEXTS
  const [customHeadline, setCustomHeadline] = useState<string>(
    posts.feed?.headline || article.title || 'Titular de la Noticia'
  );
  const [customSubtitle, setCustomSubtitle] = useState<string>(
    posts.feed?.subtitle || article.subtitle || ''
  );
  const [customCategory, setCustomCategory] = useState<string>(
    posts.feed?.category || article.category || 'ACTUALIDAD'
  );

  // Sync state when article or posts prop updates from new generation
  useEffect(() => {
    setCustomHeadline(posts.feed?.headline || article.title || 'Titular de la Noticia');
    setCustomSubtitle(posts.feed?.subtitle || article.subtitle || '');
    setCustomCategory(posts.feed?.category || article.category || 'ACTUALIDAD');
  }, [posts, article]);

  // 4. IMAGE & LOGO STATE
  const [customBgImageUrl, setCustomBgImageUrl] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState<number>(100);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);

  // Reset Image Transformations
  const handleResetImageTransform = () => {
    setImageZoom(100);
    setImageOffsetX(0);
    setImageOffsetY(0);
  };

  // Handle Custom Image Upload
  const handleCustomBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setCustomBgImageUrl(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Logo Upload
  const [customLogoUrl, setCustomLogoUrl] = useState<string>(
    activeIdentity?.logoUrl || branding.logoUrl || ''
  );

  const handleCustomLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setCustomLogoUrl(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // 5. LOAD ACTIVE TEMPLATE FROM IDENTITY / STORAGE ON INITIALIZATION
  useEffect(() => {
    try {
      // 1. First check localStorage active template
      const saved = localStorage.getItem(activeTemplateStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.templateId) {
          setSelectedTemplateId(parsed.templateId);
        }
        if (parsed.customization) {
          setCustomization(parsed.customization);
          return;
        }
      }

      // 2. Check active identity in memory
      if (activeIdentity?.activeOfficialTemplateId) {
        setSelectedTemplateId(activeIdentity.activeOfficialTemplateId);
        if (activeIdentity.activeOfficialTemplateCustomization) {
          setCustomization(activeIdentity.activeOfficialTemplateCustomization);
          return;
        }
      }

      // 3. Fallback to default editorial template with brand colors
      const defaultTmpl = HERMES_OFFICIAL_TEMPLATES[0];
      setCustomization({
        ...defaultTmpl.defaultCustomization,
        primaryColor: activeIdentity?.visual?.primaryColor || branding.primaryColor || defaultTmpl.defaultCustomization.primaryColor,
        secondaryColor: activeIdentity?.visual?.secondaryColor || defaultTmpl.defaultCustomization.secondaryColor,
      });
    } catch (err) {
      console.error('Error initializing template configuration in VisualCardPreview:', err);
    }
  }, [orgId, activeTemplateStorageKey, activeIdentity, branding.primaryColor]);

  // Handle template selection in generator
  const handleSelectTemplate = (template: HermesOfficialTemplate) => {
    setSelectedTemplateId(template.id);

    // Check if we have specific saved customization for this template
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

    // Otherwise apply template defaults with media colors
    setCustomization({
      ...template.defaultCustomization,
      primaryColor: activeIdentity?.visual?.primaryColor || branding.primaryColor || template.defaultCustomization.primaryColor,
      secondaryColor: activeIdentity?.visual?.secondaryColor || template.defaultCustomization.secondaryColor,
    });
  };

  // 6. DOWNLOAD / EXPORT PNG LOGIC AT EXACT SELECTED RESOLUTION
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  const handleDownloadPNG = async () => {
    if (!cardRef.current) return;
    setIsDownloading(true);
    setFallbackNotice(null);

    try {
      const targetWidth = currentFormatConfig.width;
      const targetHeight = currentFormatConfig.height;

      const dataUrl = await exportCardToExactPng({
        cardElement: cardRef.current,
        targetWidth,
        targetHeight,
      });

      const mediaNameClean = (activeIdentity?.name || branding.name || 'Noticia').replace(/\s+/g, '-');
      const formatTag = currentFormatConfig.shortName.replace(/\s+/g, '-');
      const link = document.createElement('a');
      link.download = `Hermes-${mediaNameClean}-${formatTag}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
      setFallbackNotice(null);
    } catch (err: any) {
      console.error('Error generating card image:', err);
      setFallbackNotice('Hubo un inconveniente al exportar la imagen. Intenta nuevamente.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Media info
  const mediaName = activeIdentity?.name || branding.name || 'HERMES PUBLICA';
  const mediaLogo = customLogoUrl || activeIdentity?.logoUrl || branding.logoUrl || '';
  const mediaWebsite = activeIdentity?.websiteUrl
    ? activeIdentity.websiteUrl.toUpperCase().replace(/^HTTPS?:\/\//, '').replace(/^WWW\./, '')
    : `${mediaName.toUpperCase().replace(/\s+/g, '')}.COM`;

  const effectiveBgImage =
    customBgImageUrl ||
    article.mainImage ||
    'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80';

  return (
    <div className="mx-auto max-w-6xl rounded-xl border border-brand-navy/15 bg-white p-4 sm:p-6 shadow-card space-y-6 text-brand-ink">
      {/* 1. TOP TOOLBAR & EXPORT BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-navy/15 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-extrabold text-brand-ink flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-primary-deep" />
              Editor Visual de la Publicación
            </h3>
            <span className="rounded-full bg-brand-primary-soft border border-brand-primary/40 px-2.5 py-0.5 text-[10px] font-bold text-brand-navy flex items-center gap-1">
              <Zap className="h-3 w-3 text-brand-primary-deep" />
              Sistema Unificado
            </span>
          </div>
          <p className="text-xs text-brand-navy/80 mt-1 font-normal">
            Ajusta textos, encuadre de imagen, colores y composición. Formatos reales para Instagram y Facebook.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPNG}
            disabled={isDownloading}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-xs font-bold text-brand-ink shadow-none hover:bg-brand-primary-hover transition-all disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {isDownloading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : downloadSuccess ? (
              <Check className="h-4 w-4 text-brand-ink" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>
              {downloadSuccess
                ? '¡Descargado!'
                : `Descargar PNG (${currentFormatConfig.width}x${currentFormatConfig.height})`}
            </span>
          </button>
        </div>
      </div>

      {fallbackNotice && (
        <div className="rounded-lg border border-amber-300 bg-amber-100 p-3.5 text-xs font-medium text-amber-800 shadow-none flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{fallbackNotice}</span>
          </div>
          <button
            onClick={() => setFallbackNotice(null)}
            className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-brand-ink hover:bg-amber-500 transition-colors shrink-0 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* 2. MAIN 2-COLUMN WORKSPACE: CONTROLS (LEFT) + REALTIME CANVAS (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: UNIFIED CONTROLS */}
        <div className="lg:col-span-6 space-y-4">
          <HermesUnifiedEditorControls
            customization={customization}
            onChangeCustomization={setCustomization}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
            selectedFormat={selectedFormat}
            onChangeFormat={setSelectedFormat}
            headline={customHeadline}
            onChangeHeadline={setCustomHeadline}
            subtitle={customSubtitle}
            onChangeSubtitle={setCustomSubtitle}
            category={customCategory}
            onChangeCategory={setCustomCategory}
            imageZoom={imageZoom}
            onChangeImageZoom={setImageZoom}
            imageOffsetX={imageOffsetX}
            onChangeImageOffsetX={setImageOffsetX}
            imageOffsetY={imageOffsetY}
            onChangeImageOffsetY={setImageOffsetY}
            onResetImageTransform={handleResetImageTransform}
            onUploadImage={handleCustomBgUpload}
            onUploadLogo={handleCustomLogoUpload}
            activeControlTab={activeControlTab}
            onChangeControlTab={setActiveControlTab}
            isIdentityMode={false}
          />
        </div>

        {/* RIGHT COLUMN: REALTIME DYNAMIC CANVAS PREVIEW & QUICK FORMAT SWITCHER */}
        <div className="lg:col-span-6 space-y-4 sticky top-6">
          <div className="rounded-xl border border-brand-navy/15 bg-white p-4 shadow-card space-y-3">
            {/* FORMAT SELECTOR PILLS */}
            <div className="space-y-2 pb-2 border-b border-brand-navy/15">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/80 flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-brand-primary-deep" />
                  Formato de Publicación
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
                  Vista Previa en Tiempo Real
                </span>
                <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Esquinas Rectas
                </span>
              </div>
              <span className="text-[10px] font-mono text-brand-navy/60 bg-brand-navy/5 px-2 py-0.5 rounded border border-brand-navy/15">
                {currentFormatConfig.resolutionLabel}
              </span>
            </div>

            {/* REAL PIXEL-PERFECT CARD CANVAS WITH DYNAMIC ASPECT RATIO */}
            <div className="w-full flex items-center justify-center bg-brand-navy/5 p-2 border border-brand-navy/10">
              <div className={`relative w-full ${currentFormatConfig.aspectRatioClass} max-w-[420px] mx-auto rounded-none overflow-hidden border border-brand-navy/15 bg-[#090d16] shadow-none transition-all duration-300`}>
                <HermesCardCanvas
                  containerRef={cardRef}
                  customization={customization}
                  headline={customHeadline}
                  subtitle={customSubtitle}
                  category={customCategory}
                  imageUrl={effectiveBgImage}
                  logoUrl={mediaLogo}
                  mediaName={mediaName}
                  websiteText={mediaWebsite}
                  imageZoom={imageZoom}
                  imageOffsetX={imageOffsetX}
                  imageOffsetY={imageOffsetY}
                  format={selectedFormat}
                />
              </div>
            </div>

            {/* QUICK IMAGE UPLOAD PROMPT IF NO CUSTOM IMAGE */}
            <div className="pt-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary-deep hover:text-brand-primary cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>{customBgImageUrl ? 'Cambiar imagen subida' : 'Subir imagen para la noticia'}</span>
                <input type="file" accept="image/*" onChange={handleCustomBgUpload} className="hidden" />
              </label>

              {customBgImageUrl && (
                <button
                  onClick={() => setCustomBgImageUrl(null)}
                  className="text-[11px] font-medium text-brand-navy/60 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Quitar imagen subida
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

