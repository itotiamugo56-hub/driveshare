import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { IdVerificationProvider } from '../../common/mock-providers/id-verification.provider';
import { DmvProvider } from '../../common/mock-providers/dmv.provider';
import { DrivingHistoryProvider } from '../../common/mock-providers/driving-history.provider';
import { KmsProvider } from '../../common/mock-providers/kms.provider';
import { v4 as uuid } from 'uuid';

@Injectable()
export class IdentityService {
  constructor(
    private prisma: PrismaService,
    private events: EventBusService,
    private idVerification: IdVerificationProvider,
    private dmv: DmvProvider,
    private drivingHistory: DrivingHistoryProvider,
    private kms: KmsProvider,
  ) {}

  async initiateVerification(userId: string, documentType: string) {
    return this.prisma.verificationSession.create({
      data: { userId, documentType: documentType as any, status: 'pending' },
    });
  }

  async uploadDocument(verificationId: string, documentBase64: string) {
    const session = await this.prisma.verificationSession.findUnique({ where: { id: verificationId } });
    if (!session) throw new NotFoundException('Verification session not found');

    // Route raw document bytes through the security/tokenization layer (Section 5)
    // rather than persisting them directly in this service's own tables.
    const { ciphertext, kmsKeyId } = await this.kms.encrypt(documentBase64);
    const token = await this.prisma.tokenizedDocument.create({
      data: {
        ownerUserId: session.userId,
        documentClass: 'id_doc',
        encryptedBlobRef: ciphertext,
        kmsKeyId,
      },
    });

    const vendorResult = await this.idVerification.verifyDocument(token.token);

    return this.prisma.verificationSession.update({
      where: { id: verificationId },
      data: {
        status: 'doc_uploaded',
        documentTokenRef: token.token,
        vendorRef: vendorResult.vendorRef,
      },
    });
  }

  async submitLiveness(verificationId: string, _livenessMediaBase64: string) {
    const session = await this.prisma.verificationSession.findUnique({ where: { id: verificationId } });
    if (!session) throw new NotFoundException('Verification session not found');

    const result = await this.idVerification.submitLiveness(verificationId);
    const approved = result.livenessScore > 0.85;

    const updated = await this.prisma.verificationSession.update({
      where: { id: verificationId },
      data: {
        status: approved ? 'approved' : 'rejected',
        livenessScore: result.livenessScore,
        rejectionReason: approved ? null : 'Liveness score below threshold',
      },
    });

    if (approved) {
      this.events.publish(EVT.IDENTITY_VERIFICATION_APPROVED, { userId: session.userId, verificationId });
    } else {
      this.events.publish(EVT.IDENTITY_VERIFICATION_REJECTED, { userId: session.userId, verificationId });
    }
    return updated;
  }

  async getVerification(verificationId: string) {
    const session = await this.prisma.verificationSession.findUnique({ where: { id: verificationId } });
    if (!session) throw new NotFoundException('Verification session not found');
    return session;
  }

  async submitLicense(userId: string, dto: { licenseNumber: string; issuingRegion: string; licenseClass: string; expirationDate: string }) {
    const { ciphertext, kmsKeyId } = await this.kms.encrypt(dto.licenseNumber);
    void kmsKeyId; // license number stored encrypted inline for this record (kept simple vs. full tokenized-document indirection)

    const dmvResult = await this.dmv.validateLicense(dto.licenseNumber, dto.issuingRegion);

    return this.prisma.licenseRecord.create({
      data: {
        userId,
        licenseNumberEnc: ciphertext,
        issuingRegion: dto.issuingRegion,
        licenseClass: dto.licenseClass,
        expirationDate: new Date(dto.expirationDate),
        dmvValidationStatus: dmvResult.status as any,
        lastValidatedAt: new Date(),
      },
    });
  }

  async getLicenseStatus(licenseId: string) {
    const license = await this.prisma.licenseRecord.findUnique({ where: { id: licenseId } });
    if (!license) throw new NotFoundException('License record not found');
    return license;
  }

  async requestDrivingHistory(userId: string, consentGiven: boolean) {
    if (!consentGiven) {
      throw new BadRequestException('Explicit consent is required to request a driving history report');
    }
    const consent = await this.prisma.consentRecord.create({
      data: { userId, consentType: 'driving_history', grantedAt: new Date() },
    });

    const report = await this.prisma.drivingHistoryReport.create({
      data: { userId, consentTokenId: consent.id, requestedAt: new Date() },
    });

    const result = await this.drivingHistory.pullHistory(userId, consent.id);
    const updated = await this.prisma.drivingHistoryReport.update({
      where: { id: report.id },
      data: {
        violationCount: result.violationCount,
        atFaultAccidentCount: result.atFaultAccidentCount,
        suspensionFlag: result.suspensionFlag,
        riskTier: result.riskTier as any,
        completedAt: new Date(),
      },
    });

    this.events.publish('evt.identity.driving_history_completed', { userId, riskTier: result.riskTier });
    return updated;
  }

  async getDrivingHistory(requestId: string) {
    const report = await this.prisma.drivingHistoryReport.findUnique({ where: { id: requestId } });
    if (!report) throw new NotFoundException('Driving history report not found');
    return report;
  }

  /** [INFERRED] Scheduled/triggered re-verification cycle for a user. */
  async scheduleReverification(userId: string) {
    this.events.publish(EVT.IDENTITY_REVERIFICATION_DUE, { userId, scheduledAt: new Date() });
    return { userId, status: 'reverification_scheduled', jobId: uuid() };
  }

  async getConsolidatedStatus(userId: string) {
    const [latestVerification, license, latestHistory] = await Promise.all([
      this.prisma.verificationSession.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.licenseRecord.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.drivingHistoryReport.findFirst({ where: { userId }, orderBy: { requestedAt: 'desc' } }),
    ]);
    return {
      userId,
      identityVerified: latestVerification?.status === 'approved',
      licenseStatus: license?.dmvValidationStatus ?? 'unknown',
      licenseExpiresAt: license?.expirationDate ?? null,
      drivingRiskTier: latestHistory?.riskTier ?? null,
      reverificationDue: license ? license.expirationDate < new Date() : null,
    };
  }

  /** Inbound webhook from the ID verification vendor for async review outcomes. */
  async handleVendorCallback(payload: { verificationId: string; status: 'approved' | 'rejected'; reason?: string }) {
    const updated = await this.prisma.verificationSession.update({
      where: { id: payload.verificationId },
      data: { status: payload.status, rejectionReason: payload.reason },
    });
    const topic = payload.status === 'approved' ? EVT.IDENTITY_VERIFICATION_APPROVED : EVT.IDENTITY_VERIFICATION_REJECTED;
    this.events.publish(topic, { userId: updated.userId, verificationId: updated.id });
    return updated;
  }
}
