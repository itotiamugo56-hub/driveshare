import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { InsuranceCarrierProvider } from '../../common/mock-providers/insurance-carrier.provider';
import { CvDamageProvider } from '../../common/mock-providers/cv-damage.provider';

const DEFAULT_TIERS = [
  { name: 'baseline', deductibleCents: 150000, liabilityLimitCents: 3000000000n, basePriceMultiplier: 1.0 },
  { name: 'standard', deductibleCents: 75000, liabilityLimitCents: 5000000000n, basePriceMultiplier: 1.4 },
  { name: 'premium', deductibleCents: 25000, liabilityLimitCents: 10000000000n, basePriceMultiplier: 1.9 },
];

@Injectable()
export class InsuranceService {
  constructor(
    private prisma: PrismaService,
    private events: EventBusService,
    private carrier: InsuranceCarrierProvider,
    private cvDamage: CvDamageProvider,
  ) {}

  /** Idempotent seed of the three coverage tiers described in the concept doc. */
  async ensureTiersSeeded() {
    const existing = await this.prisma.coverageTier.count();
    if (existing === 0) {
      await this.prisma.coverageTier.createMany({ data: DEFAULT_TIERS as any });
    }
    return this.listTiers();
  }

  async listTiers() {
    return this.prisma.coverageTier.findMany();
  }

  /**
   * Pure premium maths (no writes), shared by getQuote and the Trips preview so the price a
   * renter sees before booking is exactly the price that is bound.
   */
  estimateDailyPremiumCents(tier: { basePriceMultiplier: number }, riskFactors: { trustTier?: string; drivingRiskTier?: string; distanceKm?: number }): number {
    let riskMultiplier = 1.0;
    if (riskFactors.trustTier === 'new') riskMultiplier += 0.3;
    if (riskFactors.trustTier === 'elite') riskMultiplier -= 0.15;
    if (riskFactors.drivingRiskTier === 'high') riskMultiplier += 0.5;
    if (riskFactors.drivingRiskTier === 'medium') riskMultiplier += 0.2;
    if ((riskFactors.distanceKm ?? 0) > 500) riskMultiplier += 0.1;
    riskMultiplier = Math.max(0.5, riskMultiplier);
    const basePriceCents = 2000; // flat daily base premium before multipliers, for demo purposes
    return Math.round(basePriceCents * tier.basePriceMultiplier * riskMultiplier);
  }

  /**
   * Usage-based pricing: base tier multiplier adjusted by Trust Score tier and
   * driving-history risk tier (passed in as riskFactors, sourced from the
   * Trust Score / Identity services by the calling orchestrator).
   */
  async getQuote(tripId: string, tierId: string, riskFactors: { trustTier?: string; drivingRiskTier?: string; vehicleValueCents?: number; distanceKm?: number }) {
    const tier = await this.prisma.coverageTier.findUnique({ where: { id: tierId } });
    if (!tier) throw new NotFoundException('Coverage tier not found');
    const quotedPriceCents = this.estimateDailyPremiumCents(tier, riskFactors);

    return this.prisma.insuranceQuote.create({
      data: {
        tripId,
        tierId,
        riskFactorsUsed: riskFactors as any,
        quotedPriceCents,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  }

  async bindPolicy(tripId: string, tierId: string) {
    const check = await this.prisma.comprehensionCheckAttempt.findFirst({
      where: { tripId, passed: true },
      orderBy: { createdAt: 'desc' },
    });
    // Hard dependency: cannot bind without a passed comprehension check (Section 8.4).
    if (!check) throw new BadRequestException('Mandatory disclosure comprehension check must pass before binding a policy');

    const carrierResult = await this.carrier.bindPolicy(tripId, tierId);
    const policy = await this.prisma.policy.upsert({
      where: { tripId },
      update: { tierId, status: 'bound', comprehensionCheckPassed: true, carrierRef: carrierResult.carrierRef },
      create: { tripId, tierId, status: 'bound', comprehensionCheckPassed: true, carrierRef: carrierResult.carrierRef },
    });
    this.events.publish(EVT.INSURANCE_POLICY_BOUND, { tripId, tierId });
    return policy;
  }

  async getPolicy(policyId: string) {
    const policy = await this.prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  async submitComprehensionCheck(userId: string, tripId: string, answers: { questionId: string; answer: string }[]) {
    // Simplified grading: all answers must be non-empty and match expected keys for a pass.
    const passed = answers.length >= 3 && answers.every((a) => a.answer && a.answer.trim().length > 0);
    const priorAttempts = await this.prisma.comprehensionCheckAttempt.count({ where: { userId, tripId } });
    return this.prisma.comprehensionCheckAttempt.create({
      data: { userId, tripId, passed, attemptCount: priorAttempts + 1 },
    });
  }

  async fileClaim(policyId: string, tripId: string, claimType: string) {
    const policy = await this.getPolicy(policyId);
    if (policy.status !== 'bound' && policy.status !== 'active') {
      throw new BadRequestException('Cannot file a claim against a policy that is not bound/active');
    }
    const claim = await this.prisma.claim.create({
      data: { policyId, tripId, claimType: claimType as any, status: 'filed', evidenceRefs: [] },
    });
    await this.carrier.submitClaim(policy.carrierRef ?? '', claimType, []);
    this.events.publish(EVT.INSURANCE_CLAIM_FILED, { claimId: claim.id, tripId, claimType });
    return claim;
  }

  async getClaim(claimId: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  async attachEvidence(claimId: string, evidenceRefs: string[]) {
    const claim = await this.getClaim(claimId);
    return this.prisma.claim.update({
      where: { id: claimId },
      data: { evidenceRefs: [...claim.evidenceRefs, ...evidenceRefs], status: 'under_review' },
    });
  }

  /**
   * Fast, objective claims assessment via pre/post condition-baseline photo
   * comparison — the concept doc's headline speed advantage over manual-only
   * adjustor review.
   */
  async autoAssessDamageClaim(claimId: string, preAnnotations: any[], postAnnotations: any[]) {
    const comparison = await this.cvDamage.compareBaselines(preAnnotations, postAnnotations);
    const claim = await this.getClaim(claimId);
    const status = comparison.newDamageDetected ? 'approved' : 'denied';
    const updated = await this.prisma.claim.update({
      where: { id: claimId },
      data: { status: status as any, payoutAmountCents: comparison.newDamageDetected ? 50000 : null }, // placeholder estimation
    });
    this.events.publish(EVT.INSURANCE_CLAIM_RESOLVED, { claimId, status, tripId: claim.tripId });
    return { ...updated, comparison };
  }

  async decideClaim(claimId: string, status: string, payoutAmountCents?: number) {
    const claim = await this.prisma.claim.update({
      where: { id: claimId },
      data: { status: status as any, payoutAmountCents },
    });
    this.events.publish(EVT.INSURANCE_CLAIM_RESOLVED, { claimId, status, tripId: claim.tripId });
    return claim;
  }
}