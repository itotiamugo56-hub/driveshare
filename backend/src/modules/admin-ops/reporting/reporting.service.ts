import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AdminAuditService } from '../admin-audit.service';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService, private audit: AdminAuditService) {}

  async revenueReport(startDate: string, endDate: string) {
    const entries = await this.prisma.transactionLedgerEntry.findMany({
      where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
    });
    const totalsByType: Record<string, number> = {};
    for (const e of entries) totalsByType[e.entryType] = (totalsByType[e.entryType] ?? 0) + e.amountCents;
    return { startDate, endDate, entryCount: entries.length, totalsByTypeCents: totalsByType };
  }

  async payoutReconciliation(startDate: string, endDate: string) {
    const payouts = await this.prisma.payout.findMany({
      where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
      orderBy: { createdAt: 'asc' },
    });
    const totalPaidCents = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);
    const totalFeeCents = payouts.reduce((s, p) => s + p.platformFeeCents, 0);
    return { startDate, endDate, payoutCount: payouts.length, totalPaidCents, totalPlatformFeeCents: totalFeeCents, payouts };
  }

  /** [INFERRED] Per-owner annual earnings export, a 1099-style regulatory reporting need for any real marketplace. */
  async ownerEarningsExport(ownerId: string, year: number) {
    const start = new Date(`${year}-01-01T00:00:00Z`);
    const end = new Date(`${year}-12-31T23:59:59Z`);
    const payouts = await this.prisma.payout.findMany({ where: { ownerId, status: 'paid', createdAt: { gte: start, lte: end } } });
    const totalEarningsCents = payouts.reduce((s, p) => s + p.amountCents, 0);
    return { ownerId, year, payoutCount: payouts.length, totalEarningsCents };
  }

  /** Usage-based insurance pricing audit trail — supports the regulatory-filing need called out in the concept doc. */
  async insurancePricingAuditTrail(tripId: string) {
    const quotes = await this.prisma.insuranceQuote.findMany({ where: { tripId }, orderBy: { createdAt: 'asc' } });
    const policy = await this.prisma.policy.findUnique({ where: { tripId } });
    return { tripId, quotes, boundPolicy: policy };
  }

  async gdprComplianceReport(startDate: string, endDate: string) {
    const requests = await this.prisma.dataLifecycleRequest.findMany({
      where: { createdAt: { gte: new Date(startDate), lte: new Date(endDate) } },
    });
    const byStatus: Record<string, number> = {};
    for (const r of requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const avgResolutionHours =
      requests.filter((r) => r.completedAt).reduce((s, r) => s + (r.completedAt!.getTime() - r.createdAt.getTime()), 0) /
        (requests.filter((r) => r.completedAt).length || 1) /
      (1000 * 60 * 60);
    return { startDate, endDate, requestCount: requests.length, byStatus, avgResolutionHours };
  }

  async queryAuditLog(filters: { actorId?: string; targetType?: string; targetId?: string; action?: string }) {
    return this.audit.query(filters);
  }
}
