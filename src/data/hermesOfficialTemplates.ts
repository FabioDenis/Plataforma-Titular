export type HermesCardFormat = 'instagram-feed' | 'instagram-story' | 'facebook-feed' | 'square-post';

export interface HermesFormatConfig {
  id: HermesCardFormat;
  name: string;
  shortName: string;
  network: 'Instagram' | 'Facebook' | 'General';
  aspectRatio: string; // '4/5', '9/16', '1/1'
  aspectRatioClass: string;
  width: number;
  height: number;
  label: string;
  resolutionLabel: string;
  ratioLabel: string;
  badgeText: string;
  isStory?: boolean;
}

export const HERMES_CARD_FORMATS: HermesFormatConfig[] = [
  {
    id: 'instagram-feed',
    name: 'Instagram Feed',
    shortName: 'IG Feed',
    network: 'Instagram',
    aspectRatio: '4/5',
    aspectRatioClass: 'aspect-[4/5]',
    width: 1080,
    height: 1350,
    label: 'Instagram Feed (1080 × 1350 • 4:5)',
    resolutionLabel: '1080 × 1350 px',
    ratioLabel: '4:5',
    badgeText: '4:5 Feed',
  },
  {
    id: 'instagram-story',
    name: 'Instagram Story',
    shortName: 'IG Story',
    network: 'Instagram',
    aspectRatio: '9/16',
    aspectRatioClass: 'aspect-[9/16]',
    width: 1080,
    height: 1920,
    label: 'Instagram Story (1080 × 1920 • 9:16)',
    resolutionLabel: '1080 × 1920 px',
    ratioLabel: '9:16',
    badgeText: '9:16 Story',
    isStory: true,
  },
  {
    id: 'facebook-feed',
    name: 'Facebook Feed',
    shortName: 'FB Feed',
    network: 'Facebook',
    aspectRatio: '4/5',
    aspectRatioClass: 'aspect-[4/5]',
    width: 1080,
    height: 1350,
    label: 'Facebook Feed (1080 × 1350 • 4:5)',
    resolutionLabel: '1080 × 1350 px',
    ratioLabel: '4:5',
    badgeText: '4:5 Feed',
  },
  {
    id: 'square-post',
    name: 'Post Cuadrado',
    shortName: 'Cuadrado',
    network: 'General',
    aspectRatio: '1/1',
    aspectRatioClass: 'aspect-square',
    width: 1080,
    height: 1080,
    label: 'Post Cuadrado (1080 × 1080 • 1:1)',
    resolutionLabel: '1080 × 1080 px',
    ratioLabel: '1:1',
    badgeText: '1:1 Cuadrado',
  },
];

export interface HermesTemplateCustomization {
  // Colores Principales
  primaryColor: string; // Color primario de marca (acentos, botones, etiquetas, líneas)
  secondaryColor: string; // Color secundario / fondo del panel
  titleColor?: string; // Color del titular (por defecto blanco o acorde al contraste)
  subtitleColor?: string; // Color de la bajada
  categoryColor?: string; // Color del texto de categoría
  lineColor?: string; // Color de línea divisoria

  // Tipografía & Titular
  fontFamily: string; // Tipografía principal
  secondaryFontFamily: string; // Tipografía secundaria
  titleSize: 'small' | 'medium' | 'large' | 'xlarge';
  titleWeight: 'normal' | 'semibold' | 'bold' | 'extrabold' | 'black';
  titleAlign: 'left' | 'center' | 'right';

  // Contenido: Categoría / Sección
  showCategory: boolean;
  categorySize: 'small' | 'medium' | 'large';
  categoryWeight: 'normal' | 'semibold' | 'bold' | 'extrabold';
  categoryAlign: 'left' | 'center' | 'right';
  categoryStyle: 'badge' | 'underline' | 'simple' | 'upper-tag';

  // Contenido: Subtítulo / Bajada
  showSubtitle: boolean;
  subtitleSize: 'small' | 'medium' | 'large';
  subtitleWeight: 'normal' | 'semibold' | 'bold';
  subtitleAlign: 'left' | 'center' | 'right';
  subtitleStyle: 'classic' | 'italic' | 'border-accent' | 'highlight';

