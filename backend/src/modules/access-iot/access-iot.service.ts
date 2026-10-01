import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { TelematicsProvider } from '../../common/mock-providers/telematics.provider';

@Injectable()
export class AccessIotService {
  constructor(private prisma: PrismaService, private events: EventBusService, private telematics: TelematicsProvider) {}

  async registerDevice(vehicleId: string, deviceType: string, vendorRef: string) {
    return this.prisma.accessDevice.create({
      data: { vehicleId, deviceType: deviceType as any, vendorRef, lastHeartbeatAt: new Date() },
    });
  }

  async getDeviceHealth(deviceId: string) {
    const device = await this.prisma.accessDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');
    return { ...device, online: device.lastHeartbeatAt ? Date.now() - device.lastHeartbeatAt.getTime() < 5 * 60_000 : false };
  }

  async issueKey(dto: { tripId: string; vehicleId: string; renterId: string; validFrom: string; validUntil: string; geofencePolygon?: any }) {
    const result = await this.telematics.issueDigitalKey(dto.vehicleId, dto.tripId);

    let geofenceId: string | undefined;
    if (dto.geofencePolygon) {
      const rule = await this.prisma.geofenceRule.create({
        data: { vehicleId: dto.vehicleId, tripId: dto.tripId, polygon: dto.geofencePolygon },
      });
      geofenceId = rule.id;
    }

    const key = await this.prisma.digitalKey.create({
      data: {
        tripId: dto.tripId,
        vehicleId: dto.vehicleId,
        renterId: dto.renterId,
        validFrom: new Date(dto.validFrom),
        validUntil: new Date(dto.validUntil),
        geofenceId,
        status: 'active',
        cryptoTokenRef: result.cryptoTokenRef,
      },
    });

    this.events.publish(EVT.ACCESS_KEY_ISSUED, { tripId: dto.tripId, vehicleId: dto.vehicleId, renterId: dto.renterId });
    return key;
  }

  async revokeKey(keyId: string) {
    const key = await this.prisma.digitalKey.findUnique({ where: { id: keyId } });
    if (!key) throw new NotFoundException('Digital key not found');
    await this.telematics.revokeDigitalKey(key.cryptoTokenRef);
    const updated = await this.prisma.digitalKey.update({ where: { id: keyId }, data: { status: 'revoked' } });
    this.events.publish(EVT.ACCESS_KEY_REVOKED, { tripId: key.tripId, vehicleId: key.vehicleId });
    return updated;
  }

  async getKey(keyId: string) {
    const key = await this.prisma.digitalKey.findUnique({ where: { id: keyId } });
    if (!key) throw new NotFoundException('Digital key not found');
    return key;
  }

  private assertKeyUsable(key: { renterId: string; status: string; validFrom: Date; validUntil: Date }, callerId: string) {
    if (key.renterId !== callerId) throw new ForbiddenException('Only the trip renter holding this key may issue access commands');
    if (key.status !== 'active') throw new BadRequestException(`Key is not active (status=${key.status})`);
    const now = new Date();
    if (now < key.validFrom || now > key.validUntil) throw new BadRequestException('Key is outside its valid time window');
  }

  async sendCommand(keyId: string, callerId: string, command: 'unlock' | 'lock' | 'start-ignition') {
    const key = await this.getKey(keyId);
    this.assertKeyUsable(key, callerId);
    return this.telematics.sendCommand(key.cryptoTokenRef, command);
  }

  /**
   * Remote immobilization is a last-resort safety control. Per the spec's auth
   * notes, this always requires an admin/support_agent-provided justification
   * and is never triggered directly by end users or a fully unattended job.
   */
  async immobilize(vehicleId: string, actorId: string, actorRole: string, justification: string) {
    if (!['admin', 'support_agent'].includes(actorRole)) {
      throw new ForbiddenException('Immobilization requires admin or support_agent sign-off');
    }
    if (!justification || justification.trim().length < 10) {
      throw new BadRequestException('A substantive justification is required to immobilize a vehicle');
    }
    this.events.publish(EVT.ACCESS_IMMOBILIZATION_REQUESTED, { vehicleId, actorId, justification, requestedAt: new Date() });
    const result = await this.telematics.immobilize(vehicleId);
    return { vehicleId, immobilized: true, actorId, justification, ...result };
  }

  async setGeofence(vehicleId: string, tripId: string, polygon: any, breachAction?: string) {
    return this.prisma.geofenceRule.create({
      data: { vehicleId, tripId, polygon, breachAction: (breachAction as any) ?? 'alert_only' },
    });
  }

  async getLocation(vehicleId: string) {
    return this.telematics.getLastKnownLocation(vehicleId);
  }

  /** Inbound webhook from the IoT/telematics vendor for tow/tamper/geofence/diagnostic events. */
  async handleTelematicsWebhook(vehicleId: string, eventType: string, payload: any) {
    const event = await this.prisma.telematicsEvent.create({
      data: { vehicleId, eventType: eventType as any, payload },
    });

    if (eventType === 'tamper_detected') this.events.publish(EVT.ACCESS_TAMPER_DETECTED, { vehicleId, eventId: event.id });
    if (eventType === 'geofence_breach') this.events.publish(EVT.ACCESS_GEOFENCE_BREACH, { vehicleId, eventId: event.id });

    return event;
  }
}
