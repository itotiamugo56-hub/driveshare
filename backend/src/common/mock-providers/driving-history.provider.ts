import { Injectable, Logger } from '@nestjs/common';
import { isMockMode } from './provider-mode';

export interface DrivingHistoryResult {
  violationCount: number;
  atFaultAccidentCount: number;
  suspensionFlag: boolean;
  riskTier: 'low' | 'medium' | 'high';
  MOCKED: boolean;
}

@Injectable()
export class DrivingHistoryProvider {
  private readonly logger = new Logger('DrivingHistoryProvider(MOCK)');

  async pullHistory(_userId: string, _consentTokenId: string): Promise<DrivingHistoryResult> {
    if (isMockMode('DRIVING_HISTORY_MODE')) {
      this.logger.warn('MOCKED driving history report — no live consumer data provider configured');
      return { violationCount: 0, atFaultAccidentCount: 0, suspensionFlag: false, riskTier: 'low', MOCKED: true };
    }
    throw new Error('Live driving history provider not configured.');
  }
}
