'use client';

/**
 * Client-side photo preparation.
 *
 * A modern phone camera produces a 12MP, 5MB JPEG. Downscaling before upload
 * keeps the request small, keeps the image-token cost sane, and still leaves
 * plenty of resolution to read a scorecard — Claude's high-resolution tier tops
 * out at 2576px on the long edge, so anything above that is wasted bytes.
 */

const MAX_EDGE = 2000;
const QUALITY = 0.85;

export interface PreparedImage {
  /** Full data URL, ready to render and to upload. */
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  approxBytes: number;
}

export async function prepareScorecardImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image. Take a photo or pick a screenshot.');
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That image could not be opened. Try a JPEG or PNG.');
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process the image on this device.');

  // White ground so a transparent PNG screenshot does not read as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);

  return {
    dataUrl,
    mimeType: 'image/jpeg',
    width,
    height,
    approxBytes: Math.round((base64Length * 3) / 4),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
