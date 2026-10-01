import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { FleetRedistributionSuggestion, Listing } from '@prisma/client';

@Injectable()
export class LogisticsService {
  constructor(private prisma: PrismaService, private events: EventBusService) {}

  async requestDelivery(tripId: string, dropoffLocation: any, feeCents: number) {
    return this.prisma.deliveryRequest.create({
      data: { tripId, dropoffLocation, feeCents, status: 'requested' },
    });
  }

  async getDeliveryRequest(requestId: string) {
    const req = await this.prisma.deliveryRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Delivery request not found');
    return req;
  }

  async assignDelivery(requestId: string, assignedTo: string) {
    const updated = await this.prisma.deliveryRequest.update({
      where: { id: requestId },
      data: { assignedTo: assignedTo as any, status: 'assigned' },
    });
    this.events.publish(EVT.LOGISTICS_DELIVERY_ASSIGNED, { requestId, assignedTo });
    return updated;
  }

  /** [INFERRED] Suggests relocating underused vehicles toward higher-demand zones. */
  async getRedistributionSuggestions(ownerId: string) {
    const vehicles = await this.prisma.vehicle.findMany({ where: { ownerId } });
    const suggestions: FleetRedistributionSuggestion[] = [];
    for (const vehicle of vehicles) {
      const demandHeatmapScore = Math.random(); // placeholder for a real geo-demand heatmap query
      if (demandHeatmapScore > 0.6) {
        const suggestion = await this.prisma.fleetRedistributionSuggestion.create({
          data: {
            vehicleId: vehicle.id,
            suggestedZone: { lat: 37.77 + Math.random() * 0.1, lng: -122.41 + Math.random() * 0.1 },
            demandHeatmapScore,
          },
        });
        suggestions.push(suggestion);
      }
    }
    return suggestions;
  }

  async bulkCreateListings(ownerId: string, listings: { vehicleId: string; basePriceCents: number }[]) {
    // All-or-nothing ownership validation across the whole batch (Section 11.4 auth note)
    // before applying any update, to prevent partial-fleet privilege escalation.
    const vehicles = await this.prisma.vehicle.findMany({ where: { id: { in: listings.map((l) => l.vehicleId) } } });
    const notOwned = vehicles.filter((v) => v.ownerId !== ownerId);
    if (notOwned.length > 0) {
      throw new ForbiddenException(`Caller does not own all vehicles in the batch: ${notOwned.map((v) => v.id).join(', ')}`);
    }
    const created: Listing[] = [];
    for (const l of listings) {
      const listing = await this.prisma.listing.create({
        data: { vehicleId: l.vehicleId, ownerId, basePriceCents: l.basePriceCents, status: 'draft' },
      });
      created.push(listing);
    }
    return created;
  }

  async syncCalendar(ownerId: string) {
    const listings = await this.prisma.listing.findMany({ where: { ownerId } });
    this.events.publish(EVT.CALENDAR_UPDATED, { ownerId, listingCount: listings.length, syncedAt: new Date() });
    return { synced: listings.length };
  }

  async createMaintenanceHold(dto: { vehicleId: string; reason: string; startDate: string; endDate: string; triggeringDiagnosticCode?: string }) {
    const hold = await this.prisma.maintenanceHold.create({
      data: {
        vehicleId: dto.vehicleId,
        reason: dto.reason as any,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        triggeringDiagnosticCode: dto.triggeringDiagnosticCode,
      },
    });
    this.events.publish(EVT.LOGISTICS_MAINTENANCE_HOLD_CREATED, { vehicleId: dto.vehicleId, holdId: hold.id });
    return hold;
  }
}