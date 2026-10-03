import { ForbiddenException } from '@nestjs/common';
import { VehicleListingService } from './vehicle-listing.service';

type Opts = { identity?: boolean; licence?: boolean; ownership?: 'pending' | 'verified' | 'rejected'; cars?: number };

function make(o: Opts = {}) {
  const vehicle = { id: 'v1', ownerId: 'u1', make: 'Toyota', model: 'Noah', year: 2018, ownershipVerificationStatus: o.ownership ?? 'pending', ownershipDocTokenRef: o.ownership ? 'tok' : null };
  const prisma: any = {
    verificationSession: { findFirst: async () => (o.identity ? { status: 'approved' } : null) },
    licenseRecord: { findFirst: async () => (o.licence ? { dmvValidationStatus: 'valid', expirationDate: new Date(Date.now() + 1e9) } : null) },
    vehicle: {
      findUnique: async () => vehicle,
      findMany: async () => (o.cars === 0 ? [] : [vehicle]),
      update: async ({ data }: any) => ({ ...vehicle, ...data }),
    },
    listing: { findUnique: async () => ({ id: 'l1', ownerId: 'u1', vehicleId: 'v1' }), update: async ({ data }: any) => data },
  };
  return new VehicleListingService(prisma, { publish: () => undefined } as any, {} as any, {} as any, {} as any);
}

describe('host vetting gate', () => {
  afterEach(() => { delete process.env.ENFORCE_HOST_VETTING; });

  it('blocks going live without verified identity', async () => {
    await expect(make({ licence: true, ownership: 'verified' }).updateListing('l1', 'u1', { status: 'active' })).rejects.toThrow(/HOST_VETTING_REQUIRED.*identity/);
  });
  it('blocks without a valid licence', async () => {
    await expect(make({ identity: true, ownership: 'verified' }).updateListing('l1', 'u1', { status: 'active' })).rejects.toThrow(/licence/);
  });
  it('blocks while the ownership document is pending or rejected', async () => {
    for (const ownership of ['pending', 'rejected'] as const)
      await expect(make({ identity: true, licence: true, ownership }).updateListing('l1', 'u1', { status: 'active' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows going live when fully vetted', async () => {
    await expect(make({ identity: true, licence: true, ownership: 'verified' }).updateListing('l1', 'u1', { status: 'active' })).resolves.toBeTruthy();
  });
  it('does not gate drafts, pauses or price edits', async () => {
    const svc = make();
    await expect(svc.updateListing('l1', 'u1', { status: 'paused' })).resolves.toBeTruthy();
    await expect(svc.updateListing('l1', 'u1', { basePriceCents: 9000 })).resolves.toBeTruthy();
  });
  it('can be switched off for local smoke tests', async () => {
    process.env.ENFORCE_HOST_VETTING = 'false';
    await expect(make().updateListing('l1', 'u1', { status: 'active' })).resolves.toBeTruthy();
  });
});

describe('hostingStatus', () => {
  it('non-owners have no host standing', async () => {
    const s = await make({ cars: 0 }).hostingStatus('u1');
    expect(s).toMatchObject({ ownsVehicles: false, canPublish: false, nextStep: 'none' });
  });
  it('walks identity, licence, ownership in order', async () => {
    expect((await make({}).hostingStatus('u1')).nextStep).toBe('identity');
    expect((await make({ identity: true }).hostingStatus('u1')).nextStep).toBe('licence');
    expect((await make({ identity: true, licence: true }).hostingStatus('u1')).nextStep).toBe('ownership');
    const done = await make({ identity: true, licence: true, ownership: 'verified' }).hostingStatus('u1');
    expect(done).toMatchObject({ canPublish: true, nextStep: 'none' });
  });
  it('asks for a new document when ownership was rejected', async () => {
    const s = await make({ identity: true, licence: true, ownership: 'rejected' }).hostingStatus('u1');
    expect(s.nextStep).toBe('ownership');
    expect(s.cars[0].ownership).toBe('rejected');
  });
});

describe('reviewOwnership', () => {
  it('needs an uploaded document', async () => {
    await expect(make({}).reviewOwnership('v1', 'verified')).rejects.toThrow(/No ownership document/);
  });
  it('records the staff decision', async () => {
    await expect(make({ ownership: 'pending' }).reviewOwnership('v1', 'verified')).resolves.toMatchObject({ ownershipVerificationStatus: 'verified' });
  });
});
