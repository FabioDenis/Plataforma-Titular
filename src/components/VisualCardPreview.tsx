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
  Instagram,
  Facebook,
  Send,
  ChevronDown,
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
      const dataUrl = await exportCurrentCard();

      if (!dataUrl) {
        setFallbackNotice('Hubo un inconveniente al exportar la imagen. Intenta nuevamente.');
        return;
      }

      const mediaNameClean = (activeIdentity?.name || branding.name || 'Noticia').replace(/\s+/g, '-');
      const formatTag = currentFormatConfig.shortName.replace(/\s+/g, '-');
      const link = document.createElement('a');
      link.download = `Titular-${mediaNameClean}-${formatTag}-${Date.now()}.png`;
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

  // Export the currently rendered card at its exact format resolution. Shared by the
  // download button, the social handoff and the direct publish modal.
  const exportCurrentCard = async (): Promise<string | null> => {
    if (!cardRef.current) return null;

    try {
      return await exportCardToExactPng({
        cardElement: cardRef.current,
        targetWidth: currentFormatConfig.width,
        targetHeight: currentFormatConfig.height,
      });
    } catch (err: any) {
      console.error('Error exporting current card:', err);
      return null;
    }
  };

  // ============================================================
  // SOCIAL HANDOFF (Instagram / Facebook)
  // Desktop: download PNG + copy caption + open the platform.
  // Mobile: native share sheet with the file pre-attached when available.
  // ============================================================
  const [handoffBusy, setHandoffBusy] = useState<'instagram' | 'facebook' | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<
    { platform: 'instagram' | 'facebook'; shared: boolean; imageOk: boolean; captionOk: boolean } | null
  >(null);
  const [handoffWarning, setHandoffWarning] = useState<string | null>(null);
  const [showPublishMenu, setShowPublishMenu] = useState(false);

  const formatLabel =
    selectedFormat === 'instagram-story'
      ? 'Story 9:16'
      : selectedFormat === 'facebook-feed'
        ? 'Feed FB 4:5'
        : selectedFormat === 'square-post'
          ? 'Cuadrado 1:1'
          : 'Feed IG 4:5';

  const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  const handleHandoff = async (platform: 'instagram' | 'facebook') => {
    setHandoffBusy(platform);
    setHandoffWarning(null);
    setHandoffStatus(null);

    const baseCaption =
      (platform === 'instagram' ? posts.instagram?.caption : posts.facebook?.caption) ||
      posts.feed?.headline ||
      article.title ||
      '';
    // The editorial CTA must always close the caption (skip when the AI already appended it).
    const ctaText = activeIdentity?.editorial?.callToAction?.trim();
    const caption = ctaText && !baseCaption.includes(ctaText) ? `${baseCaption}\n\n${ctaText}` : baseCaption;

    const formatTag = currentFormatConfig.shortName.replace(/\s+/g, '-');
    let imageOk = false;
    let captionOk = false;
    let shared = false;

    try {
      const dataUrl = await exportCurrentCard();

      // Mobile: try the native share sheet so the composer opens with the image attached.
      if (dataUrl && isMobileDevice() && typeof navigator.canShare === 'function') {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], `Titular-${platform}-${formatTag}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: caption });
            imageOk = true;
            captionOk = true;
            shared = true;
          }
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') {
            setHandoffBusy(null);
            return; // user closed the share sheet; nothing else to do
          }
          console.warn('[Handoff] Web Share failed, falling back to download:', shareErr);
        }
      }

      // Desktop fallback: download + caption to clipboard + open the platform.
      if (!shared && dataUrl) {
        const link = document.createElement('a');
        link.download = `Titular-${platform}-${formatTag}-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        imageOk = true;
      }

      if (!shared && caption) {
        try {
          await navigator.clipboard.writeText(caption);
          captionOk = true;
        } catch (err) {
          console.warn('[Handoff] Clipboard write failed:', err);
        }
      }

      if (!shared) {
        const targetUrl =
          platform === 'instagram'
            ? isMobileDevice() && selectedFormat === 'instagram-story'
              ? 'instagram://story-camera'
              : 'https://www.instagram.com/'
            : 'https://www.facebook.com/';
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }

      setHandoffStatus({ platform, shared, imageOk, captionOk });
      if (!shared && (!imageOk || !captionOk)) {
        setHandoffWarning(
          !imageOk && !captionOk
            ? 'No se pudo exportar la imagen ni copiar el caption. Usá el botón "Descargar PNG" y copiá el texto manualmente.'
            : !imageOk
              ? 'El caption fue copiado, pero la imagen no se pudo exportar. Usá el botón "Descargar PNG".'
              : 'La imagen fue descargada, pero el caption no se pudo copiar. Cópialo desde la pestaña de la red.'
        );
      }
    } catch (err: any) {
      console.error('[Handoff] Unexpected error:', err);
      setHandoffWarning('Hubo un inconveniente preparando la publicación. Intenta nuevamente.');
    } finally {
      setHandoffBusy(null);
    }
  };

  // Media info
  const mediaName = activeIdentity?.name || branding.name || 'TITULAR';
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

        <div className="relative flex items-center gap-2">
          {/* Single entry point for publishing: menu with the destinations */}
          <button
            onClick={() => setShowPublishMenu((v) => !v)}
            disabled={handoffBusy !== null}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-xs font-bold text-brand-ink shadow-none hover:bg-brand-primary-hover transition-all disabled:opacity-50 cursor-pointer"
          >
            {handoffBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>{handoffBusy ? 'Preparando…' : 'Publicar'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPublishMenu ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={handleDownloadPNG}
            disabled={isDownloading}
            title={`Descargar PNG (${currentFormatConfig.width}x${currentFormatConfig.height})`}
            className="flex items-center justify-center rounded-lg border border-brand-navy/20 bg-white p-2.5 text-brand-navy hover:bg-brand-navy/5 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isDownloading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : downloadSuccess ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>

          {showPublishMenu && (
            <>
              {/* Click-away layer */}
              <div className="fixed inset-0 z-30" onClick={() => setShowPublishMenu(false)} />

              <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-brand-navy/15 bg-white p-2 shadow-xl sm:w-80">
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-brand-navy/50">
                    ¿Dónde publicás?
                  </span>
                  <span className="rounded bg-brand-navy/5 px-2 py-0.5 text-[10px] font-semibold text-brand-navy/70">
                    {formatLabel}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setShowPublishMenu(false);
                    handleHandoff('instagram');
                  }}
                  disabled={handoffBusy !== null}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-fuchsia-50 disabled:opacity-50 cursor-pointer"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-600">
                    <Instagram className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-brand-ink">Instagram</span>
                    <span className="block text-[11px] text-brand-navy/60">
                      Descarga la imagen y abre Instagram con el texto copiado
                    </span>
                  </span>
                  {handoffBusy === 'instagram' && (
                    <RefreshCw className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-brand-navy/50" />
                  )}
                </button>

                <button
                  onClick={() => {
                    setShowPublishMenu(false);
                    handleHandoff('facebook');
                  }}
                  disabled={handoffBusy !== null}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-blue-50 disabled:opacity-50 cursor-pointer"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Facebook className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-brand-ink">Facebook</span>
                    <span className="block text-[11px] text-brand-navy/60">
                      Descarga la imagen y abre Facebook con el texto copiado
                    </span>
                  </span>
                  {handoffBusy === 'facebook' && (
                    <RefreshCw className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-brand-navy/50" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Handoff result feedback */}
      {handoffStatus && !handoffWarning && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {handoffStatus.shared ? (
            <>
              <strong>{handoffStatus.platform === 'instagram' ? 'Instagram' : 'Facebook'}</strong> abrió su editor con la
              imagen ya cargada. Revisá y compartí.
            </>
          ) : (
            <>
              Imagen descargada{handoffStatus.captionOk ? ' y caption copiado' : ''}.{' '}
              <strong>{handoffStatus.platform === 'instagram' ? 'Instagram' : 'Facebook'}</strong> se abrió en una pestaña
              nueva: adjuntá el archivo descargado y pegá el texto (Ctrl+V).
            </>
          )}
        </div>
      )}

      {handoffWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{handoffWarning}</span>
        </div>
      )}

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
                  callToAction={activeIdentity?.editorial?.callToAction}
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

