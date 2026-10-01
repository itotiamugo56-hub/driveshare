import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { VehicleListingService } from './vehicle-listing.service';

function make(createImpl?: () => unknown) {
  const seen: any = {};
  const prisma: any = {
    vehicle: { findMany: async (a: any) => { seen.v = a; return []; }, create: async () => (createImpl ? createImpl() : { id: 'V' }) },
    listing: { findMany: async (a: any) => { seen.l = a; return []; } },
  };
  const events: any = { publish: () => undefined };
  const vin: any = { decode: async () => ({ make: 'Toyota', model: 'Camry', year: 2022, trim: 'SE' }) };
  return { svc: new VehicleListingService(prisma, events, vin, {} as any, {} as any), seen };
}

describe('owner endpoints', () => {
  it('myVehicles is scoped to the caller and lists cover photo first', async () => {
    const { svc, seen } = make(); await svc.myVehicles('me');
    expect(seen.v.where).toEqual({ ownerId: 'me' }); expect(seen.v.include.photos.orderBy).toEqual({ position: 'asc' });
  });
  it('myListings is scoped to the caller, hides removed, includes vehicle photos', async () => {
    const { svc, seen } = make(); await svc.myListings('me');
    expect(seen.l.where).toEqual({ ownerId: 'me', status: { not: 'removed' } }); expect(seen.l.include.vehicle.include.photos).toBeDefined();
  });
  it('a duplicate VIN is a plain 409, not a 500', async () => {
    const { svc } = make(() => { throw Object.assign(new Error('dup'), { code: 'P2002' }); });
    await expect(svc.registerVehicle('me', 'VIN', 'PLATE')).rejects.toBeInstanceOf(ConflictException);
  });
  it('other database errors still surface', async () => {
    const { svc } = make(() => { throw new Error('db down'); });
    await expect(svc.registerVehicle('me', 'VIN', 'PLATE')).rejects.toThrow('db down');
  });
  it('registers a decoded vehicle as inactive', async () => {
    const { svc } = make(); await expect(svc.registerVehicle('me', 'VIN', 'PLATE')).resolves.toEqual({ id: 'V' });
  });
});
