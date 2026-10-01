import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { isMockMode } from './provider-mode';

export interface IdVerificationResult {
  vendorRef: string;
  livenessScore: number;
  documentAuthentic: boolean;
  MOCKED: boolean;
}

@Injectable()
export class IdVerificationProvider {
  private readonly logger = new Logger('IdVerificationProvider(MOCK)');

  async verifyDocument(_documentTokenRef: string): Promise<IdVerificationResult> {
    if (isMockMode('ID_VERIFICATION_MODE')) {
      this.logger.warn('MOCKED response — no live ID verification vendor configured');
      return { vendorRef: `mock_idv_${uuid()}`, livenessScore: 0.97, documentAuthentic: true, MOCKED: true };
    }
    throw new Error('Live ID verification vendor not configured. Set ID_VERIFICATION_MODE=live and implement the vendor SDK call here.');
  }

  async submitLiveness(_verificationId: string): Promise<{ livenessScore: number; MOCKED: boolean }> {
    if (isMockMode('ID_VERIFICATION_MODE')) {
      this.logger.warn('MOCKED liveness check');
      return { livenessScore: 0.95, MOCKED: true };
    }
    throw new Error('Live liveness vendor not configured.');
  }
}
