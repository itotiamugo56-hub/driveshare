import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { VehicleListingService } from './vehicle-listing.service';

function make(booked: string[] = [], owner = 'me') {
  const written: any[] = []; const events: string[] = [];
  const prisma: any = {
    listing: { findUnique: async () => ({ id: 'L', ownerId: owner }) },
    availabilityCalendar: {
      findMany: async () => booked.map((d) => ({ date: new Date(`${d}T00:00:00Z`) })),
      upsert: async (a: any) => { written.push(a); return { ...a.create }; },
    },
  };
  const svc = new VehicleListingService(prisma, { publish: (t: string) => events.push(t) } as any, {} as any, {} as any, {} as any);
  return { svc, written, events };
}

describe('owner calendar safety', () => {
  it('blocks and opens days, normalising to UTC midnight (matches how trips store days)', async () => {
    const { svc, written } = make();
    await svc.updateCalendar('L', 'me', [{ date: '2026-10-05T17:30:00Z', status: 'owner_blocked' }, { date: '2026-10-06', status: 'available' }]);
    expect(written.map((w) => w.where.listingId_date.date.toISOString())).toEqual(['2026-10-05T00:00:00.000Z', '2026-10-06T00:00:00.000Z']);
  });
  it('refuses to reopen a day a renter has booked, and writes nothing at all', async () => {
    const { svc, written } = make(['2026-10-06']);
    await expect(svc.updateCalendar('L', 'me', [{ date: '2026-10-05', status: 'owner_blocked' }, { date: '2026-10-06', status: 'available' }])).rejects.toBeInstanceOf(ConflictException);
    expect(written).toEqual([]);
  });
  it('the conflict names the day in plain words', async () => {
    const { svc } = make(['2026-10-06']);
    await expect(svc.updateCalendar('L', 'me', [{ date: '2026-10-06', status: 'available' }])).rejects.toThrow(/2026-10-06 is booked by a renter/);
  });
  it('owners cannot mark days booked themselves', async () => {
    await expect(make().svc.updateCalendar('L', 'me', [{ date: '2026-10-05', status: 'booked' as any }])).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects garbage dates and unknown statuses with a 400, not a 500', async () => {
    await expect(make().svc.updateCalendar('L', 'me', [{ date: 'soon', status: 'available' }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(make().svc.updateCalendar('L', 'me', [{ date: '2026-10-05', status: 'nope' as any }])).rejects.toBeInstanceOf(BadRequestException);
  });
  it('only the owner may edit, and an edit announces itself', async () => {
    await expect(make([], 'someone').svc.updateCalendar('L', 'me', [{ date: '2026-10-05', status: 'available' }])).rejects.toBeInstanceOf(ForbiddenException);
    const { svc, events } = make(); await svc.updateCalendar('L', 'me', [{ date: '2026-10-05', status: 'available' }]); expect(events).toHaveLength(1);
  });
});
