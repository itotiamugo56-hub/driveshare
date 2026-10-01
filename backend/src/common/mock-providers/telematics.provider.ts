import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { isMockMode } from './provider-mode';

@Injectable()
export class TelematicsProvider {
  private readonly logger = new Logger('TelematicsProvider(MOCK)');

  async issueDigitalKey(_vehicleId: string, _tripId: string): Promise<{ cryptoTokenRef: string; MOCKED: boolean }> {
    if (isMockMode('TELEMATICS_MODE')) {
      this.logger.warn('MOCKED digital key issuance — no live IoT/telematics vendor configured');
      return { cryptoTokenRef: `mock_key_${uuid()}`, MOCKED: true };
    }
    throw new Error('Live telematics/IoT vendor not configured.');
  }

  async revokeDigitalKey(_cryptoTokenRef: string): Promise<{ MOCKED: boolean }> {
    if (isMockMode('TELEMATICS_MODE')) {
      this.logger.warn('MOCKED digital key revocation');
      return { MOCKED: true };
    }
    throw new Error('Live telematics/IoT vendor not configured.');
  }

  async sendCommand(_cryptoTokenRef: string, command: 'unlock' | 'lock' | 'start-ignition'): Promise<{ MOCKED: boolean }> {
    if (isMockMode('TELEMATICS_MODE')) {
      this.logger.warn(`MOCKED IoT command dispatched: ${command}`);
      return { MOCKED: true };
    }
    throw new Error('Live telematics/IoT vendor not configured.');
  }

  async immobilize(_vehicleId: string): Promise<{ MOCKED: boolean }> {
    if (isMockMode('TELEMATICS_MODE')) {
      this.logger.warn('MOCKED remote immobilization command dispatched');
      return { MOCKED: true };
    }
    throw new Error('Live telematics/IoT vendor not configured.');
  }

  async getLastKnownLocation(_vehicleId: string): Promise<{ lat: number; lng: number; MOCKED: boolean }> {
    if (isMockMode('TELEMATICS_MODE')) {
      return { lat: 37.7749, lng: -122.4194, MOCKED: true };
    }
    throw new Error('Live telematics/IoT vendor not configured.');
  }
}
