import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventBusService } from '../../../common/event-bus/event-bus.service';
import { EVT } from '../../../common/enums';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService, private events: EventBusService, private audit: AdminAuditService) {}

  async flagItem(itemType: string, itemId: string, flaggedReason: string) {
    const item = await this.prisma.moderationQueueItem.create({
      data: { itemType: itemType as any, itemId, flaggedReason },
    });
    this.events.publish(EVT.ADMIN_MODERATION_ITEM_FLAGGED, { itemType, itemId });
    return item;
  }

  async getQueue(status = 'pending') {
    return this.prisma.moderationQueueItem.findMany({ where: { status: status as any }, orderBy: { createdAt: 'asc' } });
  }

  async resolveItem(actorId: string, queueItemId: string, status: 'approved' | 'removed', reason: string) {
    const item = await this.prisma.moderationQueueItem.findUnique({ where: { id: queueItemId } });
    if (!item) throw new NotFoundException('Moderation queue item not found');

    if (status === 'removed') {
      if (item.itemType === 'review') {
        // A moderator-removed review is force-hidden regardless of its blind-reveal state.
        await this.prisma.review.update({ where: { id: item.itemId }, data: { visibility: 'hidden_pending_counterpart' } }).catch(() => null);
      } else if (item.itemType === 'listing') {
        await this.prisma.listing.update({ where: { id: item.itemId }, data: { status: 'removed' } }).catch(() => null);
      }
    }

    const updated = await this.prisma.moderationQueueItem.update({
      where: { id: queueItemId },
      data: { status: status as any, resolvedBy: actorId, resolvedAt: new Date() },
    });
    await this.audit.log(actorId, 'support_agent', `moderation_${status}`, item.itemType, item.itemId, reason);
    this.events.publish(EVT.ADMIN_MODERATION_ITEM_RESOLVED, { itemType: item.itemType, itemId: item.itemId, status });
    return updated;
  }

  /** Fraud-case triage queue — a management-friendly view over Section 7's FraudCase records. */
  async fraudTriageQueue() {
    return this.prisma.fraudCase.findMany({ where: { status: { in: ['open', 'under_review'] } }, orderBy: { createdAt: 'asc' } });
  }

  /** Dispute mediator workbench — every open mediator-tier dispute across the platform in one view. */
  async disputeMediatorWorkbench() {
    return this.prisma.disputeCase.findMany({
      where: { tier: 'mediator_review', status: 'open' },
      include: { evidenceItems: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
