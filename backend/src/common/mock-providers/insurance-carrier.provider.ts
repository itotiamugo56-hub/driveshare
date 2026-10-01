import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { isMockMode } from './provider-mode';

@Injectable()
export class InsuranceCarrierProvider {
  private readonly logger = new Logger('InsuranceCarrierProvider(MOCK)');

  async bindPolicy(_tripId: string, _tierId: string): Promise<{ carrierRef: string; MOCKED: boolean }> {
    if (isMockMode('INSURANCE_CARRIER_MODE')) {
      this.logger.warn('MOCKED policy binding — no live carrier partner API configured');
      return { carrierRef: `mock_carrier_${uuid()}`, MOCKED: true };
    }
    throw new Error('Live insurance carrier not configured.');
  }

  async submitClaim(_carrierRef: string, _claimType: string, _evidenceRefs: string[]): Promise<{ carrierClaimRef: string; MOCKED: boolean }> {
    if (isMockMode('INSURANCE_CARRIER_MODE')) {
      this.logger.warn('MOCKED claim submission');
      return { carrierClaimRef: `mock_claim_${uuid()}`, MOCKED: true };
    }
    throw new Error('Live insurance carrier not configured.');
  }
}
