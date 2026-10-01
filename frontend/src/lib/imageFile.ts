/**
 * Reads a browser `File` into the raw base64 payload `AddVehiclePhotoDto.photoBase64`
 * expects (no `data:mime;base64,` prefix — `PhotoStorageProvider` in mock mode adds
 * that prefix itself when it is missing).
 */
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(',', 2);
      resolve({ base64: base64 ?? result, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