  // Logotipo
  showLogo?: boolean;
  logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'stack';
  logoSize: 'small' | 'medium' | 'large' | 'xlarge';
  logoOpacity: number; // 50 to 100

  // Fondo & Overlay sobre la Imagen
  overlayStyle: 'gradient-bottom' | 'gradient-dark' | 'soft' | 'vignette' | 'solid-translucent' | 'none';
  overlayIntensity: number; // 0 to 100
  overlayTone?: 'black' | 'blue' | 'red' | 'custom';
  customOverlayColor?: string;

  // Composición & Estructura (Reemplazo de Efectos)
  contentPosition: 'bottom' | 'center' | 'full';
  panelPadding: number; // 12 - 40px
  panelBackgroundType: 'solid' | 'gradient' | 'translucent' | 'none';
  panelOpacity: number; // 0 - 100%
  showDividerLine: boolean;
  dividerLineThickness: number; // 1 - 6px

  // Alineación general fallback
  textAlign: 'left' | 'center' | 'right';
}

export interface HermesOfficialTemplate {
  id: 'hermes-editorial' | 'hermes-breaking' | 'hermes-minimal' | 'hermes-magazine';
  name: string;
  tagline: string;
  description: string;
  idealFor: string;
  badgeText: string;
  badgeBg: string;
  layoutArchetype: 'editorial-clasico' | 'tv-news' | 'minimal' | 'editorial-clean';
  defaultCustomization: HermesTemplateCustomization;
}

