import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * EventBusService is the single seam through which all 12 services publish and
 * consume `evt.*` topics per the architecture spec's "event bus as integration
 * backbone" contract.
 *
 * Implementation note: this wraps @nestjs/event-emitter (in-process) so the whole
 * backend is runnable locally without a live Kafka cluster. In production, swap
 * the `publish`/`subscribe` internals for a KafkaJS producer/consumer without
 * touching any calling code — every module depends only on this interface.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger('EventBus');

  constructor(private readonly emitter: EventEmitter2) {}

  publish<T = any>(topic: string, payload: T): void {
    this.logger.log(`publish -> ${topic}`);
    this.emitter.emit(topic, payload);
  }

  subscribe<T = any>(topic: string, handler: (payload: T) => void | Promise<void>): void {
    this.emitter.on(topic, handler);
  }
}
