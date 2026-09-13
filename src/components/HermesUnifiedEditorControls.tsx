import React from 'react';
import {
  Palette,
  Type,
  Image as ImageIcon,
  SlidersHorizontal,
  Layers,
  LayoutTemplate,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
  RotateCcw,
  Sparkles,
  Building2,
  Check,
  CheckCircle2,
  ZoomIn,
  MoveHorizontal,
  MoveVertical,
  Smartphone,
} from 'lucide-react';
import {
  HermesTemplateCustomization,
  HermesOfficialTemplate,
  HERMES_OFFICIAL_TEMPLATES,
  HermesCardFormat,
  HERMES_CARD_FORMATS,
  AVAILABLE_FONTS,
  FONT_WEIGHT_OPTIONS,
  TITLE_SIZE_OPTIONS,
  SUBTITLE_SIZE_OPTIONS,
  CATEGORY_SIZE_OPTIONS,
  LOGO_POSITION_OPTIONS,
  LOGO_SIZE_OPTIONS,
  OVERLAY_STYLE_OPTIONS,
  SUBTITLE_STYLE_OPTIONS,
  CATEGORY_STYLE_OPTIONS,
  COMPOSITION_POSITION_OPTIONS,
} from '../data/hermesOfficialTemplates';

export interface HermesUnifiedEditorControlsProps {
  customization: HermesTemplateCustomization;
  onChangeCustomization: (updated: HermesTemplateCustomization) => void;
  selectedTemplateId: string;
  onSelectTemplate: (template: HermesOfficialTemplate) => void;
  selectedFormat?: HermesCardFormat;
  onChangeFormat?: (format: HermesCardFormat) => void;
  // Optional content fields for when in Generator editor
  headline?: string;
  onChangeHeadline?: (val: string) => void;
  subtitle?: string;
  onChangeSubtitle?: (val: string) => void;
  category?: string;
  onChangeCategory?: (val: string) => void;
  // Image transformation props
  imageZoom?: number;
  onChangeImageZoom?: (val: number) => void;
  imageOffsetX?: number;
  onChangeImageOffsetX?: (val: number) => void;
  imageOffsetY?: number;
  onChangeImageOffsetY?: (val: number) => void;
  onResetImageTransform?: () => void;
  onUploadImage?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadLogo?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  activeControlTab: string;
  onChangeControlTab: (tab: string) => void;
  isIdentityMode?: boolean;
}

const PRESET_COLOR_SWATCHES = [
  { name: 'Azul Prensa', hex: '#2563eb' },
  { name: 'Rojo Urgente', hex: '#dc2626' },
  { name: 'Verde Esmeralda', hex: '#059669' },
  { name: 'Ámbar Dorado', hex: '#d97706' },
  { name: 'Púrpura Digital', hex: '#7c3aed' },
  { name: 'Azul Marino', hex: '#1e40af' },
  { name: 'Gris Grafito', hex: '#475569' },
  { name: 'Cian Moderno', hex: '#0284c7' },
];

