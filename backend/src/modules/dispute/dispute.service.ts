import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { CvDamageProvider } from '../../common/mock-providers/cv-damage.provider';
import { Prisma } from '@prisma/client';

@Injectable()
export class DisputeService {
  constructor(private prisma: PrismaService, private events: EventBusService, private cvDamage: CvDamageProvider) {}

  async fileDispute(tripId: string, filedByUserId: string, disputeType: string) {
    const dispute = await this.prisma.disputeCase.create({
      data: { tripId, filedByUserId, disputeType: disputeType as any, tier: 'auto_review', status: 'open' },
    });
    this.events.publish(EVT.DISPUTE_FILED, { disputeId: dispute.id, tripId });
    // Immediately attempt automated resolution before any human involvement.
    // autoResolveAttempt mutates the record (resolves or escalates it), so
    // re-read it afterwards rather than returning the pre-mutation snapshot.
    await this.autoResolveAttempt(dispute.id);
    return this.getDispute(dispute.id);
  }

  async getDispute(disputeId: string) {
    const dispute = await this.prisma.disputeCase.findUnique({
      where: { id: disputeId },
      include: { evidenceItems: true, mediatorDecisions: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }

  async addEvidence(disputeId: string, sourceType: string, refPointer: string, submittedByUserId?: string) {
    await this.getDispute(disputeId);
    return this.prisma.evidenceItem.create({
      data: { disputeId, sourceType, refPointer, submittedByUserId },
    });
  }

  /**
   * Automated resolution attempt: for `damage` disputes, compares pre/post
   * condition-baseline photos via computer vision. Clear-cut cases (no new
   * damage detected) auto-resolve without human involvement, per spec.
   */
  async autoResolveAttempt(disputeId: string) {
    const dispute = await this.getDispute(disputeId);
    if (dispute.disputeType !== 'damage') {
      // Only damage disputes have an automatable comparison in this reference implementation;
      // other types (mileage/late_return/billing) route straight to mediator review.
      return this.escalate(disputeId);
    }

    const [preBaseline, postBaseline] = await Promise.all([
      this.prisma.conditionBaseline.findFirst({ where: { tripId: dispute.tripId, type: 'pre_trip' } }),
      this.prisma.conditionBaseline.findFirst({ where: { tripId: dispute.tripId, type: 'post_trip' } }),
    ]);

    if (!preBaseline || !postBaseline) {
      return this.escalate(disputeId); // insufficient evidence for automated comparison
    }

    const comparison = await this.cvDamage.compareBaselines(
      preBaseline.aiDamageAnnotations as any,
      postBaseline.aiDamageAnnotations as any,
    );

    if (!comparison.newDamageDetected) {
      const resolved = await this.prisma.disputeCase.update({
        where: { id: disputeId },
        data: {
          status: 'resolved_auto',
          resolutionOutcome: { outcome: 'no_new_damage_found', comparison } as unknown as Prisma.InputJsonValue,
          resolvedAt: new Date(),
        },
      });
      this.events.publish(EVT.DISPUTE_AUTO_RESOLVED, { disputeId, tripId: dispute.tripId });
      this.events.publish(EVT.DISPUTE_RESOLVED, { disputeId, tripId: dispute.tripId, outcome: 'no_fault' });
      return resolved;
    }
    // New damage detected — ambiguous fault attribution, escalate to human mediator.
    return this.escalate(disputeId);
  }

  async escalate(disputeId: string) {
    const updated = await this.prisma.disputeCase.update({
      where: { id: disputeId },
      data: { tier: 'mediator_review' },
    });
    this.events.publish(EVT.DISPUTE_ESCALATED, { disputeId, tier: 'mediator_review' });
    return updated;
  }

  async recordMediatorDecision(disputeId: string, mediatorId: string, decisionSummary: string, resolutionOutcome?: any) {
    const dispute = await this.getDispute(disputeId);
    if (dispute.tier === 'arbitration') {
      throw new BadRequestException('Dispute already escalated to arbitration; mediator decisions no longer apply');
    }
    await this.prisma.mediatorDecision.create({ data: { disputeId, mediatorId, decisionSummary } });
    const resolved = await this.prisma.disputeCase.update({
      where: { id: disputeId },
      data: { status: 'resolved_mediator', resolutionOutcome, resolvedAt: new Date() },
    });
    this.events.publish(EVT.DISPUTE_RESOLVED, { disputeId, tripId: dispute.tripId, outcome: resolutionOutcome });
    return resolved;
  }

  async handoffToArbitration(disputeId: string) {
    const updated = await this.prisma.disputeCase.update({
      where: { id: disputeId },
      data: { tier: 'arbitration' },
    });
    this.events.publish(EVT.DISPUTE_ESCALATED, { disputeId, tier: 'arbitration' });
    return updated;
  }

  async getTimeline(disputeId: string) {
    return this.getDispute(disputeId);
  }
}