export type PanelBackgroundType = 'solid' | 'gradient' | 'translucent' | 'none';
export type LogoSize = 'small' | 'medium' | 'large' | 'xlarge';

const DEFAULT_PANEL_RGB = '9, 13, 22';
const LOGO_HEIGHTS: Record<LogoSize, number> = { small: 38, medium: 52, large: 72, xlarge: 96 };
/** Widest a logo may get relative to its height, so wide logos grow with the selected size. */
const LOGO_MAX_ASPECT = 3;
const MIN_LOGO_HEIGHT = 24;

function hexToRgb(color: string | undefined): string {
  const hex = (color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return DEFAULT_PANEL_RGB;
  return [0, 2, 4].map((i) => parseInt(hex.substring(i, i + 2), 16)).join(', ');
}

/** CSS background of the content panel; the opacity applies to every background type. */
export function getPanelBackground(type: PanelBackgroundType | undefined, color: string | undefined, opacityPercent: number | undefined): string {
  const bgType = type || 'translucent';
  if (bgType === 'none') return 'transparent';
  const rgb = hexToRgb(color);
  const alpha = Math.min(100, Math.max(0, opacityPercent ?? 90)) / 100;
  if (bgType === 'gradient') return `linear-gradient(to top, rgba(${rgb}, ${alpha}), rgba(${rgb}, 0))`;
  return `rgba(${rgb}, ${alpha})`;
}

/** Height and width budget of the logo; `scale` shrinks it for compact spots like the footer. */
export function getLogoBox(size: LogoSize | undefined, scale = 1): { height: number; maxWidth: number } {
  const height = Math.max(MIN_LOGO_HEIGHT, Math.round(LOGO_HEIGHTS[size || 'medium'] * scale));
  return { height, maxWidth: height * LOGO_MAX_ASPECT };
}
