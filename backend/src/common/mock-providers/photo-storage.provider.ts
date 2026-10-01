import { Injectable, Logger } from '@nestjs/common';
import { isMockMode } from './provider-mode';

/**
 * Addresses audit §3 Critical ("no photo field anywhere in schema or UI") and
 * §1 Critical ("no vehicle photography anywhere"). Follows the same
 * mock/live provider-mode pattern as VinDecodeProvider/CvDamageProvider: in
 * mock mode (default), an uploaded image is stored as a data: URI and handed
 * straight back as its own "url" — good enough to render immediately in the
 * browser with zero external dependencies, and a drop-in swap point for a
 * real object-store (S3/Cloudinary/etc.) in `live` mode, without any calling
 * code (the service/controller below) needing to change.
 */
@Injectable()
export class PhotoStorageProvider {
  private readonly logger = new Logger('PhotoStorageProvider(MOCK)');

  async store(base64: string, mimeType = 'image/jpeg'): Promise<{ url: string; MOCKED: boolean }> {
    if (isMockMode('PHOTO_STORAGE_MODE')) {
      this.logger.warn('MOCKED photo storage — storing as an inline data URI, no object store configured');
      const alreadyDataUri = base64.startsWith('data:');
      const url = alreadyDataUri ? base64 : `data:${mimeType};base64,${base64}`;
      return { url, MOCKED: true };
    }
    throw new Error('Live photo storage provider not configured.');
  }
}
