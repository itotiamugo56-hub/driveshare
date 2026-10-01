import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventBusService } from '../../common/event-bus/event-bus.service';
import { EVT } from '../../common/enums';
import { PaymentProcessorProvider } from '../../common/mock-providers/payment-processor.provider';

@Injectable()
export class PaymentsEscrowService {
  constructor(private prisma: PrismaService, private events: EventBusService, private processor: PaymentProcessorProvider) {}

  async addPaymentMethod(userId: string, type: string, rawDetails: unknown) {
    const { processorToken, brand, last4 } = await this.processor.vaultPaymentMethod(rawDetails);
    return this.prisma.paymentMethod.create({
      data: { userId, type: type as any, processorToken, brand, last4, status: 'active' },
    });
  }

  async listPaymentMethods(userId: string) {
    return this.prisma.paymentMethod.findMany({ where: { userId, status: 'active' } });
  }

  async removePaymentMethod(methodId: string) {
    return this.prisma.paymentMethod.update({ where: { id: methodId }, data: { status: 'removed' } });
  }

  async authorize(tripId: string, payerUserId: string, paymentMethodId: string, amountCents: number, currency = 'USD') {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method || method.status !== 'active') throw new BadRequestException('Payment method not usable');

    const result = await this.processor.authorize(method.processorToken, amountCents);
    const auth = await this.prisma.paymentAuthorization.create({
      data: { tripId, payerUserId, amountCents, currency, status: 'authorized', processorRef: result.processorRef },
    });
    await this.ledger(tripId, 'rental_fee', amountCents, currency);
    this.events.publish(EVT.PAYMENT_AUTHORIZED, { tripId, amountCents });
    return auth;
  }

  async capture(authId: string) {
    const auth = await this.prisma.paymentAuthorization.findUnique({ where: { id: authId } });
    if (!auth) throw new NotFoundException('Authorization not found');
    if (auth.status !== 'authorized') throw new BadRequestException(`Cannot capture authorization in status ${auth.status}`);

    await this.processor.capture(auth.processorRef);
    const updated = await this.prisma.paymentAuthorization.update({
      where: { id: authId },
      data: { status: 'captured', capturedAt: new Date() },
    });
    this.events.publish(EVT.PAYMENT_CAPTURED, { tripId: auth.tripId, amountCents: auth.amountCents });
    return updated;
  }

  async void(authId: string) {
    const auth = await this.prisma.paymentAuthorization.findUnique({ where: { id: authId } });
    if (!auth) throw new NotFoundException('Authorization not found');
    await this.processor.void(auth.processorRef);
    return this.prisma.paymentAuthorization.update({ where: { id: authId }, data: { status: 'voided' } });
  }

  async preauthorizeDeposit(tripId: string, paymentMethodId: string, amountCents: number) {
    const method = await this.prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method) throw new BadRequestException('Payment method not found');
    await this.processor.authorize(method.processorToken, amountCents);
    const deposit = await this.prisma.depositHold.create({
      data: { tripId, amountCents, status: 'held' },
    });
    await this.ledger(tripId, 'deposit', amountCents, 'USD');
    return deposit;
  }

  async releaseDeposit(depositId: string) {
    const deposit = await this.prisma.depositHold.findUnique({ where: { id: depositId } });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.status === 'fully_captured') throw new BadRequestException('Deposit already fully captured');
    const updated = await this.prisma.depositHold.update({ where: { id: depositId }, data: { status: 'released' } });
    this.events.publish(EVT.DEPOSIT_RELEASED, { tripId: deposit.tripId });
    return updated;
  }

  async partialCaptureDeposit(depositId: string, amountCents: number, reason: string) {
    const deposit = await this.prisma.depositHold.findUnique({ where: { id: depositId } });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (amountCents > deposit.amountCents) throw new BadRequestException('Capture amount exceeds deposit hold');

    const fullyCaptured = amountCents === deposit.amountCents;
    const updated = await this.prisma.depositHold.update({
      where: { id: depositId },
      data: { status: fullyCaptured ? 'fully_captured' : 'partially_captured', captureReason: reason },
    });
    await this.ledger(deposit.tripId, 'fee_adjustment', amountCents, 'USD');
    return updated;
  }

  async initiatePayout(ownerId: string, tripId: string, amountCents: number, platformFeeCents: number) {
    const result = await this.processor.payout(ownerId, amountCents);
    void result;
    const payout = await this.prisma.payout.create({
      data: {
        ownerId,
        tripId,
        amountCents,
        platformFeeCents,
        status: 'scheduled',
        scheduledReleaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h grace period
      },
    });
    await this.ledger(tripId, 'payout', amountCents, 'USD');
    return payout;
  }

  async getPayout(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }

  async getTripLedger(tripId: string) {
    return this.prisma.transactionLedgerEntry.findMany({ where: { tripId }, orderBy: { createdAt: 'asc' } });
  }

  private async ledger(tripId: string, entryType: string, amountCents: number, currency: string) {
    return this.prisma.transactionLedgerEntry.create({
      data: { tripId, entryType: entryType as any, amountCents, currency },
    });
  }

  /** Inbound webhook from the payment processor (async auth/capture/chargeback events). */
  async handleProcessorWebhook(eventType: string, payload: any) {
    if (eventType === 'chargeback.filed') {
      this.events.publish(EVT.PAYMENT_CHARGEBACK_FILED, payload);
    }
    if (eventType === 'payout.paid') {
      await this.prisma.payout.updateMany({ where: { id: payload.payoutId }, data: { status: 'paid' } });
      this.events.publish(EVT.PAYOUT_COMPLETED, payload);
    }
    return { received: true };
  }
}