export const HERMES_OFFICIAL_TEMPLATES: HermesOfficialTemplate[] = [
  {
    id: 'hermes-editorial',
    name: 'Editorial',
    tagline: 'Limpio, sobrio y periodístico',
    description: 'Diseño limpio y profesional con imagen predominante, titular destacado, logo del medio y bajada breve. Ideal para noticias generales y reportajes.',
    idealFor: 'Noticias generales, política, actualidad e informes especiales',
    badgeText: 'Prensa General',
    badgeBg: '#2563eb',
    layoutArchetype: 'editorial-clasico',
    defaultCustomization: {
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      titleColor: '#ffffff',
      subtitleColor: '#e2e8f0',
      categoryColor: '#ffffff',
      lineColor: '#2563eb',
      fontFamily: "'Montserrat', sans-serif",
      secondaryFontFamily: "'Inter', sans-serif",
      titleSize: 'large',
      titleWeight: 'extrabold',
      titleAlign: 'left',
      showCategory: true,
      categorySize: 'medium',
      categoryWeight: 'extrabold',
      categoryAlign: 'left',
      categoryStyle: 'badge',
      showSubtitle: true,
      subtitleSize: 'medium',
      subtitleWeight: 'normal',
      subtitleAlign: 'left',
      subtitleStyle: 'classic',
      showLogo: true,
      logoPosition: 'top-left',
      logoSize: 'medium',
      logoOpacity: 100,
      overlayStyle: 'gradient-bottom',
      overlayIntensity: 85,
      overlayTone: 'black',
      contentPosition: 'bottom',
      panelPadding: 24,
      panelBackgroundType: 'translucent',
      panelOpacity: 90,
      showDividerLine: true,
      dividerLineThickness: 3,
      textAlign: 'left',
    },
  },
  {
    id: 'hermes-breaking',
    name: 'Breaking News',
    tagline: 'Alto impacto y urgencia',
    description: 'Diseño impactante con titular de gran escala, etiqueta destacada de última hora, imagen de fondo y logo visible. Ideal para noticias urgentes.',
    idealFor: 'Último momento, alertas informativas, sucesos y noticias urgentes',
    badgeText: 'Urgente / Alerta',
    badgeBg: '#dc2626',
    layoutArchetype: 'tv-news',
    defaultCustomization: {
      primaryColor: '#dc2626',
      secondaryColor: '#111827',
      titleColor: '#ffffff',
      subtitleColor: '#fecaca',
      categoryColor: '#ffffff',
      lineColor: '#dc2626',
      fontFamily: "'Montserrat', sans-serif",
      secondaryFontFamily: "'Inter', sans-serif",
      titleSize: 'xlarge',
      titleWeight: 'black',
      titleAlign: 'left',
      showCategory: true,
      categorySize: 'large',
      categoryWeight: 'extrabold',
      categoryAlign: 'left',
      categoryStyle: 'badge',
      showSubtitle: true,
      subtitleSize: 'medium',
      subtitleWeight: 'bold',
      subtitleAlign: 'left',
      subtitleStyle: 'highlight',
      showLogo: true,
      logoPosition: 'top-right',
      logoSize: 'medium',
      logoOpacity: 100,
      overlayStyle: 'gradient-dark',
      overlayIntensity: 90,
      overlayTone: 'black',
      contentPosition: 'bottom',
      panelPadding: 24,
      panelBackgroundType: 'solid',
      panelOpacity: 95,
      showDividerLine: true,
      dividerLineThickness: 4,
      textAlign: 'left',
    },
  },
  {
    id: 'hermes-minimal',
    name: 'Minimal',
    tagline: 'Elegante, sobrio y espacioso',
    description: 'Diseño elegante y sobrio con mucho espacio visual, tipografía protagonista, imagen integrada limpiamente y logo discreto.',
    idealFor: 'Cultura, opinión, tendencias, economía y comunicación corporativa',
    badgeText: 'Minimal / Clean',
    badgeBg: '#475569',
    layoutArchetype: 'minimal',
    defaultCustomization: {
      primaryColor: '#3b82f6',
      secondaryColor: '#090d16',
      titleColor: '#ffffff',
      subtitleColor: '#cbd5e1',
      categoryColor: '#93c5fd',
      lineColor: '#3b82f6',
      fontFamily: "'Inter', sans-serif",
      secondaryFontFamily: "'Inter', sans-serif",
      titleSize: 'medium',
      titleWeight: 'bold',
      titleAlign: 'left',
      showCategory: true,
      categorySize: 'small',
      categoryWeight: 'semibold',
      categoryAlign: 'left',
      categoryStyle: 'simple',
      showSubtitle: true,
      subtitleSize: 'small',
      subtitleWeight: 'normal',
      subtitleAlign: 'left',
      subtitleStyle: 'italic',
      showLogo: true,
      logoPosition: 'top-left',
      logoSize: 'small',
      logoOpacity: 85,
      overlayStyle: 'soft',
      overlayIntensity: 65,
      overlayTone: 'black',
      contentPosition: 'bottom',
      panelPadding: 20,
      panelBackgroundType: 'translucent',
      panelOpacity: 80,
      showDividerLine: false,
      dividerLineThickness: 2,
      textAlign: 'left',
    },
  },
  {
    id: 'hermes-magazine',
    name: 'Magazine',
    tagline: 'Premium, refinado y editorial',
    description: 'Diseño más editorial y premium con imagen protagonista, titular estilizado y bajada en una composición sofisticada. Ideal para notas especiales.',
    idealFor: 'Notas especiales, crónicas, entrevistas de fondo y suplementos',
    badgeText: 'Revista / Premium',
    badgeBg: '#d97706',
    layoutArchetype: 'editorial-clean',
    defaultCustomization: {
      primaryColor: '#d97706',
      secondaryColor: '#1e293b',
      titleColor: '#ffffff',
      subtitleColor: '#fef3c7',
      categoryColor: '#ffffff',
      lineColor: '#d97706',
      fontFamily: "'Merriweather', serif",
      secondaryFontFamily: "'Inter', sans-serif",
      titleSize: 'large',
      titleWeight: 'bold',
      titleAlign: 'left',
      showCategory: true,
      categorySize: 'medium',
      categoryWeight: 'extrabold',
      categoryAlign: 'left',
      categoryStyle: 'underline',
      showSubtitle: true,
      subtitleSize: 'medium',
      subtitleWeight: 'normal',
      subtitleAlign: 'left',
      subtitleStyle: 'border-accent',
      showLogo: true,
      logoPosition: 'bottom-right',
      logoSize: 'medium',
      logoOpacity: 100,
      overlayStyle: 'vignette',
      overlayIntensity: 80,
      overlayTone: 'black',
      contentPosition: 'bottom',
      panelPadding: 28,
      panelBackgroundType: 'translucent',
      panelOpacity: 85,
      showDividerLine: true,
      dividerLineThickness: 3,
      textAlign: 'left',
    },
  },
];

