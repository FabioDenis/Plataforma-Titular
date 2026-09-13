import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getOptionalServerEnv } from '../../config/env';

interface StoredMediaItem {
  id: string;
  buffer: Buffer;
  contentType: string;
  createdAt: number;
}

// In-memory cache for fast access
const memoryMediaCache = new Map<string, StoredMediaItem>();

// Fallback disk cache directory
const CACHE_DIR = path.join(process.cwd(), '.media_cache');
try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  // Read-only filesystem fallback
}

/**
 * Stores an image buffer or base64 data and returns a unique public media ID and URL
 */
export async function storeMediaForMeta(
  dataOrUrl: string,
  contentType = 'image/png'
): Promise<{ mediaId: string; publicUrl: string }> {
  // If it is already an external public HTTPS URL (and not a local blob/base64), we can return it directly
  if (dataOrUrl.startsWith('https://') && !dataOrUrl.includes('localhost') && !dataOrUrl.includes('127.0.0.1')) {
    const id = crypto.createHash('md5').update(dataOrUrl).digest('hex');
    return {
      mediaId: id,
      publicUrl: dataOrUrl,
    };
  }

  let buffer: Buffer;
  let detectedType = contentType;

  if (dataOrUrl.startsWith('data:')) {
    const matches = dataOrUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      detectedType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(dataOrUrl, 'base64');
    }
  } else {
    buffer = Buffer.from(dataOrUrl, 'base64');
  }

  const mediaId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();

  // Save to memory
  memoryMediaCache.set(mediaId, {
    id: mediaId,
    buffer,
    contentType: detectedType,
    createdAt: now,
  });

  // Try to write to disk cache
  try {
    const ext = detectedType.includes('jpeg') || detectedType.includes('jpg') ? '.jpg' : '.png';
    const filePath = path.join(CACHE_DIR, `${mediaId}${ext}`);
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    // Memory cache remains available
  }

  const appUrl = getOptionalServerEnv('APP_URL').replace(/\/$/, '');
  const publicUrl = appUrl
    ? `${appUrl}/api/media/render/${mediaId}`
    : `/api/media/render/${mediaId}`;

  return { mediaId, publicUrl };
}

/**
 * Retrieves stored media by ID
 */
export function getStoredMedia(mediaId: string): { buffer: Buffer; contentType: string } | null {
  // 1. Check memory cache
  const item = memoryMediaCache.get(mediaId);
  if (item) {
    return { buffer: item.buffer, contentType: item.contentType };
  }

  // 2. Check disk cache
  try {
    const pngPath = path.join(CACHE_DIR, `${mediaId}.png`);
    if (fs.existsSync(pngPath)) {
      return { buffer: fs.readFileSync(pngPath), contentType: 'image/png' };
    }
    const jpgPath = path.join(CACHE_DIR, `${mediaId}.jpg`);
    if (fs.existsSync(jpgPath)) {
      return { buffer: fs.readFileSync(jpgPath), contentType: 'image/jpeg' };
    }
  } catch (e) {
    // Disk read error
  }

  return null;
}

// Cleanup media older than 24 hours every hour
const mediaCleanupTimer = setInterval(() => {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, item] of memoryMediaCache.entries()) {
    if (item.createdAt < oneDayAgo) {
      memoryMediaCache.delete(id);
    }
  }
}, 60 * 60 * 1000);
mediaCleanupTimer.unref();
