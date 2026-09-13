import React from 'react';
import {
  HermesTemplateCustomization,
  HermesCardFormat,
  HERMES_CARD_FORMATS,
} from '../data/hermesOfficialTemplates';

export interface HermesCardCanvasProps {
  customization: HermesTemplateCustomization;
  headline: string;
  subtitle?: string;
  category?: string;
  imageUrl?: string;
  logoUrl?: string;
  mediaName?: string;
  websiteText?: string;
  imageZoom?: number; // 100 to 300
  imageOffsetX?: number; // percentage or px
  imageOffsetY?: number; // percentage or px
  containerRef?: React.RefObject<HTMLDivElement>;
  isExporting?: boolean;
  format?: HermesCardFormat;
}

export const HermesCardCanvas: React.FC<HermesCardCanvasProps> = ({
  customization,
  headline,
  subtitle,
  category,
  imageUrl,
  logoUrl,
  mediaName = 'HERMES PUBLICA',
  websiteText,
  imageZoom = 100,
  imageOffsetX = 0,
  imageOffsetY = 0,
  containerRef,
  isExporting = false,
  format = 'instagram-feed',
}) => {
  const isStory = format === 'instagram-story';
  const isSquare = format === 'square-post';
  const aspectClass = isStory ? 'aspect-[9/16]' : isSquare ? 'aspect-square' : 'aspect-[4/5]';
  // Helper for font size mapping
  const getTitleFontSize = () => {
    switch (customization.titleSize) {
      case 'small':
        return 'clamp(18px, 3.8cqi, 22px)';
      case 'medium':
        return 'clamp(21px, 4.5cqi, 26px)';
      case 'large':
        return 'clamp(24px, 5.2cqi, 31px)';
      case 'xlarge':
        return 'clamp(28px, 6.0cqi, 36px)';
      default:
        return 'clamp(24px, 5.2cqi, 31px)';
    }
  };

  const getTitleFontWeight = () => {
    switch (customization.titleWeight) {
      case 'normal':
        return '400';
      case 'semibold':
        return '600';
      case 'bold':
        return '700';
      case 'extrabold':
        return '800';
      case 'black':
        return '900';
      default:
        return '800';
    }
  };

  const getSubtitleFontSize = () => {
    switch (customization.subtitleSize) {
      case 'small':
        return 'clamp(11px, 2.2cqi, 13px)';
      case 'large':
        return 'clamp(14px, 2.8cqi, 16px)';
      case 'medium':
      default:
        return 'clamp(12px, 2.5cqi, 14px)';
    }
  };

  const getSubtitleFontWeight = () => {
    switch (customization.subtitleWeight) {
      case 'bold':
        return '700';
      case 'semibold':
        return '600';
      case 'normal':
      default:
        return '400';
    }
  };

  const getCategoryFontSize = () => {
    switch (customization.categorySize) {
      case 'small':
        return 'clamp(9px, 1.8cqi, 11px)';
      case 'large':
        return 'clamp(12px, 2.4cqi, 14px)';
      case 'medium':
      default:
        return 'clamp(10px, 2.0cqi, 12px)';
    }
  };

  const getCategoryFontWeight = () => {
    switch (customization.categoryWeight) {
      case 'normal':
        return '500';
      case 'semibold':
        return '600';
      case 'extrabold':
        return '800';
      case 'bold':
      default:
        return '700';
    }
  };

  const getLogoHeightPx = () => {
    switch (customization.logoSize) {
      case 'small':
        return 38;
      case 'large':
        return 72;
      case 'xlarge':
        return 96;
      case 'medium':
      default:
        return 52;
    }
  };

  // Overlay background CSS generator
  const getOverlayBackground = () => {
    const alpha = Math.min(1, Math.max(0, (customization.overlayIntensity ?? 80) / 100));
    const tone = customization.overlayTone || 'black';
    let baseRgb = '0, 0, 0';
    if (tone === 'blue') baseRgb = '15, 23, 42';
    if (tone === 'red') baseRgb = '45, 10, 10';
    if (tone === 'custom' && customization.customOverlayColor) {
      // Return solid translucent with custom color
      return customization.customOverlayColor;
    }

    switch (customization.overlayStyle) {
      case 'gradient-dark':
        return `linear-gradient(to top, rgba(${baseRgb}, ${alpha}) 0%, rgba(${baseRgb}, ${alpha * 0.8}) 45%, rgba(${baseRgb}, ${alpha * 0.4}) 100%)`;
      case 'soft':
        return `linear-gradient(to top, rgba(${baseRgb}, ${alpha * 0.9}) 0%, rgba(${baseRgb}, ${alpha * 0.5}) 50%, rgba(${baseRgb}, 0.1) 100%)`;
      case 'vignette':
        return `radial-gradient(circle at center, rgba(${baseRgb}, ${alpha * 0.3}) 0%, rgba(${baseRgb}, ${alpha * 0.95}) 100%)`;
      case 'solid-translucent':
        return `rgba(${baseRgb}, ${alpha * 0.85})`;
      case 'none':
        return 'transparent';
      case 'gradient-bottom':
      default:
        return `linear-gradient(to top, rgba(${baseRgb}, ${alpha}) 0%, rgba(${baseRgb}, ${alpha * 0.85}) 35%, rgba(${baseRgb}, ${alpha * 0.3}) 65%, transparent 100%)`;
    }
  };

  // Panel background CSS
  const getPanelBackground = () => {
    const opacity = (customization.panelOpacity ?? 90) / 100;
    const bgType = customization.panelBackgroundType || 'translucent';

    if (bgType === 'solid') {
      return customization.secondaryColor || '#090d16';
    }
    if (bgType === 'gradient') {
      return `linear-gradient(to top, ${customization.secondaryColor || '#090d16'}, transparent)`;
    }
    if (bgType === 'translucent') {
      // Convert hex to rgba
      const hex = (customization.secondaryColor || '#090d16').replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      }
      return `rgba(9, 13, 22, ${opacity})`;
    }
    return 'transparent';
  };

  // Effective title and subtitle colors
  const effectiveTitleColor = customization.titleColor || '#ffffff';
  const effectiveSubtitleColor = customization.subtitleColor || '#e2e8f0';
  const effectiveCategoryColor = customization.categoryColor || '#ffffff';
  const effectiveLineColor = customization.lineColor || customization.primaryColor || '#2563eb';

  // Title, Subtitle, Category alignments
  const titleAlign = customization.titleAlign || customization.textAlign || 'left';
  const subtitleAlign = customization.subtitleAlign || customization.textAlign || 'left';
  const categoryAlign = customization.categoryAlign || customization.textAlign || 'left';

  // Fallback image if none provided
  const effectiveImage = imageUrl || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80';

  // Calculate image transform (Zoom + Pan)
  // Ensure image fully covers canvas (object-fit: cover behavior with dynamic translation)
  const scaleValue = Math.max(1, imageZoom / 100);
  const transformStyle: React.CSSProperties = {
    transform: `scale(${scaleValue}) translate(${imageOffsetX / scaleValue}px, ${imageOffsetY / scaleValue}px)`,
    transformOrigin: 'center center',
  };

  // Content alignment class (bottom, center, full)
  const contentPlacementClass =
    customization.contentPosition === 'center'
      ? 'justify-center'
      : customization.contentPosition === 'full'
      ? 'justify-between'
      : 'justify-end';

  return (
    <div
      ref={containerRef}
      id="hermes-card-canvas"
      className={`relative w-full ${aspectClass} overflow-hidden bg-[#090d16] flex flex-col justify-between select-none rounded-none shadow-none transition-all duration-300`}
      style={{
        fontFamily: customization.fontFamily,
        boxShadow: 'none',
        borderRadius: 0,
      }}
    >
      {/* 1. LAYER: BACKGROUND IMAGE (Always 100% cover, no black bars) */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none rounded-none">
        <img
          src={effectiveImage}
          alt={headline}
          crossOrigin="anonymous"
          className="w-full h-full object-cover rounded-none transition-transform duration-100 ease-out"
          style={transformStyle}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (
              !target.dataset.triedProxy &&
              effectiveImage &&
              !effectiveImage.startsWith('data:') &&
              !effectiveImage.startsWith('/api/proxy-image')
            ) {
              target.dataset.triedProxy = 'true';
              target.src = `/api/proxy-image?url=${encodeURIComponent(effectiveImage)}`;
            } else {
              target.src =
                'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80';
            }
          }}
        />
      </div>

      {/* 2. LAYER: DYNAMIC OVERLAY (Gradient/Solid/Vignette) */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none rounded-none transition-all duration-200"
        style={{
          background: getOverlayBackground(),
          boxShadow: 'none',
        }}
      />

      {/* 3. LAYER: TOP BAR (Logo Top-Left, Logo Top-Right, Category Top) */}
      <div className={`relative z-20 w-full ${isStory ? 'p-5 sm:p-6 pt-7 sm:pt-9' : 'p-4 sm:p-5'} flex items-start justify-between`}>
        {/* LOGO TOP LEFT */}
        {customization.showLogo !== false && customization.logoPosition === 'top-left' && (
          <div
            className="flex items-center"
            style={{ opacity: (customization.logoOpacity ?? 100) / 100 }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={mediaName}
                crossOrigin="anonymous"
                className="object-contain rounded-none"
                style={{ height: `${getLogoHeightPx()}px`, maxWidth: '160px' }}
              />
            ) : (
              <div className="px-2.5 py-1 bg-black/90 border border-white/20 text-white font-mono font-bold text-[11px] rounded-none">
                {mediaName}
              </div>
            )}
          </div>
        )}

        {/* TOP CATEGORY BADGE (If upper-tag or standard top category) */}
        {customization.showCategory && customization.categoryStyle === 'upper-tag' && (
          <div
            className={`flex ${
              categoryAlign === 'center'
                ? 'mx-auto'
                : categoryAlign === 'right'
                ? 'ml-auto'
                : ''
            }`}
          >
            <span
              className="px-3 py-1 text-white uppercase tracking-wider font-mono rounded-none"
              style={{
                backgroundColor: customization.primaryColor,
                fontSize: getCategoryFontSize(),
                fontWeight: getCategoryFontWeight(),
              }}
            >
              {category || 'NOTICIA'}
            </span>
          </div>
        )}

        {/* LOGO TOP RIGHT */}
        {customization.showLogo !== false && customization.logoPosition === 'top-right' && (
          <div
            className="flex items-center ml-auto"
            style={{ opacity: (customization.logoOpacity ?? 100) / 100 }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={mediaName}
                crossOrigin="anonymous"
                className="object-contain rounded-none"
                style={{ height: `${getLogoHeightPx()}px`, maxWidth: '160px' }}
              />
            ) : (
              <div className="px-2.5 py-1 bg-black/90 border border-white/20 text-white font-mono font-bold text-[11px] rounded-none">
                {mediaName}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. LAYER: EDITORIAL CONTENT PANEL */}
      <div className={`relative z-20 w-full flex flex-col ${contentPlacementClass}`}>
        <div
          className="w-full flex flex-col space-y-2.5 sm:space-y-3 transition-all rounded-none"
          style={{
            padding: `${isStory ? (customization.panelPadding ? Math.round(customization.panelPadding * 1.15) : 28) : (customization.panelPadding ?? 24)}px`,
            background: getPanelBackground(),
            borderRadius: 0,
            boxShadow: 'none',
          }}
        >
          {/* LOGO IN STACK IF SELECTED */}
          {customization.showLogo !== false && customization.logoPosition === 'stack' && (
            <div
              className={`flex items-center mb-1 ${
                titleAlign === 'center' ? 'justify-center' : titleAlign === 'right' ? 'justify-end' : 'justify-start'
              }`}
              style={{ opacity: (customization.logoOpacity ?? 100) / 100 }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={mediaName}
                  crossOrigin="anonymous"
                  className="object-contain rounded-none"
                  style={{ height: `${getLogoHeightPx()}px`, maxWidth: '160px' }}
                />
              ) : (
                <span className="text-[11px] font-mono font-bold text-white/90 uppercase tracking-wider">
                  {mediaName}
                </span>
              )}
            </div>
          )}

          {/* CATEGORY (BADGE, UNDERLINE, SIMPLE) */}
          {customization.showCategory && customization.categoryStyle !== 'upper-tag' && (
            <div
              className={`flex items-center ${
                categoryAlign === 'center'
                  ? 'justify-center'
                  : categoryAlign === 'right'
                  ? 'justify-end'
                  : 'justify-start'
              }`}
            >
              {customization.categoryStyle === 'badge' && (
                <span
                  className="px-3 py-1 text-white uppercase tracking-wider rounded-none"
                  style={{
                    backgroundColor: customization.primaryColor,
                    fontSize: getCategoryFontSize(),
                    fontWeight: getCategoryFontWeight(),
                  }}
                >
                  {category || 'ACTUALIDAD'}
                </span>
              )}

              {customization.categoryStyle === 'underline' && (
                <span
                  className="uppercase tracking-wider pb-1 border-b-2 font-mono"
                  style={{
                    color: effectiveCategoryColor,
                    borderColor: customization.primaryColor,
                    fontSize: getCategoryFontSize(),
                    fontWeight: getCategoryFontWeight(),
                  }}
                >
                  {category || 'ACTUALIDAD'}
                </span>
              )}

              {customization.categoryStyle === 'simple' && (
                <span
                  className="uppercase tracking-wider font-mono"
                  style={{
                    color: effectiveCategoryColor,
                    fontSize: getCategoryFontSize(),
                    fontWeight: getCategoryFontWeight(),
                  }}
                >
                  {category || 'ACTUALIDAD'}
                </span>
              )}
            </div>
          )}

          {/* DECORATIVE DIVIDER LINE */}
          {customization.showDividerLine && (
            <div
              className={`transition-all rounded-none ${
                titleAlign === 'center'
                  ? 'mx-auto'
                  : titleAlign === 'right'
                  ? 'ml-auto'
                  : ''
              }`}
              style={{
                height: `${customization.dividerLineThickness ?? 3}px`,
                width: '48px',
                backgroundColor: effectiveLineColor,
                borderRadius: 0,
              }}
            />
          )}

          {/* HEADLINE / TITULAR */}
          <h2
            className={`leading-[1.18] tracking-tight transition-all rounded-none ${isStory ? 'line-clamp-4' : 'line-clamp-3'}`}
            style={{
              fontFamily: customization.fontFamily,
              fontWeight: getTitleFontWeight(),
              fontSize: getTitleFontSize(),
              color: effectiveTitleColor,
              textAlign: titleAlign,
              textShadow: 'none',
            }}
          >
            {headline}
          </h2>

          {/* SUBTITLE / BAJADA */}
          {customization.showSubtitle && subtitle && (
            <p
              className={`leading-snug transition-all rounded-none ${isStory ? 'line-clamp-3' : 'line-clamp-2'} ${
                customization.subtitleStyle === 'italic'
                  ? 'italic'
                  : customization.subtitleStyle === 'highlight'
                  ? 'bg-black/70 px-2.5 py-1 border-l-2'
                  : customization.subtitleStyle === 'border-accent'
                  ? 'pl-2.5 border-l-2'
                  : 'font-normal opacity-95'
              }`}
              style={{
                fontFamily: customization.secondaryFontFamily || customization.fontFamily,
                fontWeight: getSubtitleFontWeight(),
                fontSize: getSubtitleFontSize(),
                color: effectiveSubtitleColor,
                borderColor: customization.primaryColor,
                textAlign: subtitleAlign,
                textShadow: 'none',
              }}
            >
              {subtitle}
            </p>
          )}

          {/* FOOTER BAR: WEBSITE DOMAIN & BOTTOM LOGOS */}
          <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[10px] rounded-none">
            {/* LOGO BOTTOM LEFT */}
            {customization.showLogo !== false && customization.logoPosition === 'bottom-left' && (
              <div
                className="flex items-center mr-2"
                style={{ opacity: (customization.logoOpacity ?? 100) / 100 }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={mediaName}
                    crossOrigin="anonymous"
                    className="object-contain rounded-none"
                    style={{ height: `${Math.max(24, getLogoHeightPx() * 0.6)}px`, maxWidth: '120px' }}
                  />
                ) : (
                  <span className="font-mono text-[10px] font-bold text-white/90 uppercase">{mediaName}</span>
                )}
              </div>
            )}

            {/* DOMAIN / BRANDING */}
            <div className="flex items-center gap-1.5 text-white/90 font-medium">
              <span
                className="h-1.5 w-1.5 rounded-none shrink-0"
                style={{ backgroundColor: customization.primaryColor }}
              />
              <span className="font-mono text-[9.5px] tracking-wide uppercase">
                {websiteText || 'TUMEDIO.COM'}
              </span>
            </div>

            {/* LOGO BOTTOM RIGHT */}
            {customization.showLogo !== false && customization.logoPosition === 'bottom-right' && (
              <div
                className="flex items-center ml-auto"
                style={{ opacity: (customization.logoOpacity ?? 100) / 100 }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={mediaName}
                    crossOrigin="anonymous"
                    className="object-contain rounded-none"
                    style={{ height: `${Math.max(24, getLogoHeightPx() * 0.6)}px`, maxWidth: '120px' }}
                  />
                ) : (
                  <span className="font-mono text-[10px] font-bold text-white/90 uppercase">{mediaName}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
