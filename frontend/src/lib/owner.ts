/** Mirror of the backend's PLATFORM_FEE_BPS (pricing.service.ts). Shown as an estimate; the server decides. */
export const PLATFORM_FEE_BPS = 1500;
export const MIN_PHOTOS = 3;

/** "80", "80.5", "$1,200.25" to cents. Returns null for anything that isn't a positive amount. */
export function toCents(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(parseFloat(clean) * 100);
  return cents > 0 ? cents : null;
}
export const ownerNetCents = (grossCents: number) => grossCents - Math.round((grossCents * PLATFORM_FEE_BPS) / 10000);
export const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

export interface DraftForm {
  seats: string; transmission: '' | 'automatic' | 'manual'; fuelType: '' | 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  mileageLimitPerDay: string; features: string[];
  price: string; locationLabel: string; lat?: number; lng?: number; description: string;
  instantBook: boolean; delivery: boolean; deliveryFee: string; deliveryRadius: string; minTier: 'new' | 'standard' | 'trusted' | 'elite';
  listingId?: string;
}
export const EMPTY_DRAFT: DraftForm = {
  seats: '', transmission: '', fuelType: '', mileageLimitPerDay: '', features: [], price: '', locationLabel: '', description: '',
  instantBook: true, delivery: false, deliveryFee: '0', deliveryRadius: '10', minTier: 'standard',
};

export type StepKey = 'car' | 'photos' | 'details' | 'price' | 'preview';
export interface Check { key: string; label: string; done: boolean; fixStep: StepKey }

/** What still stands between this car and going live, in the owner's words. */
export function readiness(photoCount: number, f: DraftForm): Check[] {
  return [
    { key: 'photos', label: `At least ${MIN_PHOTOS} photos`, done: photoCount >= MIN_PHOTOS, fixStep: 'photos' },
    { key: 'specs', label: 'Seats, gearbox and fuel', done: !!f.seats && !!f.transmission && !!f.fuelType, fixStep: 'details' },
    { key: 'price', label: 'A daily price', done: toCents(f.price) != null, fixStep: 'price' },
    { key: 'place', label: 'Where the car is', done: f.locationLabel.trim().length > 1, fixStep: 'price' },
  ];
}
