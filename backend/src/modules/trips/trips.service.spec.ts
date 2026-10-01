import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TripsService, parseDay, tripDates, MAX_TRIP_DAYS } from './trips.service';
import { EVT } from '../../common/enums';

const DAY = 86_400_000;
const iso = (d: number) => new Date(Date.now() + d * DAY).toISOString().slice(0, 10);
const ANSWERS = ['a', 'b', 'c'].map((q) => ({ questionId: q, answer: 'yes' }));
const dto = (over: Record<string, unknown> = {}): any => ({
  listingId: 'L', startDate: iso(3), endDate: iso(6), coverageTierId: 'T', includeDelivery: false, paymentMethodId: 'M', comprehensionAnswers: ANSWERS, ...over,
});

interface Opts {
  instant?: boolean; ownerId?: string; status?: string; delivery?: { delivery: boolean; fee: number } | null;
  clash?: number; txClash?: number; tier?: unknown; eligible?: boolean; method?: unknown; compPass?: boolean;
  failAuth?: boolean; failDeposit?: boolean; failBind?: boolean; failVoid?: boolean; trust?: unknown; listing?: unknown;
}
function build(o: Opts = {}) {
  const calls: string[] = [];
  const events: [string, any][] = [];
  let trip: any = null;
  const listing = o.listing === undefined ? { id: 'L', vehicleId: 'V', ownerId: o.ownerId ?? 'O', status: o.status ?? 'active', basePriceCents: 8000, currency: 'USD', instantBookEnabled: o.instant ?? true, deliveryOptions: o.delivery === undefined ? { delivery: true, fee: 15 } : o.delivery } : o.listing;
  const tx: any = {
    availabilityCalendar: { count: async () => o.txClash ?? 0, upsert: async () => { calls.push('upsert'); return {}; } },
  };
  const prisma: any = {
    listing: { findUnique: async () => listing },
    availabilityCalendar: { count: async () => o.clash ?? 0, updateMany: async () => { calls.push('unblock'); return {}; } },
    coverageTier: { findUnique: async () => (o.tier === undefined ? { id: 'T', basePriceMultiplier: 1.4, deductibleCents: 75000 } : o.tier) },
    trustScore: { findUnique: async () => (o.trust === undefined ? { tier: 'standard' } : o.trust), findMany: async () => [{ userId: 'X', tier: 'trusted' }] },
    paymentMethod: { findFirst: async () => (o.method === undefined ? { id: 'M' } : o.method) },
    trip: {
      create: async ({ data }: any) => { calls.push('create'); trip = { ...data }; return trip; },
      update: async ({ data }: any) => { calls.push('update'); trip = { ...trip, ...data }; return trip; },
      findUnique: async () => trip,
      findMany: async () => [{ id: '1', renterId: 'R', ownerId: 'O' }, { id: '2', renterId: 'X', ownerId: 'R' }],
    },
    $transaction: async (fn: any) => fn(tx),
  };
  const payments: any = {
    authorize: async () => { calls.push('authorize'); if (o.failAuth) throw new Error('auth declined'); return { id: 'A' }; },
    preauthorizeDeposit: async () => { calls.push('deposit'); if (o.failDeposit) throw new Error('deposit declined'); return { id: 'D' }; },
    void: async () => { calls.push('void'); if (o.failVoid) throw new Error('void failed'); },
    releaseDeposit: async () => { calls.push('release'); },
  };
  const insurance: any = {
    estimateDailyPremiumCents: (t: any, r: any) => Math.round(2000 * t.basePriceMultiplier * (r.trustTier === 'new' ? 1.3 : 1)),
    submitComprehensionCheck: async () => ({ passed: o.compPass ?? true }),
    bindPolicy: async () => { calls.push('bind'); if (o.failBind) throw new Error('bind failed'); return { id: 'P' }; },
  };
  const trust: any = { checkEligibility: async () => ({ eligible: o.eligible ?? true }) };
  const bus: any = { publish: (t: string, p: any) => events.push([t, p]) };
  const svc = new TripsService(prisma, bus, payments, insurance, trust);
  const seed = (t: any) => { trip = t; };
  return { svc, calls, events, seed, get trip() { return trip; } };
}
const stored = (over: Record<string, unknown> = {}) => ({
  id: 'T1', listingId: 'L', vehicleId: 'V', renterId: 'R', ownerId: 'O', startDate: new Date(Date.now() + 5 * DAY), endDate: new Date(Date.now() + 8 * DAY), days: 3,
  status: 'confirmed', authorizationId: 'A', depositHoldId: 'D', coverageTierId: 'T', ...over,
});
const fails = async (p: Promise<unknown>, type: any, msg?: RegExp) => {
  const e = await p.then(() => null, (x) => x);
  expect(e).toBeInstanceOf(type);
  if (msg) expect((e as Error).message).toMatch(msg);
};

