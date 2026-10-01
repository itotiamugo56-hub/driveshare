import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { KmsProvider } from '../../common/mock-providers/kms.provider';

@Injectable()
export class SecurityComplianceService {
  constructor(private prisma: PrismaService, private events: EventBusService, private kms: KmsProvider) {}

  async tokenizeDocument(ownerUserId: string, documentClass: string, plaintextBase64: string) {
    const { ciphertext, kmsKeyId } = await this.kms.encrypt(plaintextBase64);
    const doc = await this.prisma.tokenizedDocument.create({
      data: { ownerUserId, documentClass: documentClass as any, encryptedBlobRef: ciphertext, kmsKeyId },
    });
    this.events.publish(EVT.SECURITY_DOCUMENT_TOKENIZED, { token: doc.token, ownerUserId, documentClass });
    return { token: doc.token };
  }

  /** Every read is audit-logged regardless of outcome, per the spec's Section 5 auth notes. */
  async readDocument(token: string, actorId: string, actorRole: string) {
    const doc = await this.prisma.tokenizedDocument.findUnique({ where: { token } });
    if (!doc) {
      await this.logAccess(actorId, actorRole, token, 'read');
      throw new NotFoundException('Document not found');
    }
    const isOwner = doc.ownerUserId === actorId;
    const isSupportOrAdmin = ['support_agent', 'admin'].includes(actorRole);
    await this.logAccess(actorId, actorRole, token, 'read');
    if (!isOwner && !isSupportOrAdmin) {
      throw new ForbiddenException('Not permitted to read this document');
    }
    const { plaintext } = await this.kms.decrypt(doc.encryptedBlobRef, doc.kmsKeyId);
    return { token, documentClass: doc.documentClass, plaintextBase64: plaintext };
  }

  async deleteDocument(token: string, actorId: string, actorRole: string) {
    const doc = await this.prisma.tokenizedDocument.findUnique({ where: { token } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerUserId !== actorId && !['admin'].includes(actorRole)) {
      throw new ForbiddenException('Not permitted to delete this document');
    }
    await this.logAccess(actorId, actorRole, token, 'delete');
    await this.prisma.tokenizedDocument.delete({ where: { token } });
    return { token, deleted: true };
  }

  async recordConsent(userId: string, consentType: string, ipAddress?: string, userAgent?: string) {
    return this.prisma.consentRecord.create({
      data: { userId, consentType, ipAddress, userAgent, grantedAt: new Date() },
    });
  }

  async listConsents(userId: string) {
    return this.prisma.consentRecord.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } });
  }

  async requestExport(userId: string) {
    return this.prisma.dataLifecycleRequest.create({ data: { userId, type: 'export', status: 'pending' } });
  }

  /**
   * Deletion requests that intersect with an open dispute, active claim, or legal
   * hold are auto-rejected with a reason rather than silently ignored, per spec.
   */
  async requestDeletion(userId: string) {
    const [openDispute, activeClaim, legalHoldDoc] = await Promise.all([
      this.prisma.disputeCase.findFirst({ where: { filedByUserId: userId, status: 'open' } }),
      this.prisma.claim.findFirst({ where: { status: { in: ['filed', 'under_review'] } } }),
      this.prisma.tokenizedDocument.findFirst({ where: { ownerUserId: userId, retentionPolicy: 'extended_legal_hold' } }),
    ]);

    if (openDispute || activeClaim || legalHoldDoc) {
      return this.prisma.dataLifecycleRequest.create({
        data: {
          userId,
          type: 'delete',
          status: 'rejected',
          rejectionReason: openDispute
            ? 'Open dispute on file'
            : activeClaim
            ? 'Active insurance claim on file'
            : 'Document under extended legal hold',
        },
      });
    }

    const request = await this.prisma.dataLifecycleRequest.create({ data: { userId, type: 'delete', status: 'processing' } });
    // Async purge job would run here; completed synchronously for this reference implementation.
    await this.prisma.tokenizedDocument.deleteMany({ where: { ownerUserId: userId } });
    const completed = await this.prisma.dataLifecycleRequest.update({
      where: { id: request.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    this.events.publish(EVT.SECURITY_DATA_DELETION_COMPLETED, { userId });
    return completed;
  }

  async getRequestStatus(requestId: string) {
    const req = await this.prisma.dataLifecycleRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Data lifecycle request not found');
    return req;
  }

  private async logAccess(actorId: string, actorRole: string, resourceToken: string, action: string) {
    return this.prisma.accessAuditLogEntry.create({
      data: { actorId, actorRole, resourceToken, action },
    });
  }

  async queryAuditLog(filters: { actorId?: string; resourceToken?: string }) {
    return this.prisma.accessAuditLogEntry.findMany({
      where: { actorId: filters.actorId, resourceToken: filters.resourceToken },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }
}
