import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';

export interface WebsiteFooterProps {
  showWebsite?: boolean;
  websiteText: string;
  websiteColor?: string;
  websiteFontFamily?: string;
  websiteFontWeight?: string | number;
  websiteFontSize?: number;
  websiteAlign?: 'left' | 'center' | 'right';
  websiteMarginTop?: number;
  websiteMarginBottom?: number;
  websitePaddingX?: number;
  websiteLetterSpacing?: number;
  websiteTextTransform?: 'none' | 'uppercase' | 'lowercase';
  isLightMode?: boolean;
  fontFamily?: string;
  className?: string;
}

/**
 * COMPONENTE INDEPENDIENTE: WebsiteFooter (Pie de Página)
 * - Ancho 100% responsivo y sin recortar caracteres.
 * - Sin 'overflow: hidden', 'clip-path', 'mask' ni recortes automáticos.
 * - Calcula el ancho real disponible antes de renderizar y en reescalado.
 * - Ajusta dinámicamente letter-spacing y font-size hasta encajar cualquier dominio.
 */
export const WebsiteFooter: React.FC<WebsiteFooterProps> = ({
  showWebsite = true,
  websiteText,
  websiteColor,
  websiteFontFamily,
  websiteFontWeight = '800',
  websiteFontSize = 12,
  websiteAlign = 'left',
  websiteMarginTop = 2,
  websiteMarginBottom = 0,
  websitePaddingX = 0,
  websiteLetterSpacing = 1.5,
  websiteTextTransform = 'uppercase',
  isLightMode,
  fontFamily,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const [effectiveFontSize, setEffectiveFontSize] = useState<number>(websiteFontSize);
  const [effectiveLetterSpacing, setEffectiveLetterSpacing] = useState<number>(websiteLetterSpacing);

  const calculateAutoFit = () => {
    if (!containerRef.current || !textRef.current || !websiteText) return;

    // Ancho total disponible en el contenedor menos padding horizontal y margen de seguridad de 8px
    const safetyMargin = 8;
    const containerWidth = containerRef.current.clientWidth - (websitePaddingX * 2) - safetyMargin;
    if (containerWidth <= 0) return;

    let font = websiteFontSize;
    let spacing = websiteLetterSpacing;

    // Aplicar valores iniciales para medir con precisión
    textRef.current.style.fontSize = `${font}px`;
    textRef.current.style.letterSpacing = `${spacing}px`;

    let safety = 0;
    // Si el texto supera el ancho disponible, reducir letter spacing y luego font size
    while (textRef.current.scrollWidth > containerWidth && safety < 120) {
      if (spacing > 0) {
        spacing = Math.max(0, spacing - 0.2);
      } else if (font > 4) {
        font = Math.max(4, font - 0.25);
      } else {
        break;
      }
      textRef.current.style.fontSize = `${font}px`;
      textRef.current.style.letterSpacing = `${spacing}px`;
      safety++;
    }

    setEffectiveFontSize(font);
    setEffectiveLetterSpacing(spacing);
  };

  useLayoutEffect(() => {
    calculateAutoFit();
  }, [
    websiteText,
    websiteFontSize,
    websiteLetterSpacing,
    websiteFontFamily,
    websiteFontWeight,
    websiteTextTransform,
    websitePaddingX,
    websiteAlign,
    fontFamily,
    showWebsite,
  ]);

  // Observer para recalcular dinámicamente ante cualquier cambio de tamaño del layout
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      calculateAutoFit();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [websiteText, websiteFontSize, websiteLetterSpacing, websitePaddingX]);

  if (!showWebsite || !websiteText || websiteText.trim().length === 0) {
    return null;
  }

  const justifyAlignment =
    websiteAlign === 'center'
      ? 'center'
      : websiteAlign === 'right'
      ? 'flex-end'
      : 'flex-start';

  return (
    <div
      ref={containerRef}
      className={`website-footer-container ${className}`}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: justifyAlignment,
        marginTop: `${websiteMarginTop}px`,
        marginBottom: `${websiteMarginBottom}px`,
        paddingLeft: `${websitePaddingX}px`,
        paddingRight: `${websitePaddingX}px`,
      }}
    >
      <span
        ref={textRef}
        className="website-footer-domain inline-block drop-shadow-sm"
        style={{
          textAlign: websiteAlign,
          fontFamily: websiteFontFamily || fontFamily || 'inherit',
          fontWeight: websiteFontWeight || '800',
          fontSize: `${effectiveFontSize}px`,
          letterSpacing: `${effectiveLetterSpacing}px`,
          textTransform: websiteTextTransform,
          color: websiteColor || (isLightMode ? '#334155' : '#cbd5e1'),
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
        }}
      >
        {websiteText}
      </span>
    </div>
  );
};
