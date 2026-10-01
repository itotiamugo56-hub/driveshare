import { Injectable, Logger } from '@nestjs/common';
import { isMockMode } from './provider-mode';

export interface DmvValidationResult {
  status: 'valid' | 'invalid' | 'suspended' | 'unknown';
  MOCKED: boolean;
}

@Injectable()
export class DmvProvider {
  private readonly logger = new Logger('DmvProvider(MOCK)');

  async validateLicense(_licenseNumber: string, _issuingRegion: string): Promise<DmvValidationResult> {
    if (isMockMode('DMV_MODE')) {
      this.logger.warn('MOCKED DMV validation — no live per-region DMV data provider configured');
      return { status: 'valid', MOCKED: true };
    }
    throw new Error('Live DMV data provider not configured for this region.');
  }
}
