import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { EventDataFeedProvider } from '../../common/mock-providers/event-data-feed.provider';
import { IdleRecommendation } from '@prisma/client';

const PLATFORM_FEE_BPS = 1500; // 15%

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService, private events: EventBusService, private eventFeed: EventDataFeedProvider) {}

  async getSuggestion(listingId: string, region = 'default') {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');

    const [comparableAvg, demandEvents] = await Promise.all([
      this.getComparablesAverage(region),
      this.eventFeed.getLocalDemandEvents(region),
    ]);

    let demandLift = 1.0;
    for (const evt of demandEvents.events) demandLift += evt.demandLift;

    const suggestedPriceCents = Math.round(((comparableAvg || listing.basePriceCents) * demandLift));
    const factorsUsed = { comparableAvg, demandEventsCount: demandEvents.events.length, demandLift, MOCKED: demandEvents.MOCKED };

    const suggestion = await this.prisma.priceSuggestion.create({
      data: { listingId, suggestedPriceCents, factorsUsed, validUntil: new Date(Date.now() + 6 * 60 * 60 * 1000) },
    });
    this.events.publish(EVT.PRICING_SUGGESTION_GENERATED, { listingId, suggestedPriceCents });
    return suggestion;
  }

  private async getComparablesAverage(_region: string) {
    const result = await this.prisma.listing.aggregate({ _avg: { basePriceCents: true }, where: { status: 'active' } });
    return result._avg.basePriceCents ?? 0;
  }

  async getComparables(region: string, vehicleClass?: string) {
    // Simplified: returns active listings as "comparables" for the demo; production
    // would filter/rank by geo-radius and vehicle-class similarity via a search index.
    void region;
    void vehicleClass;
    return this.prisma.listing.findMany({ where: { status: 'active' }, take: 20 });
  }

  async getEarningsBreakdown(tripId: string, grossTripPriceCents: number) {
    const platformFee = Math.round((grossTripPriceCents * PLATFORM_FEE_BPS) / 10000);
    const insuranceCost = await this.prisma.insuranceQuote.findFirst({ where: { tripId }, orderBy: { createdAt: 'desc' } });
    const insuranceCents = insuranceCost?.quotedPriceCents ?? 0;
    const ownerNet = grossTripPriceCents - platformFee - insuranceCents;
    return { tripId, grossTripPriceCents, platformFeeCents: platformFee, insuranceCostCents: insuranceCents, ownerNetCents: ownerNet };
  }

  async getIdleRecommendations(ownerId: string) {
    const listings = await this.prisma.listing.findMany({ where: { ownerId, status: 'active' } });
    const recommendations: IdleRecommendation[] = [];
    for (const listing of listings) {
      const bookedDays = await this.prisma.availabilityCalendar.count({ where: { listingId: listing.id, status: 'booked' } });
      const totalDays = await this.prisma.availabilityCalendar.count({ where: { listingId: listing.id } });
      const utilization = totalDays > 0 ? bookedDays / totalDays : 0;
      if (utilization < 0.3) {
        const rec = await this.prisma.idleRecommendation.create({
          data: {
            listingId: listing.id,
            recommendationType: utilization < 0.1 ? 'lower_price' : 'enable_delivery',
            projectedImpact: { currentUtilization: utilization, projectedBookingLift: 0.25 },
          },
        });
        recommendations.push(rec);
        this.events.publish(EVT.PRICING_IDLE_RECOMMENDATION_CREATED, { listingId: listing.id });
      }
    }
    return recommendations;
  }

  async getCancellationRisk(tripId: string) {
    // Simplified heuristic risk model standing in for a trained classifier.
    const existing = await this.prisma.cancellationRiskScore.findUnique({ where: { tripId } });
    if (existing) return existing;
    const riskScore = Math.random() * 0.3; // placeholder baseline risk
    const mitigationSuggested = riskScore > 0.2 ? 'offer_backup_vehicle' : 'none';
    return this.prisma.cancellationRiskScore.create({ data: { tripId, riskScore, mitigationSuggested } });
  }

  async setSurgeCap(marketRegion: string, maxMultiplier: number) {
    return this.prisma.surgeCapPolicy.upsert({
      where: { marketRegion },
      update: { maxMultiplier },
      create: { marketRegion, maxMultiplier },
    });
  }

  async getSurgeCap(marketRegion: string) {
    const cap = await this.prisma.surgeCapPolicy.findUnique({ where: { marketRegion } });
    return cap ?? { marketRegion, maxMultiplier: 2.0 };
  }
}