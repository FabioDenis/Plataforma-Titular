/**
 * Framing of the news photo inside the card.
 *
 * The photo is sized like `object-fit: cover` (times the zoom) and then moved inside the
 * card. Pan is expressed in -100..100 units of the overflow available on each axis, so:
 *   -  0 keeps the photo centered,
 *   - 100 puts its left/top edge on the card's left/top edge,
 *   - -100 puts its right/bottom edge on the card's right/bottom edge.
 * Because pan never exceeds the overflow, the photo always covers the whole card: no empty
 * gaps, whatever the zoom, the format or the preview/export size.
 */

export const PAN_LIMIT = 100;

export interface ImageFrameInput {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  /** 100 = cover size; 200 = twice as large. Values below 100 are treated as 100. */
  zoom: number;
  panX: number;
  panY: number;
}

export interface ImageFrame {
  width: number;
  height: number;
  left: number;
  top: number;
}

export const clampPan = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));
};

const offsetForAxis = (overflow: number, pan: number) =>
  -overflow / 2 + (clampPan(pan) / PAN_LIMIT) * (overflow / 2);

export const computeImageFrame = ({
  containerWidth,
  containerHeight,
  naturalWidth,
  naturalHeight,
  zoom,
  panX,
  panY,
}: ImageFrameInput): ImageFrame => {
  const zoomFactor = Math.max(1, (Number.isFinite(zoom) ? zoom : 100) / 100);
  const coverScale = Math.max(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const width = naturalWidth * coverScale * zoomFactor;
  const height = naturalHeight * coverScale * zoomFactor;
  const overflowX = Math.max(0, width - containerWidth);
  const overflowY = Math.max(0, height - containerHeight);

  return {
    width,
    height,
    left: offsetForAxis(overflowX, panX),
    top: offsetForAxis(overflowY, panY),
  };
};

/** Pan units equivalent to dragging `deltaPx` pixels when the photo overflows by `overflowPx`. */
export const panDeltaFromPixels = (deltaPx: number, overflowPx: number): number => {
  if (overflowPx <= 0) return 0;
  return (deltaPx / (overflowPx / 2)) * PAN_LIMIT;
};
