import { Injectable, Logger } from '@nestjs/common';
import { isMockMode } from './provider-mode';

@Injectable()
export class EventDataFeedProvider {
  private readonly logger = new Logger('EventDataFeedProvider(MOCK)');

  async getLocalDemandEvents(_region: string): Promise<{ events: { name: string; date: string; demandLift: number }[]; MOCKED: boolean }> {
    if (isMockMode('EVENT_DATA_FEED_MODE')) {
      this.logger.warn('MOCKED local event-data feed — no live events/demand provider configured');
      return { events: [], MOCKED: true };
    }
    throw new Error('Live event-data feed not configured.');
  }
}
