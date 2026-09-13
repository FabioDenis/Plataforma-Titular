export interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  category: 'Prensa General' | 'Revista & Digital' | 'Redes Sociales' | 'Especiales';
  badgeText: string;
  badgeBg: string; // e.g. Tailwind bg color class or hex
  layoutType:
    | 'editorial-clasico'
    | 'editorial-clean'
    | 'economia'
    | 'story-instagram'
    | 'tv-news'
    | 'carrusel';
  defaultSettings: {
    primaryColor: string;
    secondaryColor: string;
    titleColor: string;
    lineColor: string;
    fontFamily: string;
    fontWeight: string;
    panelBgType: 'solid' | 'gradient';
    panelColor: string;
    panelGradientStart: string;
    panelGradientEnd: string;
    panelGradientType: 'none' | 'vertical' | 'horizontal' | 'diagonal' | 'radial';
    panelOpacity: number; // 0 to 100
    panelPadding: number; // in px
    panelRadius: number; // in px
    panelShadow: 'none' | 'sm' | 'md' | 'lg' | '2xl' | 'glow';
    logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'stack';
    showWebsite: boolean;
    websiteAlign: 'left' | 'center' | 'right';
    isLightMode?: boolean;
  };
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'editorial-clasico',
    name: 'Editorial Clásico',
    description: 'Imagen completa con degradado oscuro inferior, titular en alta legibilidad y dominio al pie.',
    category: 'Prensa General',
    badgeText: 'Imagen Completa',
    badgeBg: '#2563eb',
    layoutType: 'editorial-clasico',
    defaultSettings: {
      primaryColor: '#2563eb',
      secondaryColor: '#0f172a',
      titleColor: '#ffffff',
      lineColor: '#2563eb',
      fontFamily: "'Montserrat', sans-serif",
      fontWeight: '800',
      panelBgType: 'gradient',
      panelColor: '#090d16',
      panelGradientStart: '#000000',
      panelGradientEnd: '#0f172a',
      panelGradientType: 'vertical',
      panelOpacity: 90,
      panelPadding: 24,
      panelRadius: 0,
      panelShadow: 'none',
      logoPosition: 'stack',
      showWebsite: true,
      websiteAlign: 'left',
      isLightMode: false,
    },
  },
  {
    id: 'editorial-clean',
    name: 'Editorial Clean',
    description: 'Diseño moderno 50/50: imagen superior, panel inferior limpio, categoría flotante y dominio superior.',
    category: 'Revista & Digital',
    badgeText: 'Split 50/50 Clean',
    badgeBg: '#059669',
    layoutType: 'editorial-clean',
    defaultSettings: {
      primaryColor: '#059669',
      secondaryColor: '#f8fafc',
      titleColor: '#0f172a',
      lineColor: '#10b981',
      fontFamily: "'Inter', sans-serif",
      fontWeight: '700',
      panelBgType: 'solid',
      panelColor: '#ffffff',
      panelGradientStart: '#ffffff',
      panelGradientEnd: '#f1f5f9',
      panelGradientType: 'none',
      panelOpacity: 100,
      panelPadding: 28,
      panelRadius: 16,
      panelShadow: 'lg',
      logoPosition: 'bottom-right',
      showWebsite: true,
      websiteAlign: 'left',
      isLightMode: true,
    },
  },
  {
    id: 'economia',
    name: 'Economía & Finanzas',
    description: 'Estilo ejecutivo sobrio con paleta azul marino, dorados finos y tipografía de prensa financiera.',
    category: 'Prensa General',
    badgeText: 'Finanzas & Mercados',
    badgeBg: '#d97706',
    layoutType: 'economia',
    defaultSettings: {
      primaryColor: '#d97706',
      secondaryColor: '#0f172a',
      titleColor: '#ffffff',
      lineColor: '#f59e0b',
      fontFamily: "'Merriweather', serif",
      fontWeight: '700',
      panelBgType: 'solid',
      panelColor: '#0f172a',
      panelGradientStart: '#1e293b',
      panelGradientEnd: '#0f172a',
      panelGradientType: 'diagonal',
      panelOpacity: 95,
      panelPadding: 26,
      panelRadius: 12,
      panelShadow: 'md',
      logoPosition: 'top-right',
      showWebsite: true,
      websiteAlign: 'right',
      isLightMode: false,
    },
  },
  {
    id: 'story-instagram',
    name: 'Story Instagram 9:16',
    description: 'Formato vertical optimizado para historias móviles con tarjeta flotante translúcida al centro.',
    category: 'Redes Sociales',
    badgeText: 'Stories 9:16',
    badgeBg: '#9333ea',
    layoutType: 'story-instagram',
    defaultSettings: {
      primaryColor: '#9333ea',
      secondaryColor: '#0f0728',
      titleColor: '#ffffff',
      lineColor: '#a855f7',
      fontFamily: "'Poppins', sans-serif",
      fontWeight: '700',
      panelBgType: 'gradient',
      panelColor: '#1e1b4b',
      panelGradientStart: '#312e81',
      panelGradientEnd: '#0f172a',
      panelGradientType: 'vertical',
      panelOpacity: 85,
      panelPadding: 24,
      panelRadius: 24,
      panelShadow: '2xl',
      logoPosition: 'top-left',
      showWebsite: true,
      websiteAlign: 'center',
      isLightMode: false,
    },
  },
  {
    id: 'tv-news',
    name: 'Informativo Institucional',
    description: 'Placa con zócalo limpio e indicador de difusión periodística directa.',
    category: 'Prensa General',
    badgeText: 'Informativo',
    badgeBg: '#2563eb',
    layoutType: 'tv-news',
    defaultSettings: {
      primaryColor: '#2563eb',
      secondaryColor: '#030712',
      titleColor: '#ffffff',
      lineColor: '#38bdf8',
      fontFamily: "'Montserrat', sans-serif",
      fontWeight: '800',
      panelBgType: 'solid',
      panelColor: '#030712',
      panelGradientStart: '#0f172a',
      panelGradientEnd: '#0284c7',
      panelGradientType: 'horizontal',
      panelOpacity: 95,
      panelPadding: 18,
      panelRadius: 4,
      panelShadow: 'md',
      logoPosition: 'top-left',
      showWebsite: true,
      websiteAlign: 'right',
      isLightMode: false,
    },
  },
  {
    id: 'carrusel',
    name: 'Carrusel Multi-Slide',
    description: 'Secuencia narrativa para publicaciones multidesglose de noticias y artículos extensos.',
    category: 'Redes Sociales',
    badgeText: 'Carrusel 1/3',
    badgeBg: '#7c3aed',
    layoutType: 'carrusel',
    defaultSettings: {
      primaryColor: '#7c3aed',
      secondaryColor: '#1e1b4b',
      titleColor: '#ffffff',
      lineColor: '#a78bfa',
      fontFamily: "'Montserrat', sans-serif",
      fontWeight: '700',
      panelBgType: 'gradient',
      panelColor: '#2e1065',
      panelGradientStart: '#3b0764',
      panelGradientEnd: '#1e1b4b',
      panelGradientType: 'radial',
      panelOpacity: 90,
      panelPadding: 24,
      panelRadius: 16,
      panelShadow: 'lg',
      logoPosition: 'top-left',
      showWebsite: true,
      websiteAlign: 'center',
      isLightMode: false,
    },
  },
];
