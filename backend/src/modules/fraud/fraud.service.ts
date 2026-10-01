import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { PaymentProcessorProvider } from '../../common/mock-providers/payment-processor.provider';

@Injectable()
export class FraudService {
  constructor(private prisma: PrismaService, private events: EventBusService, private processor: PaymentProcessorProvider) {}

  /**
   * Real-time risk gate invoked synchronously in the booking path.
   * Combines account-age, velocity, and value signals — deliberately simple
   * rule-based heuristics here standing in for the production ML risk model.
   */
  async evaluateBooking(userId: string, listingId: string, tripId: string, context: any = {}) {
    const [accountAge, recentBookings, riskEvals] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.riskEvaluation.count({
        where: { userId, subjectType: 'booking', evaluatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      this.prisma.riskEvaluation.count({ where: { userId, decision: 'block' } }),
    ]);

    const signals: Record<string, any> = {};
    let riskScore = 0;

    const isNewAccount = accountAge ? Date.now() - accountAge.createdAt.getTime() < 24 * 60 * 60 * 1000 : true;
    if (isNewAccount && context.highValueOrOneWay) {
      signals.newAccountHighValueTrip = true;
      riskScore += 0.4;
    }
    if (recentBookings > 5) {
      signals.bookingVelocitySpike = recentBookings;
      riskScore += 0.3;
    }
    if (riskEvals > 0) {
      signals.priorBlockedEvaluations = riskEvals;
      riskScore += 0.2;
    }
    if (context.ipGeoMismatchFlag) {
      signals.ipGeoMismatch = true;
      riskScore += 0.2;
    }

    riskScore = Math.min(1, riskScore);
    const decision = riskScore >= 0.7 ? 'block' : riskScore >= 0.4 ? 'review' : 'allow';

    const evaluation = await this.prisma.riskEvaluation.create({
      data: { subjectType: 'booking', subjectId: tripId, userId, riskScore, signals, decision: decision as any },
    });

    if (decision === 'block') {
      this.events.publish(EVT.FRAUD_BOOKING_BLOCKED, { userId, tripId, riskScore, signals });
      await this.prisma.fraudCase.create({
        data: { relatedUserIds: [userId], caseType: 'payment_fraud', status: 'open', evidenceRefs: [evaluation.id] },
      });
      this.events.publish(EVT.FRAUD_CASE_OPENED, { userId, tripId });
    }

    return evaluation;
  }

  async evaluateListing(listingId: string, ownerId: string) {
    const duplicateVin = await this.prisma.vehicle.count({
      where: { ownerId: { not: ownerId }, listings: { some: { id: listingId } } },
    });
    const riskScore = duplicateVin > 0 ? 0.6 : 0.05;
    const decision = riskScore >= 0.5 ? 'review' : 'allow';
    return this.prisma.riskEvaluation.create({
      data: { subjectType: 'listing', subjectId: listingId, riskScore, signals: { duplicateVinAcrossOwners: duplicateVin }, decision: decision as any },
    });
  }

  async submitDeviceSignal(userId: string, deviceFingerprint: string, behavioralBiometricScore = 0.9, ipGeoMismatchFlag = false) {
    return this.prisma.deviceSignal.create({
      data: { userId, deviceFingerprint, behavioralBiometricScore, ipGeoMismatchFlag },
    });
  }

  async getCase(caseId: string) {
    const fraudCase = await this.prisma.fraudCase.findUnique({ where: { id: caseId } });
    if (!fraudCase) throw new NotFoundException('Fraud case not found');
    return fraudCase;
  }

  async decideCase(caseId: string, status: string) {
    const updated = await this.prisma.fraudCase.update({
      where: { id: caseId },
      data: { status: status as any, resolvedAt: ['confirmed', 'dismissed'].includes(status) ? new Date() : null },
    });
    return updated;
  }

  async assembleChargebackEvidence(tripId: string, includedArtifacts: string[]) {
    const bundle = await this.prisma.chargebackEvidenceBundle.create({
      data: { tripId, includedArtifacts },
    });
    await this.processor.submitChargebackEvidence(tripId, includedArtifacts);
    const submitted = await this.prisma.chargebackEvidenceBundle.update({
      where: { id: bundle.id },
      data: { submittedToProcessor: true },
    });
    this.events.publish(EVT.FRAUD_CHARGEBACK_EVIDENCE_READY, { tripId, bundleId: bundle.id });
    return submitted;
  }

  async getChargebackBundle(bundleId: string) {
    const bundle = await this.prisma.chargebackEvidenceBundle.findUnique({ where: { id: bundleId } });
    if (!bundle) throw new NotFoundException('Evidence bundle not found');
    return bundle;
  }

  /** [INFERRED] Link-analysis across accounts to catch multi-accounting/collusion rings. */
  async linkAnalysis(userIds: string[]) {
    const signals = await this.prisma.deviceSignal.findMany({ where: { userId: { in: userIds } } });
    const fingerprintCounts = new Map<string, Set<string>>();
    for (const s of signals) {
      if (!fingerprintCounts.has(s.deviceFingerprint)) fingerprintCounts.set(s.deviceFingerprint, new Set());
      fingerprintCounts.get(s.deviceFingerprint)!.add(s.userId);
    }
    const sharedDevices = [...fingerprintCounts.entries()].filter(([, users]) => users.size > 1);
    if (sharedDevices.length > 0) {
      const linkedUserIds = [...new Set(sharedDevices.flatMap(([, users]) => [...users]))];
      const fraudCase = await this.prisma.fraudCase.create({
        data: { relatedUserIds: linkedUserIds, caseType: 'collusion_ring', status: 'open', evidenceRefs: [] },
      });
      this.events.publish(EVT.FRAUD_CASE_OPENED, { linkedUserIds, caseId: fraudCase.id });
      return { linked: true, sharedDeviceCount: sharedDevices.length, caseId: fraudCase.id };
    }
    return { linked: false };
  }
}
