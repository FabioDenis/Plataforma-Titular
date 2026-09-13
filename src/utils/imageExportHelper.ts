import { toCanvas } from 'html-to-image';

/**
 * Converts any image URL (remote, CORS-blocked, or local) into a base64 Data URL.
 * Attempts direct CORS fetch first; falls back to the server-side proxy (/api/proxy-image)
 * to guarantee CORS compatibility without modifying or removing the image.
 */
export async function toSafeDataUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return imageUrl;
  }

  // 1. Try direct fetch in browser
  try {
    const directRes = await fetch(imageUrl, { mode: 'cors' });
    if (directRes.ok) {
      const blob = await directRes.blob();
      return await blobToDataUrl(blob);
    }
  } catch {
    // Direct fetch failed (e.g. CORS restrictions on third-party news domain)
  }

  // 2. Fallback to server-side proxy
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const blob = await proxyRes.blob();
      return await blobToDataUrl(blob);
    }
  } catch (proxyErr) {
    console.warn('[imageExportHelper] Proxy fetch failed for image:', imageUrl, proxyErr);
  }

  // If all fails, return the original URL so the pipeline can still proceed
  return imageUrl;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ExportCardOptions {
  cardElement: HTMLDivElement;
  targetWidth: number;
  targetHeight: number;
}

/**
 * Exports a DOM node (the card canvas) as a high-resolution PNG with exact target dimensions.
 * Handles fonts, CORS images, and canvas scaling cleanly.
 */
export async function exportCardToExactPng({
  cardElement,
  targetWidth,
  targetHeight,
}: ExportCardOptions): Promise<string> {
  if (!cardElement) {
    throw new Error('Elemento de tarjeta no encontrado para exportar.');
  }

  // 1. Ensure all custom fonts are completely ready before rendering
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (fontErr) {
      console.warn('[imageExportHelper] Wait for document.fonts.ready warning:', fontErr);
    }
  }

  // 2. Locate all <img> tags inside the card and convert remote ones to Data URLs
  const imgElements = Array.from(cardElement.querySelectorAll('img'));
  const originalSrcs: { el: HTMLImageElement; original: string }[] = [];

  try {
    await Promise.all(
      imgElements.map(async (img) => {
        const currentSrc = img.src;
        if (currentSrc && !currentSrc.startsWith('data:')) {
          originalSrcs.push({ el: img, original: currentSrc });
          try {
            const dataUrl = await toSafeDataUrl(currentSrc);
            if (dataUrl && dataUrl.startsWith('data:')) {
              img.src = dataUrl;
              // Wait for image decode with new data URL
              if (img.decode) {
                try {
                  await img.decode();
                } catch {
                  // decode failed or unsupported, ignore
                }
              }
            }
          } catch (err) {
            console.warn('[imageExportHelper] Error converting image src to data URL:', err);
          }
        }
      })
    );

    // Brief tick to allow DOM repaint with inlined Data URLs
    await new Promise((resolve) => setTimeout(resolve, 60));

    // 3. Calculate pixel ratio based on card width
    const currentWidth = cardElement.clientWidth || cardElement.offsetWidth || 400;
    const scaleRatio = targetWidth / currentWidth;

    // 4. Render to intermediate canvas using html-to-image toCanvas
    const intermediateCanvas = await toCanvas(cardElement, {
      pixelRatio: scaleRatio,
      skipFonts: true, // Uses browser's already loaded web fonts, avoiding CORS font stylesheet failures
      cacheBust: false,
      quality: 1,
      // Provide fallback so broken nested images never reject the render promise
      onImageErrorHandler: () => {
        console.warn('[imageExportHelper] Non-fatal image render error handled.');
      },
    });

    // 5. Create final canvas with EXACT requested pixel dimensions (e.g., 1080x1350)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;

    const ctx = finalCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo inicializar el contexto del lienzo de exportación.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(intermediateCanvas, 0, 0, targetWidth, targetHeight);

    return finalCanvas.toDataURL('image/png', 1.0);
  } finally {
    // 6. Always restore original image sources so live DOM preview is unaffected
    originalSrcs.forEach(({ el, original }) => {
      try {
        el.src = original;
      } catch {
        // ignore
      }
    });
  }
}
