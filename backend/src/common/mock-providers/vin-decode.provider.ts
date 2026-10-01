import { Injectable, Logger } from '@nestjs/common';
import { isMockMode } from './provider-mode';

@Injectable()
export class VinDecodeProvider {
  private readonly logger = new Logger('VinDecodeProvider(MOCK)');

  async decode(vin: string): Promise<{ make: string; model: string; year: number; trim: string; estimatedValueCents: number; MOCKED: boolean }> {
    if (isMockMode('VIN_DECODE_MODE')) {
      this.logger.warn(`MOCKED VIN decode for ${vin} — no live VIN database configured`);
      return { make: 'Toyota', model: 'Camry', year: 2022, trim: 'SE', estimatedValueCents: 2500000, MOCKED: true };
    }
    throw new Error('Live VIN decode provider not configured.');
  }
}
