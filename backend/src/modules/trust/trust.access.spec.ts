import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TrustService } from './trust.service';

const svc = (ownerId: string | null = 'HOST') => new TrustService({ listing: { findUnique: async () => (ownerId ? { ownerId } : null) } } as any, {} as any);
const u = (userId: string, role = 'user') => ({ userId, role }) as any;

describe('trust score privacy', () => {
  it('lets people read their own score, and staff read anyone\'s', () => {
    expect(() => svc().assertMayReadScore(u('a'), 'a')).not.toThrow();
    for (const r of ['admin', 'support_agent', 'arbitrator', 'service']) expect(() => svc().assertMayReadScore(u('s', r), 'a')).not.toThrow();
  });
  it('refuses everyone else, including hosts', () => {
    expect(() => svc().assertMayReadScore(u('b'), 'a')).toThrow(ForbiddenException);
    expect(() => svc().assertMayReadScore(u('HOST'), 'a')).toThrow(ForbiddenException);
  });
});

describe('eligibility check access', () => {
  it('renter for self, staff for anyone', async () => {
    await expect(svc().assertMayCheckEligibility(u('a'), 'a', 'L')).resolves.toBeUndefined();
    await expect(svc().assertMayCheckEligibility(u('x', 'admin'), 'a', 'L')).resolves.toBeUndefined();
  });
  it('the host of that listing may check a renter (what the dashboard does)', async () => {
    await expect(svc('HOST').assertMayCheckEligibility(u('HOST'), 'renter', 'L')).resolves.toBeUndefined();
  });
  it('a stranger, or the host of a different listing, may not probe someone else', async () => {
    await expect(svc('HOST').assertMayCheckEligibility(u('nosy'), 'renter', 'L')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc(null).assertMayCheckEligibility(u('nosy'), 'renter', 'missing')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('threshold changes', () => {
  it('owner and staff may set it', async () => {
    await expect(svc('HOST').assertMaySetThreshold(u('HOST'), 'L')).resolves.toBeUndefined();
    await expect(svc('HOST').assertMaySetThreshold(u('x', 'admin'), 'L')).resolves.toBeUndefined();
  });
  it('another user may not, and an unknown listing is a 404', async () => {
    await expect(svc('HOST').assertMaySetThreshold(u('nosy'), 'L')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc(null).assertMaySetThreshold(u('nosy'), 'L')).rejects.toBeInstanceOf(NotFoundException);
  });
});
