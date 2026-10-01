import { fileToBase64 } from './imageFile';

const MAX_SIDE = 1600;

/** Shrinks a phone photo (often 5 to 12 MB) to about 1600px JPEG before upload. Falls back to the original if the browser can't. */
export async function prepareImage(file: File): Promise<{ base64: string; mimeType: string }> {
  try {
    if (typeof createImageBitmap !== 'function' || file.size < 400_000) return await fileToBase64(file);
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
  } catch {
    return fileToBase64(file);
  }
}
