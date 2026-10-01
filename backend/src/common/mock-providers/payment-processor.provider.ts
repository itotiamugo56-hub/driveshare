import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { isMockMode } from './provider-mode';

@Injectable()
export class PaymentProcessorProvider {
  private readonly logger = new Logger('PaymentProcessorProvider(MOCK)');

  async vaultPaymentMethod(rawDetails: unknown): Promise<{ processorToken: string; brand?: string; last4?: string; MOCKED: boolean }> {
    if (isMockMode('PAYMENT_PROCESSOR_MODE')) {
      this.logger.warn('MOCKED card vaulting — no live PCI-DSS processor configured');
      const details = (rawDetails ?? {}) as { brand?: string; last4?: string };
      return { processorToken: `mock_pm_${uuid()}`, brand: details.brand, last4: details.last4, MOCKED: true };
    }
    throw new Error('Live payment processor not configured.');
  }

  async authorize(_processorToken: string, amountCents: number): Promise<{ processorRef: string; MOCKED: boolean }> {
    if (isMockMode('PAYMENT_PROCESSOR_MODE')) {
      this.logger.warn(`MOCKED authorization for ${amountCents} cents`);
      return { processorRef: `mock_auth_${uuid()}`, MOCKED: true };
    }
    throw new Error('Live payment processor not configured.');
  }

  async capture(_processorRef: string): Promise<{ MOCKED: boolean }> {
    if (isMockMode('PAYMENT_PROCESSOR_MODE')) {
      this.logger.warn('MOCKED capture');
      return { MOCKED: true };
    }
    throw new Error('Live payment processor not configured.');
  }

  async void(_processorRef: string): Promise<{ MOCKED: boolean }> {
    if (isMockMode('PAYMENT_PROCESSOR_MODE')) {
      this.logger.warn('MOCKED void');
      return { MOCKED: true };
    }
    throw new Error('Live payment processor not configured.');
  }

  async payout(ownerId: string, amountCents: number): Promise<{ processorRef: string; MOCKED: boolean }> {
    if (isMockMode('PAYMENT_PROCESSOR_MODE')) {
      this.logger.warn(`MOCKED payout of ${amountCents} cents to owner ${ownerId}`);
      return { processorRef: `mock_payout_${uuid()}`, MOCKED: true };
    }
    throw new Error('Live payment processor payout rail not configured.');
  }

  async submitChargebackEvidence(_processorRef: string, _bundleRefs: string[]): Promise<{ MOCKED: boolean }> {
    if (isMockMode('PAYMENT_PROCESSOR_MODE')) {
      this.logger.warn('MOCKED chargeback evidence submission');
      return { MOCKED: true };
    }
    throw new Error('Live payment processor not configured.');
  }
}