describe('date helpers', () => {
  it('parses a plain date to UTC midnight', () => expect(parseDay('2026-10-03').toISOString()).toBe('2026-10-03T00:00:00.000Z'));
  it('ignores a time suffix', () => expect(parseDay('2026-10-03T23:59:00Z').toISOString()).toBe('2026-10-03T00:00:00.000Z'));
  it('rejects garbage with a plain message', () => expect(() => parseDay('nope')).toThrow(/2026-10-03/));
  it('lists one date per night, end excluded', () => expect(tripDates(parseDay('2026-10-03'), 3).map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']));
});

describe('preview', () => {
  it('prices rental, cover and total correctly', async () => {
    const p = await build().svc.preview('R', dto());
    expect(p).toMatchObject({ days: 3, rentalCents: 24000, dailyCoverCents: 2800, coverCents: 8400, deliveryCents: 0, totalCents: 32400, depositCents: 75000, instantBook: true });
  });
  it('adds delivery in cents only when asked and offered', async () => {
    expect((await build().svc.preview('R', dto({ includeDelivery: true }))).deliveryCents).toBe(1500);
    expect((await build({ delivery: { delivery: false, fee: 15 } }).svc.preview('R', dto({ includeDelivery: true }))).deliveryCents).toBe(0);
    expect((await build({ delivery: null }).svc.preview('R', dto({ includeDelivery: true }))).deliveryCents).toBe(0);
  });
  it('applies the renter trust tier to the cover price', async () => {
    expect((await build({ trust: { tier: 'new' } }).svc.preview('R', dto())).dailyCoverCents).toBe(3640);
    expect((await build({ trust: null }).svc.preview('R', dto())).dailyCoverCents).toBe(2800);
  });
  it('sets free cancellation to 24h before pick-up', async () => {
    const p = await build().svc.preview('R', dto({ startDate: iso(10), endDate: iso(12) }));
    expect(p.freeCancellationUntil).toBe(new Date(+parseDay(iso(10)) - DAY).toISOString());
  });
  it('reports ineligibility instead of throwing, so the UI can explain', async () => {
    expect((await build({ eligible: false }).svc.preview('R', dto())).eligibility.eligible).toBe(false);
  });
  it('rejects a missing or inactive listing', async () => {
    await fails(build({ listing: null }).svc.preview('R', dto()), NotFoundException);
    await fails(build({ status: 'paused' }).svc.preview('R', dto()), NotFoundException, /not available/);
    await fails(build({ status: 'draft' }).svc.preview('R', dto()), NotFoundException);
  });
  it('rejects bad date ranges', async () => {
    await fails(build().svc.preview('R', dto({ startDate: iso(5), endDate: iso(5) })), BadRequestException, /after/);
    await fails(build().svc.preview('R', dto({ startDate: iso(6), endDate: iso(3) })), BadRequestException);
    await fails(build().svc.preview('R', dto({ startDate: iso(-2), endDate: iso(1) })), BadRequestException, /past/);
    await fails(build().svc.preview('R', dto({ startDate: iso(1), endDate: iso(1 + MAX_TRIP_DAYS + 1) })), BadRequestException, /30 days/);
  });
  it('allows today and exactly 30 days', async () => {
    await expect(build().svc.preview('R', dto({ startDate: iso(0), endDate: iso(1) }))).resolves.toBeDefined();
    await expect(build().svc.preview('R', dto({ startDate: iso(1), endDate: iso(1 + MAX_TRIP_DAYS) }))).resolves.toMatchObject({ days: 30 });
  });
  it('conflicts on taken days and rejects an unknown cover option', async () => {
    await fails(build({ clash: 1 }).svc.preview('R', dto()), ConflictException, /already taken/);
    await fails(build({ tier: null }).svc.preview('R', dto()), NotFoundException, /cover/);
  });
  it('writes nothing', async () => {
    const b = build(); await b.svc.preview('R', dto());
    expect(b.calls).toEqual([]); expect(b.events).toEqual([]);
  });
});

describe('book: success paths', () => {
  it('instant: authorizes total, holds deductible, blocks days, binds cover, confirms', async () => {
    const b = build(); const t = await b.svc.book('R', dto());
    expect(b.calls).toEqual(['authorize', 'deposit', 'upsert', 'upsert', 'upsert', 'bind', 'create']);
    expect(t).toMatchObject({ status: 'confirmed', renterId: 'R', ownerId: 'O', totalCents: 32400, depositCents: 75000, authorizationId: 'A', depositHoldId: 'D', policyId: 'P', days: 3 });
    expect(b.events.map((e) => e[0])).toEqual([EVT.TRIP_BOOKED]);
  });
  it('request: holds money but does not block days or bind cover', async () => {
    const b = build({ instant: false }); const t = await b.svc.book('R', dto());
    expect(b.calls).toEqual(['authorize', 'deposit', 'create']);
    expect(t).toMatchObject({ status: 'requested', policyId: null });
    expect(b.events.map((e) => e[0])).toEqual([EVT.TRIP_REQUESTED]);
  });
  it('includes delivery in the authorized total', async () => {
    const t = await build().svc.book('R', dto({ includeDelivery: true }));
    expect(t.totalCents).toBe(33900); expect(t.deliveryCents).toBe(1500);
  });
});

describe('book: refusals before any money moves', () => {
  it('own car', async () => { const b = build({ ownerId: 'R' }); await fails(b.svc.book('R', dto()), ForbiddenException, /own car/); expect(b.calls).toEqual([]); });
  it('ineligible renter', async () => { const b = build({ eligible: false }); await fails(b.svc.book('R', dto()), ForbiddenException, /trust level/); expect(b.calls).toEqual([]); });
  it('a card that is not the renter\'s or not active', async () => { const b = build({ method: null }); await fails(b.svc.book('R', dto()), BadRequestException, /payment method/); expect(b.calls).toEqual([]); });
  it('failed cover confirmations', async () => { const b = build({ compPass: false }); await fails(b.svc.book('R', dto()), BadRequestException, /cover questions/); expect(b.calls).toEqual([]); });
  it('taken dates', async () => { const b = build({ clash: 2 }); await fails(b.svc.book('R', dto()), ConflictException); expect(b.calls).toEqual([]); });
});

describe('book: rollback', () => {
  it('authorization declined: nothing to undo', async () => {
    const b = build({ failAuth: true }); await fails(b.svc.book('R', dto()), Error, /auth declined/);
    expect(b.calls).toEqual(['authorize']);
  });
  it('deposit declined: voids the authorization', async () => {
    const b = build({ failDeposit: true }); await fails(b.svc.book('R', dto()), Error, /deposit declined/);
    expect(b.calls).toEqual(['authorize', 'deposit', 'void']);
  });
  it('someone else took the days first: voids and releases, no days freed that were never ours', async () => {
    const b = build({ txClash: 1 }); await fails(b.svc.book('R', dto()), ConflictException, /just booked/);
    expect(b.calls).toEqual(['authorize', 'deposit', 'void', 'release']);
  });
  it('cover binding fails after days were blocked: frees the days too', async () => {
    const b = build({ failBind: true }); await fails(b.svc.book('R', dto()), Error, /bind failed/);
    expect(b.calls).toEqual(['authorize', 'deposit', 'upsert', 'upsert', 'upsert', 'bind', 'void', 'release', 'unblock']);
    expect(b.events).toEqual([]);
  });
  it('one failing undo step does not stop the others', async () => {
    const b = build({ failBind: true, failVoid: true }); await fails(b.svc.book('R', dto()), Error, /bind failed/);
    expect(b.calls.slice(-3)).toEqual(['void', 'release', 'unblock']);
  });
});

describe('cancel', () => {
  const renter: any = { userId: 'R', role: 'user' };
  it('renter cancels a confirmed trip: voids, releases, frees days, no late flag when far out', async () => {
    const b = build(); b.seed(stored());
    const t = await b.svc.cancel(renter, 'T1');
    expect(b.calls).toEqual(['void', 'release', 'unblock', 'update']);
    expect(t).toMatchObject({ status: 'cancelled', cancelledBy: 'R' }); expect(b.events).toEqual([]);
  });
  it('flags a late cancellation inside 24h', async () => {
    const b = build(); b.seed(stored({ startDate: new Date(Date.now() + 5 * 3_600_000) }));
    await b.svc.cancel(renter, 'T1');
    expect(b.events[0][0]).toBe(EVT.TRIP_CANCELLED_LATE);
  });
  it('a host cancelling late is not flagged as the renter\'s late cancellation', async () => {
    const b = build(); b.seed(stored({ startDate: new Date(Date.now() + 5 * 3_600_000) }));
    await b.svc.cancel({ userId: 'O', role: 'user' } as any, 'T1'); expect(b.events).toEqual([]);
  });
  it('a request that was never accepted has no days to free', async () => {
    const b = build(); b.seed(stored({ status: 'requested' })); await b.svc.cancel(renter, 'T1');
    expect(b.calls).toEqual(['void', 'release', 'update']);
  });
  it('is idempotent on an already cancelled trip', async () => {
    const b = build(); b.seed(stored({ status: 'cancelled' })); await b.svc.cancel(renter, 'T1'); expect(b.calls).toEqual([]);
  });
  it('refuses a trip that has started', async () => {
    const b = build(); b.seed(stored({ startDate: new Date(Date.now() - DAY) })); await fails(b.svc.cancel(renter, 'T1'), BadRequestException, /already started/);
  });
  it('refuses strangers, allows admin, and 404s unknown trips', async () => {
    const b = build(); b.seed(stored());
    await fails(b.svc.cancel({ userId: 'S', role: 'user' } as any, 'T1'), ForbiddenException);
    await expect(b.svc.cancel({ userId: 'AD', role: 'admin' } as any, 'T1')).resolves.toMatchObject({ status: 'cancelled' });
    await fails(build().svc.cancel(renter, 'nope'), NotFoundException);
  });
  it('support agents can read but not cancel', async () => {
    const b = build(); b.seed(stored());
    await fails(b.svc.cancel({ userId: 'SA', role: 'support_agent' } as any, 'T1'), ForbiddenException, /renter or host/);
  });
});

describe('respond (host)', () => {
  it('accept: blocks days, binds cover, confirms, announces', async () => {
    const b = build({ instant: false }); b.seed(stored({ status: 'requested' }));
    const t = await b.svc.respond('O', 'T1', true);
    expect(b.calls).toEqual(['upsert', 'upsert', 'upsert', 'bind', 'update']);
    expect(t).toMatchObject({ status: 'confirmed', policyId: 'P' }); expect(b.events[0][0]).toBe(EVT.TRIP_CONFIRMED);
  });
  it('decline: releases the renter\'s money', async () => {
    const b = build(); b.seed(stored({ status: 'requested' }));
    expect(await b.svc.respond('O', 'T1', false)).toMatchObject({ status: 'cancelled', cancelledBy: 'O' });
    expect(b.calls).toEqual(['void', 'release', 'update']);
  });
  it('accept when days were taken meanwhile: stays requested, nothing confirmed', async () => {
    const b = build({ txClash: 1 }); b.seed(stored({ status: 'requested' }));
    await fails(b.svc.respond('O', 'T1', true), ConflictException);
    expect(b.trip.status).toBe('requested'); expect(b.events).toEqual([]);
  });
  it('accept when binding fails: frees the days it just blocked', async () => {
    const b = build({ failBind: true }); b.seed(stored({ status: 'requested' }));
    await fails(b.svc.respond('O', 'T1', true), Error, /bind failed/); expect(b.calls).toContain('unblock');
  });
  it('only the host, only once, only real trips', async () => {
    const b = build(); b.seed(stored({ status: 'requested' }));
    await fails(b.svc.respond('R', 'T1', true), ForbiddenException, /host/);
    b.seed(stored({ status: 'confirmed' })); await fails(b.svc.respond('O', 'T1', true), BadRequestException, /already been answered/);
    await fails(build().svc.respond('O', 'x', true), NotFoundException);
  });
});

describe('get and mine', () => {
  it('labels the caller\'s role', async () => {
    const b = build(); b.seed(stored());
    expect((await b.svc.get({ userId: 'R', role: 'user' } as any, 'T1')).role).toBe('renter');
    expect((await b.svc.get({ userId: 'O', role: 'user' } as any, 'T1')).role).toBe('owner');
    expect((await b.svc.get({ userId: 'AD', role: 'admin' } as any, 'T1')).role).toBe('staff');
  });
  it('hides trips from strangers', async () => {
    const b = build(); b.seed(stored()); await fails(b.svc.get({ userId: 'S', role: 'user' } as any, 'T1'), ForbiddenException);
  });
  it('mine tags each trip as renter or owner', async () => {
    expect((await build().svc.mine('R')).map((t: any) => t.role)).toEqual(['renter', 'owner']);
  });
  it('a host sees the renter tier only on their own trips; renters see no tier at all', async () => {
    const rows = await build().svc.mine('R');
    expect(rows[0]).not.toHaveProperty('renterTier');
    expect(rows[1]).toMatchObject({ role: 'owner', renterTier: 'trusted' });
  });
});