export const HermesUnifiedEditorControls: React.FC<HermesUnifiedEditorControlsProps> = ({
  customization,
  onChangeCustomization,
  selectedTemplateId,
  onSelectTemplate,
  selectedFormat = 'instagram-feed',
  onChangeFormat,
  headline,
  onChangeHeadline,
  subtitle,
  onChangeSubtitle,
  category,
  onChangeCategory,
  imageZoom = 100,
  onChangeImageZoom,
  imageOffsetX = 0,
  onChangeImageOffsetX,
  imageOffsetY = 0,
  onChangeImageOffsetY,
  onResetImageTransform,
  onUploadImage,
  onUploadLogo,
  activeControlTab,
  onChangeControlTab,
  isIdentityMode = false,
}) => {
  const update = (partial: Partial<HermesTemplateCustomization>) => {
    onChangeCustomization({
      ...customization,
      ...partial,
    });
  };

  const tabs = [
    { id: 'format', label: 'Formato', icon: Smartphone },
    { id: 'templates', label: 'Plantillas', icon: LayoutTemplate },
    { id: 'content', label: 'Textos', icon: SlidersHorizontal },
    { id: 'typography', label: 'Tipografía', icon: Type },
    { id: 'colors', label: 'Colores', icon: Palette },
    { id: 'logo', label: 'Logotipo', icon: Building2 },
    { id: 'image', label: 'Imagen & Fondo', icon: ImageIcon },
    { id: 'composition', label: 'Composición', icon: Layers },
  ];

  return (
    <div className="flex flex-col bg-white border border-brand-navy/15 rounded-xl overflow-hidden shadow-card">
      {/* 1. TOP TAB NAVIGATION BAR */}
      <div className="grid grid-cols-4 sm:grid-cols-8 border-b border-brand-navy/15 bg-white p-1 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeControlTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeControlTab(tab.id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 p-2 text-[10px] sm:text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                isActive
                  ? 'bg-brand-primary text-brand-ink shadow-none border-b-2 border-brand-primary-deep'
                  : 'text-brand-navy/80 hover:text-brand-ink hover:bg-brand-navy/10'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-brand-ink' : 'text-brand-navy/50'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. TAB CONTENT PANELS */}
      <div className="p-4 space-y-4 max-h-[620px] overflow-y-auto scrollbar-thin">
        {/* ======================================================== */}
        {/* TAB 0: FORMATOS DE PUBLICACIÓN (FEED 4:5, STORY 9:16, ETC) */}
        {/* ======================================================== */}
        {activeControlTab === 'format' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <div>
                <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-brand-primary-deep" /> Formatos de Redes Sociales
                </h4>
                <p className="text-[11px] text-brand-navy/60">
                  Selecciona la relación de aspecto real y resolución para la publicación.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HERMES_CARD_FORMATS.map((fmt) => {
                const isSelected = selectedFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => onChangeFormat && onChangeFormat(fmt.id)}
                    className={`rounded-md border p-3.5 text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-primary bg-brand-primary-soft ring-1 ring-brand-primary/60 shadow-none'
                        : 'border-brand-navy/15 bg-brand-navy/5 hover:border-brand-navy/40 hover:bg-brand-navy/10'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9.5px] font-mono font-bold px-2 py-0.5 bg-brand-navy/5 border border-brand-navy/15 text-brand-navy rounded">
                          {fmt.ratioLabel}
                        </span>
                        {isSelected && (
                          <div className="bg-brand-primary text-brand-ink p-0.5 rounded">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </div>

                      <div>
                        <h5 className="text-xs font-bold text-brand-ink">{fmt.name}</h5>
                        <p className="text-[10.5px] font-mono text-brand-navy/60 mt-0.5">
                          {fmt.resolutionLabel}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-brand-navy/10 flex items-center justify-between text-[10px]">
                      <span className="text-brand-navy/60">{fmt.network}</span>
                      <span className={`font-bold ${isSelected ? 'text-brand-primary-deep' : 'text-brand-navy/50'}`}>
                        {isSelected ? 'Activo' : 'Seleccionar'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-md border border-brand-navy/15 bg-white p-3 text-[11px] text-brand-navy/80 space-y-1">
              <span className="font-bold text-brand-ink block">📐 Adaptabilidad Proporcional</span>
              <p className="text-[10.5px] text-brand-navy/60">
                Al alternar entre Instagram Feed (4:5) e Instagram Story (9:16), todos los componentes gráficos, tipografías y márgenes de seguridad se recalculan proporcionalmente sin deformar la imagen ni recortar titulares.
              </p>
            </div>
          </div>
        )}
        {/* ======================================================== */}
        {/* TAB 1: PLANTILLAS OFICIALES */}
        {/* ======================================================== */}
        {activeControlTab === 'templates' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <div>
                <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                  <LayoutTemplate className="h-3.5 w-3.5 text-brand-primary-deep" /> Plantillas Oficiales de Hermes
                </h4>
                <p className="text-[11px] text-brand-navy/60">
                  Selecciona el arquetipo visual adaptado a la identidad de tu medio.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {HERMES_OFFICIAL_TEMPLATES.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => onSelectTemplate(tpl)}
                    className={`rounded-md border p-3 flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-primary bg-brand-primary-soft ring-1 ring-brand-primary/60 shadow-none'
                        : 'border-brand-navy/15 bg-brand-navy/5 hover:border-brand-navy/40 hover:bg-brand-navy/10'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[9px] font-black px-2 py-0.5 text-white uppercase tracking-wider rounded-none"
                          style={{ backgroundColor: tpl.badgeBg }}
                        >
                          {tpl.badgeText}
                        </span>
                        {isSelected && (
                          <div className="bg-brand-primary text-brand-ink p-0.5 rounded">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </div>

                      <h5 className="text-xs font-bold text-brand-ink">{tpl.name}</h5>
                      <p className="text-[10px] text-brand-navy/80 line-clamp-2">{tpl.description}</p>
                    </div>

                    <button
                      type="button"
                      className={`mt-3 w-full py-1.5 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-brand-primary text-brand-ink'
                          : 'bg-brand-navy/10 text-brand-navy/80 hover:bg-brand-primary hover:text-brand-ink'
                      }`}
                    >
                      {isSelected ? '✓ Seleccionada' : 'Usar esta plantilla'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: TEXTOS & CONTENIDO */}
        {/* ======================================================== */}
        {activeControlTab === 'content' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-brand-primary-deep" /> Textos y Alineación
              </h4>
            </div>

            {/* EDITABLE TITULAR (If provided) */}
            {onChangeHeadline && headline !== undefined && (
              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-brand-navy">Titular Principal:</label>
                <textarea
                  value={headline}
                  onChange={(e) => onChangeHeadline(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-brand-navy/15 bg-white p-2.5 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-hidden"
                  placeholder="Escribe el titular de la publicación..."
                />
              </div>
            )}

            {/* TITULAR ALIGNMENT */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Alineación del Titular:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'left', label: 'Izquierda', icon: AlignLeft },
                  { id: 'center', label: 'Centro', icon: AlignCenter },
                  { id: 'right', label: 'Derecha', icon: AlignRight },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = (customization.titleAlign || customization.textAlign) === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => update({ titleAlign: opt.id as any, textAlign: opt.id as any })}
                      className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-md border transition-all ${
                        isSelected
                          ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                          : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* EDITABLE SUBTÍTULO */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-brand-navy">Subtítulo / Bajada:</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customization.showSubtitle}
                    onChange={(e) => update({ showSubtitle: e.target.checked })}
                    className="h-4 w-4 rounded-md border-brand-navy/15 bg-white text-brand-primary focus:ring-0"
                  />
                  <span className="text-[11px] font-bold text-brand-navy/80">Mostrar</span>
                </label>
              </div>

              {customization.showSubtitle && (
                <>
                  {onChangeSubtitle && subtitle !== undefined && (
                    <textarea
                      value={subtitle}
                      onChange={(e) => onChangeSubtitle(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-brand-navy/15 bg-white p-2.5 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-hidden"
                      placeholder="Texto de la bajada o resumen..."
                    />
                  )}

                  {/* Subtitle Alignment */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-brand-navy/60">Alineación del Subtítulo:</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'left', label: 'Izquierda', icon: AlignLeft },
                        { id: 'center', label: 'Centro', icon: AlignCenter },
                        { id: 'right', label: 'Derecha', icon: AlignRight },
                      ].map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = (customization.subtitleAlign || customization.textAlign) === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => update({ subtitleAlign: opt.id as any })}
                            className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold rounded-md border transition-all ${
                              isSelected
                                ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                                : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subtitle Style */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-brand-navy/60">Estilo de Subtítulo:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUBTITLE_STYLE_OPTIONS.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => update({ subtitleStyle: style.id as any })}
                          className={`py-1.5 px-2 text-[11px] font-bold rounded-md border text-left truncate transition-all ${
                            customization.subtitleStyle === style.id
                              ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                              : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                          }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* EDITABLE CATEGORÍA / SECCIÓN */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-brand-navy">Categoría / Sección:</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customization.showCategory}
                    onChange={(e) => update({ showCategory: e.target.checked })}
                    className="h-4 w-4 rounded-md border-brand-navy/15 bg-white text-brand-primary focus:ring-0"
                  />
                  <span className="text-[11px] font-bold text-brand-navy/80">Mostrar</span>
                </label>
              </div>

              {customization.showCategory && (
                <>
                  {onChangeCategory && category !== undefined && (
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => onChangeCategory(e.target.value)}
                      className="w-full rounded-md border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-hidden"
                      placeholder="Ej: ACTUALIDAD, POLÍTICA..."
                    />
                  )}

                  {/* Category Alignment */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-brand-navy/60">Alineación de Categoría:</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'left', label: 'Izquierda', icon: AlignLeft },
                        { id: 'center', label: 'Centro', icon: AlignCenter },
                        { id: 'right', label: 'Derecha', icon: AlignRight },
                      ].map((opt) => {
                        const Icon = opt.icon;
                        const isSelected = (customization.categoryAlign || customization.textAlign) === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => update({ categoryAlign: opt.id as any })}
                            className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-bold rounded-md border transition-all ${
                              isSelected
                                ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                                : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category Style */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-brand-navy/60">Diseño de Categoría:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CATEGORY_STYLE_OPTIONS.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => update({ categoryStyle: style.id as any })}
                          className={`py-1.5 px-2 text-[11px] font-bold rounded-md border text-left truncate transition-all ${
                            customization.categoryStyle === style.id
                              ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                              : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                          }`}
                        >
                          {style.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: TIPOGRAFÍA & TAMAÑOS */}
        {/* ======================================================== */}
        {activeControlTab === 'typography' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-brand-primary-deep" /> Tipografías y Escalas
              </h4>
            </div>

            {/* TIPOGRAFÍA PRINCIPAL (TITULAR) */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Fuente del Titular:</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {AVAILABLE_FONTS.map((font) => (
                  <button
                    key={font.id}
                    onClick={() => update({ fontFamily: font.id })}
                    className={`p-2 rounded-md border text-left transition-all ${
                      customization.fontFamily === font.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    <div className="text-xs font-bold" style={{ fontFamily: font.id }}>
                      {font.label.split('(')[0].trim()}
                    </div>
                    <div className="text-[9px] text-brand-navy/60 opacity-80">{font.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* TAMAÑO DEL TITULAR */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Tamaño del Titular:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {TITLE_SIZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => update({ titleSize: opt.id as any })}
                    className={`py-1.5 text-center text-xs font-bold rounded-md border transition-all ${
                      customization.titleSize === opt.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {opt.label.split('(')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* GROSOR / PESO DEL TITULAR */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Grosor del Titular:</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {FONT_WEIGHT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => update({ titleWeight: opt.id as any })}
                    className={`py-1.5 text-center text-[11px] font-bold rounded-md border transition-all ${
                      customization.titleWeight === opt.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {opt.label.split('(')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* TAMAÑO Y PESO DE SUBTÍTULO & CATEGORÍA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-brand-navy">Escala de Subtítulo:</label>
                <div className="grid grid-cols-3 gap-1">
                  {SUBTITLE_SIZE_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => update({ subtitleSize: s.id as any })}
                      className={`py-1 text-[10px] font-bold rounded-md border text-center ${
                        customization.subtitleSize === s.id
                          ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                          : 'bg-white text-brand-navy/80 border-brand-navy/15'
                      }`}
                    >
                      {s.label.split('(')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-brand-navy">Escala de Categoría:</label>
                <div className="grid grid-cols-3 gap-1">
                  {CATEGORY_SIZE_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => update({ categorySize: c.id as any })}
                      className={`py-1 text-[10px] font-bold rounded-md border text-center ${
                        customization.categorySize === c.id
                          ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                          : 'bg-white text-brand-navy/80 border-brand-navy/15'
                      }`}
                    >
                      {c.label.split('(')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: COLORES */}
        {/* ======================================================== */}
        {activeControlTab === 'colors' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-brand-primary-deep" /> Paleta de Marca
              </h4>
            </div>

            {/* COLOR PRIMARIO DE MARCA */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Color Primario (Acentos & Etiquetas):</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customization.primaryColor}
                  onChange={(e) => update({ primaryColor: e.target.value })}
                  className="h-8 w-10 rounded-md bg-transparent cursor-pointer border border-brand-navy/15"
                />
                <input
                  type="text"
                  value={customization.primaryColor}
                  onChange={(e) => update({ primaryColor: e.target.value })}
                  className="w-full rounded-md border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-ink font-mono uppercase"
                />
              </div>

              {/* Quick Swatches */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 pt-2 border-t border-brand-navy/15">
                {PRESET_COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.hex}
                    onClick={() => update({ primaryColor: swatch.hex, lineColor: swatch.hex })}
                    className="h-6 rounded-md border border-brand-ink/10 transition-transform hover:scale-105"
                    style={{ backgroundColor: swatch.hex }}
                    title={swatch.name}
                  />
                ))}
              </div>
            </div>

            {/* COLOR SECUNDARIO / FONDO DEL PANEL */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Color Secundario / Fondo del Panel:</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customization.secondaryColor}
                  onChange={(e) => update({ secondaryColor: e.target.value })}
                  className="h-8 w-10 rounded-md bg-transparent cursor-pointer border border-brand-navy/15"
                />
                <input
                  type="text"
                  value={customization.secondaryColor}
                  onChange={(e) => update({ secondaryColor: e.target.value })}
                  className="w-full rounded-md border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-ink font-mono uppercase"
                />
              </div>
            </div>

            {/* COLOR DEL TITULAR & SUBTÍTULO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-brand-navy">Color del Titular:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customization.titleColor || '#ffffff'}
                    onChange={(e) => update({ titleColor: e.target.value })}
                    className="h-7 w-8 rounded-md bg-transparent cursor-pointer border border-brand-navy/15"
                  />
                  <input
                    type="text"
                    value={customization.titleColor || '#ffffff'}
                    onChange={(e) => update({ titleColor: e.target.value })}
                    className="w-full rounded-md border border-brand-navy/15 bg-white px-2 py-1 text-xs text-brand-ink font-mono"
                  />
                </div>
              </div>

              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <label className="block text-xs font-bold text-brand-navy">Color de la Bajada:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customization.subtitleColor || '#e2e8f0'}
                    onChange={(e) => update({ subtitleColor: e.target.value })}
                    className="h-7 w-8 rounded-md bg-transparent cursor-pointer border border-brand-navy/15"
                  />
                  <input
                    type="text"
                    value={customization.subtitleColor || '#e2e8f0'}
                    onChange={(e) => update({ subtitleColor: e.target.value })}
                    className="w-full rounded-md border border-brand-navy/15 bg-white px-2 py-1 text-xs text-brand-ink font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: LOGOTIPO */}
        {/* ======================================================== */}
        {activeControlTab === 'logo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-brand-primary-deep" /> Logotipo del Medio
              </h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customization.showLogo !== false}
                  onChange={(e) => update({ showLogo: e.target.checked })}
                  className="h-4 w-4 rounded-md border-brand-navy/15 bg-white text-brand-primary focus:ring-0"
                />
                <span className="text-[11px] font-bold text-brand-navy/80">Mostrar Logo</span>
              </label>
            </div>

            {/* UPLOAD LOGO BUTTON */}
            {onUploadLogo && (
              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg">
                <label className="flex items-center justify-center gap-2 py-2 px-3 bg-brand-primary hover:bg-brand-primary-hover text-brand-ink text-xs font-bold rounded-md cursor-pointer transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>Subir Logo Personalizado</span>
                  <input type="file" accept="image/*" onChange={onUploadLogo} className="hidden" />
                </label>
              </div>
            )}

            {/* POSICIÓN DEL LOGO */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Ubicación del Logo:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {LOGO_POSITION_OPTIONS.map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => update({ logoPosition: pos.id as any })}
                    className={`py-2 px-2.5 text-xs font-bold rounded-md border text-center transition-all ${
                      customization.logoPosition === pos.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ESCALA / TAMAÑO DEL LOGO */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Tamaño del Logo:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {LOGO_SIZE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => update({ logoSize: s.id as any })}
                    className={`py-1.5 text-xs font-bold rounded-md border text-center transition-all ${
                      customization.logoSize === s.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {s.label.split('(')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* OPACIDAD DEL LOGO */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                <span>Opacidad del Logotipo:</span>
                <span className="font-mono text-brand-primary-deep">{customization.logoOpacity ?? 100}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={customization.logoOpacity ?? 100}
                onChange={(e) => update({ logoOpacity: Number(e.target.value) })}
                className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 6: IMAGEN & FONDO */}
        {/* ======================================================== */}
        {activeControlTab === 'image' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-brand-primary-deep" /> Imagen & Encuadre
              </h4>
              {onResetImageTransform && (
                <button
                  onClick={onResetImageTransform}
                  className="flex items-center gap-1 text-[11px] font-bold text-brand-navy/60 hover:text-brand-ink cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restablecer</span>
                </button>
              )}
            </div>

            {/* UPLOAD IMAGE BUTTON */}
            {onUploadImage && (
              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <label className="flex items-center justify-center gap-2 py-2.5 px-3 bg-brand-primary hover:bg-brand-primary-hover text-brand-ink text-xs font-bold rounded-md cursor-pointer transition-colors">
                  <Upload className="h-4 w-4" />
                  <span>Subir Imagen de la Noticia</span>
                  <input type="file" accept="image/*" onChange={onUploadImage} className="hidden" />
                </label>
                <p className="text-[10px] text-center text-brand-navy/60 font-normal">
                  La imagen se ajusta automáticamente (object-fit: cover) ocupando el 100% sin franjas negras.
                </p>
              </div>
            )}

            {/* ZOOM SLIDER (100% to 300%) */}
            {onChangeImageZoom && (
              <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                  <span className="flex items-center gap-1.5">
                    <ZoomIn className="h-3.5 w-3.5 text-brand-primary-deep" /> Zoom de la Imagen:
                  </span>
                  <span className="font-mono text-brand-primary-deep">{imageZoom}%</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="300"
                  step="5"
                  value={imageZoom}
                  onChange={(e) => onChangeImageZoom(Number(e.target.value))}
                  className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
                />
              </div>
            )}

            {/* PAN X / PAN Y CONTROLS */}
            {onChangeImageOffsetX && onChangeImageOffsetY && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                    <span className="flex items-center gap-1">
                      <MoveHorizontal className="h-3 w-3 text-brand-primary-deep" /> Pan Horizontal:
                    </span>
                    <span className="font-mono text-brand-primary-deep">{imageOffsetX}px</span>
                  </div>
                  <input
                    type="range"
                    min="-150"
                    max="150"
                    step="5"
                    value={imageOffsetX}
                    onChange={(e) => onChangeImageOffsetX(Number(e.target.value))}
                    className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
                  />
                </div>

                <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                    <span className="flex items-center gap-1">
                      <MoveVertical className="h-3 w-3 text-brand-primary-deep" /> Pan Vertical:
                    </span>
                    <span className="font-mono text-brand-primary-deep">{imageOffsetY}px</span>
                  </div>
                  <input
                    type="range"
                    min="-150"
                    max="150"
                    step="5"
                    value={imageOffsetY}
                    onChange={(e) => onChangeImageOffsetY(Number(e.target.value))}
                    className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* OVERLAY CONFIGURATION */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-3">
              <label className="block text-xs font-bold text-brand-navy">Estilo de Degradado / Overlay:</label>
              <div className="grid grid-cols-2 gap-1.5">
                {OVERLAY_STYLE_OPTIONS.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => update({ overlayStyle: style.id as any })}
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-md border text-left truncate transition-all ${
                      customization.overlayStyle === style.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>

              {/* Overlay Intensity */}
              {customization.overlayStyle !== 'none' && (
                <div className="space-y-1.5 pt-2 border-t border-brand-navy/15">
                  <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                    <span>Intensidad de Oscurecimiento:</span>
                    <span className="font-mono text-brand-primary-deep">{customization.overlayIntensity ?? 80}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={customization.overlayIntensity ?? 80}
                    onChange={(e) => update({ overlayIntensity: Number(e.target.value) })}
                    className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 7: COMPOSICIÓN & ESTRUCTURA (REEMPLAZO DE EFECTOS) */}
        {/* ======================================================== */}
        {activeControlTab === 'composition' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-brand-navy/15">
              <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-brand-primary-deep" /> Composición y Estructura
              </h4>
            </div>

            {/* POSICIÓN DEL CONTENIDO */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <label className="block text-xs font-bold text-brand-navy">Ubicación del Bloque de Texto:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {COMPOSITION_POSITION_OPTIONS.map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => update({ contentPosition: pos.id as any })}
                    className={`py-1.5 text-xs font-bold rounded-md border text-center transition-all ${
                      (customization.contentPosition || 'bottom') === pos.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>

            {/* RELLENO / PADDING INTERNO */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                <span>Espaciado Interno (Padding):</span>
                <span className="font-mono text-brand-primary-deep">{customization.panelPadding ?? 24}px</span>
              </div>
              <input
                type="range"
                min="12"
                max="40"
                step="2"
                value={customization.panelPadding ?? 24}
                onChange={(e) => update({ panelPadding: Number(e.target.value) })}
                className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
              />
            </div>

            {/* FONDO DEL PANEL EDITORIAL */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-3">
              <label className="block text-xs font-bold text-brand-navy">Fondo del Panel de Contenido:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'translucent', label: 'Translúcido' },
                  { id: 'solid', label: 'Sólido' },
                  { id: 'gradient', label: 'Degradado' },
                  { id: 'none', label: 'Ninguno' },
                ].map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => update({ panelBackgroundType: bg.id as any })}
                    className={`py-1.5 text-xs font-bold rounded-md border text-center transition-all ${
                      (customization.panelBackgroundType || 'translucent') === bg.id
                        ? 'bg-brand-primary text-brand-ink border-brand-primary-deep'
                        : 'bg-white text-brand-navy/80 border-brand-navy/15 hover:text-brand-ink'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>

              {customization.panelBackgroundType !== 'none' && (
                <div className="space-y-1.5 pt-2 border-t border-brand-navy/15">
                  <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                    <span>Opacidad del Panel:</span>
                    <span className="font-mono text-brand-primary-deep">{customization.panelOpacity ?? 90}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={customization.panelOpacity ?? 90}
                    onChange={(e) => update({ panelOpacity: Number(e.target.value) })}
                    className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* LÍNEA DIVISORIA DECORATIVA */}
            <div className="bg-brand-navy/5 p-3 border border-brand-navy/15 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-brand-navy">Línea Divisoria Decorativa:</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customization.showDividerLine}
                    onChange={(e) => update({ showDividerLine: e.target.checked })}
                    className="h-4 w-4 rounded-md border-brand-navy/15 bg-white text-brand-primary focus:ring-0"
                  />
                  <span className="text-[11px] font-bold text-brand-navy/80">Mostrar</span>
                </label>
              </div>

              {customization.showDividerLine && (
                <div className="space-y-2 pt-2 border-t border-brand-navy/15">
                  <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                    <span>Grosor de la Línea:</span>
                    <span className="font-mono text-brand-primary-deep">{customization.dividerLineThickness ?? 3}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    step="1"
                    value={customization.dividerLineThickness ?? 3}
                    onChange={(e) => update({ dividerLineThickness: Number(e.target.value) })}
                    className="w-full h-1.5 bg-brand-navy/10 rounded-full accent-brand-primary cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
