import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { isMockMode } from './provider-mode';

/**
 * Stands in for a cloud KMS/HSM envelope-encryption service, used exclusively
 * by the Data Security & Compliance module (Section 5) — no other service
 * is permitted to call this directly.
 */
@Injectable()
export class KmsProvider {
  private readonly logger = new Logger('KmsProvider(MOCK)');

  async encrypt(plaintext: string): Promise<{ ciphertext: string; kmsKeyId: string; MOCKED: boolean }> {
    if (isMockMode('KMS_MODE')) {
      this.logger.warn('MOCKED envelope encryption — no live KMS/HSM configured');
      // NOT real encryption. Base64 only, clearly a placeholder for local dev.
      const ciphertext = Buffer.from(plaintext).toString('base64');
      return { ciphertext, kmsKeyId: `mock_kms_key_${uuid()}`, MOCKED: true };
    }
    throw new Error('Live KMS provider not configured.');
  }

  async decrypt(ciphertext: string, _kmsKeyId: string): Promise<{ plaintext: string; MOCKED: boolean }> {
    if (isMockMode('KMS_MODE')) {
      return { plaintext: Buffer.from(ciphertext, 'base64').toString('utf-8'), MOCKED: true };
    }
    throw new Error('Live KMS provider not configured.');
  }
}