export const AVAILABLE_FONTS = [
  { id: "'Montserrat', sans-serif", label: 'Montserrat (Moderna, Geométrica)', category: 'sans' },
  { id: "'Inter', sans-serif", label: 'Inter (Neogrotesca, Neutra)', category: 'sans' },
  { id: "'Poppins', sans-serif", label: 'Poppins (Amigable, Redondeada)', category: 'sans' },
  { id: "'Merriweather', serif", label: 'Merriweather (Prensa Clásica, Serif)', category: 'serif' },
  { id: "'Playfair Display', serif", label: 'Playfair Display (Editorial Premium)', category: 'serif' },
  { id: "'Roboto Slab', serif", label: 'Roboto Slab (Sólida, Periodística)', category: 'serif' },
];

export const FONT_WEIGHT_OPTIONS = [
  { id: 'normal', label: 'Regular (400)', cssWeight: '400' },
  { id: 'semibold', label: 'Semibold (600)', cssWeight: '600' },
  { id: 'bold', label: 'Bold (700)', cssWeight: '700' },
  { id: 'extrabold', label: 'Extrabold (800)', cssWeight: '800' },
  { id: 'black', label: 'Black (900)', cssWeight: '900' },
];

export const TITLE_SIZE_OPTIONS = [
  { id: 'small', label: 'Pequeño (19px)', fontSizePx: '19px' },
  { id: 'medium', label: 'Mediano (23px)', fontSizePx: '23px' },
  { id: 'large', label: 'Grande (28px)', fontSizePx: '28px' },
  { id: 'xlarge', label: 'Extra Grande (34px)', fontSizePx: '34px' },
];

export const SUBTITLE_SIZE_OPTIONS = [
  { id: 'small', label: 'Pequeña (12px)' },
  { id: 'medium', label: 'Mediana (14px)' },
  { id: 'large', label: 'Grande (16px)' },
];

export const CATEGORY_SIZE_OPTIONS = [
  { id: 'small', label: 'Pequeña (10px)' },
  { id: 'medium', label: 'Mediana (12px)' },
  { id: 'large', label: 'Grande (14px)' },
];

export const LOGO_POSITION_OPTIONS = [
  { id: 'top-left', label: 'Superior Izquierda' },
  { id: 'top-right', label: 'Superior Derecha' },
  { id: 'bottom-left', label: 'Inferior Izquierda' },
  { id: 'bottom-right', label: 'Inferior Derecha' },
  { id: 'stack', label: 'En el Panel / Stack' },
];

export const LOGO_SIZE_OPTIONS = [
  { id: 'small', label: 'Pequeño (42px)', heightPx: 42 },
  { id: 'medium', label: 'Mediano (60px)', heightPx: 60 },
  { id: 'large', label: 'Grande (82px)', heightPx: 82 },
  { id: 'xlarge', label: 'Extra Grande (110px)', heightPx: 110 },
];

export const OVERLAY_STYLE_OPTIONS = [
  { id: 'gradient-bottom', label: 'Degradado Inferior' },
  { id: 'gradient-dark', label: 'Degradado Oscuro Completo' },
  { id: 'soft', label: 'Sutil y Suave' },
  { id: 'vignette', label: 'Viñeta Enmarcada' },
  { id: 'solid-translucent', label: 'Sólido Translúcido' },
  { id: 'none', label: 'Sin Overlay (Directo)' },
];

export const SUBTITLE_STYLE_OPTIONS = [
  { id: 'classic', label: 'Clásico' },
  { id: 'italic', label: 'Cursiva Elegante' },
  { id: 'border-accent', label: 'Borde de Acento Lateral' },
  { id: 'highlight', label: 'Resaltado Suave' },
];

export const CATEGORY_STYLE_OPTIONS = [
  { id: 'badge', label: 'Etiqueta Rellena (Badge)' },
  { id: 'underline', label: 'Subrayado Destacado' },
  { id: 'simple', label: 'Texto Simple' },
  { id: 'upper-tag', label: 'Tag Superior' },
];

export const COMPOSITION_POSITION_OPTIONS = [
  { id: 'bottom', label: 'Abajo (Pie / Clásico)' },
  { id: 'center', label: 'Centrado Vertical' },
  { id: 'full', label: 'Expandido Completo' },
];
