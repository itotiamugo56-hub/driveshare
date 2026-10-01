/**
 * DriveShare — exhaustive demo seed.
 *
 * Fills every screen and every admin panel: users in every state, 15 cars with 3 photos each,
 * trips in every lifecycle state (completed, in progress, upcoming, awaiting host, cancelled),
 * payments / deposits / payouts / ledger, insurance quotes / policies / claims, disputes at every
 * tier, fraud cases, digital keys + telematics, deliveries, maintenance, reviews + badges, identity
 * + compliance records, staff permissions, audit log, incidents, alerts, flags and config.
 *
 * Safe to run repeatedly: every row has a deterministic id, and each run replaces what the previous
 * run created. Users and vehicles are matched by email / VIN. Nothing you create by hand is touched.
 *
 *   npm run seed                       -> full seed
 *   SEED_DRY_RUN=1 npm run seed        -> builds + validates the data without touching the database
 *
 * Every account uses the password:  Password123!
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

const DRY = !!process.env.SEED_DRY_RUN;
// In a dry run no database client is created at all, so it works with no database and no generated engine.
const prisma: PrismaClient = DRY ? (new Proxy({}, { get: () => ({}) }) as PrismaClient) : new PrismaClient();
const PASSWORD = 'Password123!';

// ------------------------------------------------------------------ time + id helpers
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date();
const TODAY = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));
/** UTC midnight, n days from today (negative = past). */
const day = (n: number) => new Date(+TODAY + n * DAY);
/** n hours before now. */
const ago = (h: number) => new Date(+NOW - h * HOUR);
/** n hours after now. */
const soon = (h: number) => new Date(+NOW + h * HOUR);

/** Deterministic, valid UUIDv4-shaped id from a name, so re-runs replace instead of duplicating. */
function uid(name: string): string {
  const h = createHash('sha1').update(`driveshare-seed:${name}`).digest('hex');
  const variant = '89ab'[parseInt(h[16], 16) % 4];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Seeded PRNG so the "random" data is identical on every run. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry(20260930);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ plan: delete (reverse) then insert (forward)
interface PlanItem { name: string; delegate: any; rows: any[]; key: string; values: string[] }
const plan: PlanItem[] = [];
/** Registers a table: its rows, plus which rows of the previous run to clear first (field in values). Defaults to the rows' own ids. */
function add(name: string, delegate: any, rows: any[], opts?: { field: string; values: string[] }) {
  plan.push({ name, delegate, rows, key: opts?.field ?? 'id', values: opts?.values ?? rows.map((r) => r.id) });
}

// ------------------------------------------------------------------ types
type Tier = 'new' | 'standard' | 'trusted' | 'elite';
type Cov = 'baseline' | 'standard' | 'premium';
type UserKey =
  | 'owner' | 'host' | 'fleet' | 'renter' | 'newbie' | 'elite' | 'admin' | 'support'
  | 'arbitrator' | 'service' | 'suspended' | 'risky' | 'expired' | 'rejected';

const USERS: { key: UserKey; email: string; role: 'user' | 'support_agent' | 'arbitrator' | 'admin' | 'service'; phone: string }[] = [
  { key: 'owner',      email: 'owner@driveshare.dev',      role: 'user',          phone: '+254711000001' },
  { key: 'host',       email: 'host@driveshare.dev',       role: 'user',          phone: '+254711000002' },
  { key: 'fleet',      email: 'fleet@driveshare.dev',      role: 'user',          phone: '+254711000003' },
  { key: 'renter',     email: 'renter@driveshare.dev',     role: 'user',          phone: '+254711000004' },
  { key: 'newbie',     email: 'newbie@driveshare.dev',     role: 'user',          phone: '+254711000005' },
  { key: 'elite',      email: 'elite@driveshare.dev',      role: 'user',          phone: '+254711000006' },
  { key: 'admin',      email: 'admin@driveshare.dev',      role: 'admin',         phone: '+254711000007' },
  { key: 'support',    email: 'support@driveshare.dev',    role: 'support_agent', phone: '+254711000008' },
  { key: 'arbitrator', email: 'arbitrator@driveshare.dev', role: 'arbitrator',    phone: '+254711000009' },
  { key: 'service',    email: 'service@driveshare.dev',    role: 'service',       phone: '+254711000010' },
  { key: 'suspended',  email: 'suspended@driveshare.dev',  role: 'user',          phone: '+254711000011' },
  { key: 'risky',      email: 'risky@driveshare.dev',      role: 'user',          phone: '+254711000012' },
  { key: 'expired',    email: 'expired@driveshare.dev',    role: 'user',          phone: '+254711000013' },
  { key: 'rejected',   email: 'rejected@driveshare.dev',   role: 'user',          phone: '+254711000014' },
];

const TRUST: Record<UserKey, { score: number; tier: Tier; f: [number, number, number, number, number] }> = {
  //                       score  tier        verification tripHistory behavior disputes fraud
  owner:      { score: 560, tier: 'standard', f: [1, 0.55, 0.82, 0.9, 1] },
  host:       { score: 720, tier: 'trusted',  f: [1, 0.8, 0.95, 1, 1] },
  fleet:      { score: 890, tier: 'elite',    f: [1, 1, 0.97, 1, 1] },
  renter:     { score: 530, tier: 'standard', f: [1, 0.4, 0.84, 0.8, 1] },
  newbie:     { score: 300, tier: 'new',      f: [0.3, 0, 0.6, 1, 1] },
  elite:      { score: 910, tier: 'elite',    f: [1, 1, 0.99, 1, 1] },
  admin:      { score: 600, tier: 'standard', f: [1, 0.3, 0.6, 1, 1] },
  support:    { score: 500, tier: 'standard', f: [1, 0.2, 0.6, 1, 1] },
  arbitrator: { score: 500, tier: 'standard', f: [1, 0.2, 0.6, 1, 1] },
  service:    { score: 500, tier: 'standard', f: [1, 0.2, 0.6, 1, 1] },
  suspended:  { score: 240, tier: 'new',      f: [1, 0.2, 0.5, 0.4, 0.25] },
  risky:      { score: 180, tier: 'new',      f: [0.3, 0.1, 0.5, 0.6, 0.25] },
  expired:    { score: 450, tier: 'standard', f: [1, 0.3, 0.75, 0.9, 1] },
  rejected:   { score: 310, tier: 'new',      f: [0.3, 0, 0.6, 1, 1] },
};

const COV: Record<Cov, { mult: number; ded: number }> = {
  baseline: { mult: 1.0, ded: 150000 },
  standard: { mult: 1.4, ded: 75000 },
  premium:  { mult: 1.9, ded: 25000 },
};
/** Mirrors InsuranceService.estimateDailyPremiumCents so seeded prices match what the app would quote. */
function dailyCover(cov: Cov, renterTier: Tier): number {
  let m = 1.0;
  if (renterTier === 'new') m += 0.3;
  if (renterTier === 'elite') m -= 0.15;
  m = Math.max(0.5, m);
  return Math.round(2000 * COV[cov].mult * m);
}

// ------------------------------------------------------------------ cars
interface ListingSpec {
  key: string; status: 'draft' | 'active' | 'paused' | 'removed'; priceUsd: number; label: string; lat: number; lng: number;
  delivery: { delivery: boolean; radius_km: number; fee: number }; instantBook: boolean; description: string;
  minTier?: Tier; ageDays: number;
}
interface CarSpec {
  slug: string; owner: UserKey; vin: string; plate: string; make: string; model: string; year: number; trim?: string;
  seats: number; transmission: 'automatic' | 'manual'; fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  mileageLimitPerDay: number; features: string[];
  vehicleStatus: 'active' | 'inactive' | 'under_review' | 'suspended';
  ownership: 'pending' | 'verified' | 'rejected';
  company?: boolean; device?: 'aftermarket_smart_lock' | 'native_connected_car_api'; bulkTrips: number;
  listings: ListingSpec[];
}
const NODELIVERY = { delivery: false, radius_km: 0, fee: 0 };

const CARS: CarSpec[] = [
  { slug: 'toyota-corolla', owner: 'owner', vin: 'SEEDCOROLLA000001', plate: 'KDA 214J', make: 'Toyota', model: 'Corolla', year: 2019, trim: 'Axio',
    seats: 5, transmission: 'automatic', fuelType: 'gasoline', mileageLimitPerDay: 200, vehicleStatus: 'active', ownership: 'verified', device: 'aftermarket_smart_lock', bulkTrips: 2,
    features: ['Bluetooth', 'Air conditioning', 'USB charging', 'Backup camera'],
    listings: [{ key: 'corolla', status: 'active', priceUsd: 38, label: 'Kikuyu Town', lat: -1.2458, lng: 36.6631, delivery: { delivery: true, radius_km: 15, fee: 5 }, instantBook: true, ageDays: 210,
      description: 'Reliable, economical sedan that is easy to drive and easy on fuel. Good for the Nairobi commute or a weekend trip.' }] },
  { slug: 'suzuki-swift', owner: 'owner', vin: 'SEEDSWIFT00000002', plate: 'KDC 552M', make: 'Suzuki', model: 'Swift', year: 2020,
    seats: 5, transmission: 'manual', fuelType: 'gasoline', mileageLimitPerDay: 150, vehicleStatus: 'active', ownership: 'verified', device: 'aftermarket_smart_lock', bulkTrips: 2,
    features: ['Bluetooth', 'Air conditioning', 'USB charging'],
    listings: [{ key: 'swift', status: 'active', priceUsd: 26, label: 'Kabete', lat: -1.2553, lng: 36.7278, delivery: NODELIVERY, instantBook: true, ageDays: 190,
      description: 'Small, nippy hatchback with a manual gearbox. The cheapest way to get around town and park anywhere.' }] },
  { slug: 'mazda-cx5', owner: 'owner', vin: 'SEEDMAZDACX500003', plate: 'KDD 718P', make: 'Mazda', model: 'CX-5', year: 2018, trim: 'Touring',
    seats: 5, transmission: 'automatic', fuelType: 'gasoline', mileageLimitPerDay: 250, vehicleStatus: 'active', ownership: 'verified', device: 'native_connected_car_api', bulkTrips: 2,
    features: ['Bluetooth', 'Air conditioning', 'Backup camera', 'Apple CarPlay', 'GPS'],
    listings: [{ key: 'cx5', status: 'active', priceUsd: 62, label: 'Westlands, Nairobi', lat: -1.2676, lng: 36.8108, delivery: { delivery: true, radius_km: 20, fee: 8 }, instantBook: true, minTier: 'standard', ageDays: 170,
      description: 'Comfortable crossover with a quiet cabin and good ground clearance. Handles highway and rough roads alike.' }] },
  { slug: 'nissan-note', owner: 'owner', vin: 'SEEDNISSANNOTE004', plate: 'KCY 096T', make: 'Nissan', model: 'Note', year: 2017,
    seats: 5, transmission: 'automatic', fuelType: 'gasoline', mileageLimitPerDay: 150, vehicleStatus: 'active', ownership: 'verified', device: 'aftermarket_smart_lock', bulkTrips: 2,
    features: ['Bluetooth', 'Air conditioning', 'Backup camera'],
    listings: [{ key: 'note', status: 'active', priceUsd: 30, label: 'Limuru', lat: -1.1078, lng: 36.6425, delivery: NODELIVERY, instantBook: false, ageDays: 150,
      description: 'Roomy little automatic with great fuel economy. Host approves each booking request.' }] },
  { slug: 'volkswagen-polo', owner: 'owner', vin: 'SEEDPOLO000000014', plate: 'KDG 120V', make: 'Volkswagen', model: 'Polo', year: 2018, trim: 'Comfortline',
    seats: 5, transmission: 'manual', fuelType: 'gasoline', mileageLimitPerDay: 180, vehicleStatus: 'active', ownership: 'verified', bulkTrips: 2,
    features: ['Bluetooth', 'Air conditioning', 'USB charging'],
    listings: [
      { key: 'polo', status: 'paused', priceUsd: 34, label: 'Juja', lat: -1.1017, lng: 37.0144, delivery: NODELIVERY, instantBook: true, ageDays: 60,
        description: 'Paused while the owner is travelling. Crisp handling and a proper boot for a hatchback.' },
      { key: 'polo-old', status: 'removed', priceUsd: 29, label: 'Juja', lat: -1.1017, lng: 37.0144, delivery: NODELIVERY, instantBook: true, ageDays: 240,
        description: 'Older listing, replaced after a price change.' },
    ] },
  { slug: 'bmw-x3', owner: 'owner', vin: 'SEEDBMWX300000015', plate: 'KDH 777X', make: 'BMW', model: 'X3', year: 2019, trim: 'xDrive20d',
    seats: 5, transmission: 'automatic', fuelType: 'diesel', mileageLimitPerDay: 250, vehicleStatus: 'under_review', ownership: 'pending', bulkTrips: 0,
    features: ['Leather seats', 'GPS', 'Air conditioning', 'Bluetooth', 'Backup camera'],
    listings: [{ key: 'x3', status: 'draft', priceUsd: 88, label: 'Lavington, Nairobi', lat: -1.2806, lng: 36.7702, delivery: { delivery: true, radius_km: 15, fee: 10 }, instantBook: false, minTier: 'trusted', ageDays: 3,
      description: 'Draft: waiting for ownership documents to be verified before it can go live.' }] },
  { slug: 'toyota-prado', owner: 'host', vin: 'SEEDPRADO00000005', plate: 'KDB 803L', make: 'Toyota', model: 'Land Cruiser Prado', year: 2017, trim: 'TX',
    seats: 7, transmission: 'automatic', fuelType: 'diesel', mileageLimitPerDay: 300, vehicleStatus: 'active', ownership: 'verified', device: 'native_connected_car_api', bulkTrips: 3,
    features: ['4WD', 'Air conditioning', 'Bluetooth', 'GPS', 'Roof rack', 'Backup camera'],
    listings: [{ key: 'prado', status: 'active', priceUsd: 95, label: 'Karen, Nairobi', lat: -1.3196, lng: 36.7076, delivery: { delivery: true, radius_km: 30, fee: 12 }, instantBook: true, minTier: 'trusted', ageDays: 300,
      description: 'Seven-seat 4WD for safaris, long trips and bad roads. Diesel, with plenty of space for luggage.' }] },
  { slug: 'subaru-forester', owner: 'host', vin: 'SEEDFORESTER00006', plate: 'KDE 341R', make: 'Subaru', model: 'Forester', year: 2018,
    seats: 5, transmission: 'automatic', fuelType: 'gasoline', mileageLimitPerDay: 250, vehicleStatus: 'active', ownership: 'verified', device: 'aftermarket_smart_lock', bulkTrips: 3,
    features: ['All-wheel drive', 'Air conditioning', 'Bluetooth', 'Roof rack', 'USB charging'],
    listings: [{ key: 'forester', status: 'active', priceUsd: 55, label: 'Ruaka', lat: -1.2055, lng: 36.7792, delivery: { delivery: true, radius_km: 10, fee: 4 }, instantBook: true, ageDays: 260,
      description: 'All-wheel-drive wagon that feels safe in the rain and on murram. Comfortable for a family.' }] },
  { slug: 'toyota-noah', owner: 'host', vin: 'SEEDNOAH000000007', plate: 'KCX 627N', make: 'Toyota', model: 'Noah', year: 2016,
    seats: 8, transmission: 'automatic', fuelType: 'hybrid', mileageLimitPerDay: 300, vehicleStatus: 'active', ownership: 'verified', device: 'aftermarket_smart_lock', bulkTrips: 3,
    features: ['Air conditioning', 'Bluetooth', 'Child seat available', 'USB charging'],
    listings: [{ key: 'noah', status: 'active', priceUsd: 70, label: 'Roysambu, Thika Road', lat: -1.2188, lng: 36.8856, delivery: { delivery: true, radius_km: 25, fee: 10 }, instantBook: false, ageDays: 240,
      description: 'Eight-seat hybrid van for groups, weddings and airport runs. Sliding doors and lots of legroom.' }] },
  { slug: 'nissan-leaf', owner: 'host', vin: 'SEEDNISSANLEAF008', plate: 'KDF 459S', make: 'Nissan', model: 'Leaf', year: 2019,
    seats: 5, transmission: 'automatic', fuelType: 'electric', mileageLimitPerDay: 120, vehicleStatus: 'active', ownership: 'verified', device: 'native_connected_car_api', bulkTrips: 3,
    features: ['Air conditioning', 'Bluetooth', 'Backup camera', 'Apple CarPlay'],
    listings: [{ key: 'leaf', status: 'active', priceUsd: 42, label: 'Kiambu Town', lat: -1.1714, lng: 36.8356, delivery: NODELIVERY, instantBook: true, ageDays: 200,
      description: 'Fully electric and very quiet. Ideal for city driving; charge cable included.' }] },
  { slug: 'honda-fit', owner: 'host', vin: 'SEEDFIT0000000013', plate: 'KDJ 305F', make: 'Honda', model: 'Fit', year: 2015,
    seats: 5, transmission: 'automatic', fuelType: 'hybrid', mileageLimitPerDay: 150, vehicleStatus: 'inactive', ownership: 'rejected', bulkTrips: 0,
    features: ['Bluetooth', 'Air conditioning'],
    listings: [{ key: 'fit', status: 'draft', priceUsd: 28, label: 'Kilimani, Nairobi', lat: -1.289, lng: 36.783, delivery: NODELIVERY, instantBook: true, ageDays: 9,
      description: 'Draft: ownership document was rejected, so this car is not live yet.' }] },
  { slug: 'toyota-hilux', owner: 'fleet', vin: 'SEEDHILUX00000009', plate: 'KDK 911H', make: 'Toyota', model: 'Hilux', year: 2020, trim: 'Double Cab',
    seats: 5, transmission: 'manual', fuelType: 'diesel', mileageLimitPerDay: 300, vehicleStatus: 'active', ownership: 'verified', company: true, device: 'native_connected_car_api', bulkTrips: 3,
    features: ['4WD', 'Air conditioning', 'Bluetooth', 'Tow bar', 'Canopy'],
    listings: [{ key: 'hilux', status: 'active', priceUsd: 80, label: 'Ngong Road, Nairobi', lat: -1.3009, lng: 36.7729, delivery: { delivery: true, radius_km: 30, fee: 12 }, instantBook: true, minTier: 'standard', ageDays: 320,
      description: 'Double-cab pickup with a canopy. Built for farm runs, site visits and rough country.' }] },
  { slug: 'toyota-hiace', owner: 'fleet', vin: 'SEEDHIACE00000010', plate: 'KDL 448H', make: 'Toyota', model: 'Hiace', year: 2018, trim: 'Commuter',
    seats: 14, transmission: 'manual', fuelType: 'diesel', mileageLimitPerDay: 350, vehicleStatus: 'active', ownership: 'verified', company: true, device: 'aftermarket_smart_lock', bulkTrips: 3,
    features: ['Air conditioning', 'USB charging', 'Luggage rack', 'Sliding door'],
    listings: [{ key: 'hiace', status: 'active', priceUsd: 110, label: 'Industrial Area, Nairobi', lat: -1.309, lng: 36.85, delivery: { delivery: true, radius_km: 40, fee: 15 }, instantBook: true, ageDays: 280,
      description: 'Fourteen-seat commuter van for teams, tours and events. Driver not included.' }] },
  { slug: 'mercedes-c200', owner: 'fleet', vin: 'SEEDC200000000011', plate: 'KDM 200C', make: 'Mercedes-Benz', model: 'C200', year: 2019, trim: 'Avantgarde',
    seats: 5, transmission: 'automatic', fuelType: 'gasoline', mileageLimitPerDay: 200, vehicleStatus: 'active', ownership: 'verified', company: true, device: 'native_connected_car_api', bulkTrips: 3,
    features: ['Leather seats', 'GPS', 'Apple CarPlay', 'Backup camera', 'Air conditioning'],
    listings: [{ key: 'c200', status: 'active', priceUsd: 120, label: 'Kileleshwa, Nairobi', lat: -1.2754, lng: 36.7846, delivery: { delivery: true, radius_km: 20, fee: 15 }, instantBook: true, minTier: 'trusted', ageDays: 250,
      description: 'Executive sedan for airport pick-ups, weddings and client days.' }] },
  { slug: 'mitsubishi-outlander', owner: 'fleet', vin: 'SEEDOUTLANDER00012', plate: 'KDN 612O', make: 'Mitsubishi', model: 'Outlander', year: 2017,
    seats: 7, transmission: 'automatic', fuelType: 'gasoline', mileageLimitPerDay: 250, vehicleStatus: 'suspended', ownership: 'verified', company: true, device: 'aftermarket_smart_lock', bulkTrips: 3,
    features: ['All-wheel drive', 'Air conditioning', 'Bluetooth', 'Roof rails'],
    listings: [{ key: 'outlander', status: 'paused', priceUsd: 58, label: 'Runda, Nairobi', lat: -1.211, lng: 36.8058, delivery: { delivery: true, radius_km: 15, fee: 6 }, instantBook: true, ageDays: 230,
      description: 'Paused: vehicle is suspended pending an inspection after a tamper alert.' }] },
];

// ------------------------------------------------------------------ photos (3 per car, data URIs like the app's own upload)
const PHOTO_DIR = path.join(__dirname, 'seed-photos');
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
/** <slug>.jpg is the main photo; <slug>-2.jpg, <slug>-3.jpg ... follow. Replace any of them with your own real photos. */
function loadPhotos(slug: string): string[] {
  if (!fs.existsSync(PHOTO_DIR)) return [];
  const files = fs.readdirSync(PHOTO_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f, path.extname(f));
    return MIME[ext] && (base === slug || new RegExp(`^${slug}-\\d+$`).test(base));
  });
  const order = (f: string) => {
    const base = path.basename(f, path.extname(f));
    return base === slug ? 0 : parseInt(base.slice(slug.length + 1), 10);
  };
  files.sort((a, b) => order(a) - order(b));
  return files.map((f) => `data:${MIME[path.extname(f).toLowerCase()]};base64,${fs.readFileSync(path.join(PHOTO_DIR, f)).toString('base64')}`);
}

// ------------------------------------------------------------------ review wording
const POS_TO_OWNER = [
  'Car was spotless and exactly as described. Pick-up took two minutes.',
  'Great communication and a very fair price. Would rent again.',
  'Smooth handover, tank full as promised, no surprises at all.',
  'Drove it up to Naivasha and back without a single issue. Comfortable car.',
  'Host replied within minutes and was flexible on the return time.',
  'Clean, reliable and well looked after. Easy five stars.',
];
const OK_TO_OWNER = [
  'Good car overall. A warning light came on briefly but the host explained it quickly.',
  'Fine for the price. Interior could have been cleaner.',
  'Pick-up was a bit late but the host apologised and it was sorted.',
];
const BAD_TO_OWNER = [
  'Car was not as clean as the photos suggested and the air conditioning was weak.',
  'Host was hard to reach on the morning of pick-up.',
];
const TO_RENTER = [
  'Returned on time and left the car clean. Welcome back anytime.',
  'Careful driver, great communication throughout the trip.',
  'Easy handover and respectful of the car. Five stars.',
  'Smooth trip, no issues at all.',
];
const OK_TO_RENTER = ['Returned a little late but let me know in advance.', 'Car came back fine; a bit of sand in the boot.'];

// ------------------------------------------------------------------ main
interface Ref {
  slug: string; listingId: string; ownerKey: UserKey; vehicleId: string; priceCents: number;
  delivery: { delivery: boolean; radius_km: number; fee: number }; instant: boolean; label: string; lat: number; lng: number;
}
type Life = 'completed' | 'inProgress' | 'upcoming' | 'requested' | 'cancelled';
interface TripOpts {
  key: string; car: string; renter: UserKey; startDay: number; days: number; life: Life;
  cov?: Cov; delivery?: boolean; cancelledBy?: 'renter' | 'owner'; cancelHoursBefore?: number;
  reviews?: 'both' | 'renter_only' | 'owner_only' | 'renter_old_lone' | 'both_pending_window' | 'none';
  toOwner?: number; toRenter?: number; toOwnerText?: string | null; toRenterText?: string | null;
  damageCents?: number; capture?: 'partial' | 'full'; damageNotes?: boolean;
  payout?: 'paid' | 'processing' | 'scheduled' | 'failed';
  deliveryStatus?: 'requested' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  assignee?: 'owner' | 'third_party_partner'; keyRevoked?: boolean; geofence?: boolean; extraFailedCheck?: boolean;
}
interface TripMeta {
  id: string; key: string; car: string; ownerKey: UserKey; renter: UserKey; start: Date; end: Date; days: number; life: Life;
  policyId: string | null; rentalCents: number; totalCents: number; depositCents: number; cov: Cov;
  listingId: string; vehicleId: string; createdAt: Date; reviewIds: string[];
}

const b64 = (s: string) => Buffer.from(s).toString('base64');
/** Never let a historical record carry a timestamp in the future. */
const cl = (d: Date) => new Date(Math.min(+d, +NOW - 60_000));
const short = (id: string) => id.slice(0, 8);
const DRIVING: Partial<Record<UserKey, 'low' | 'medium' | 'high'>> = { expired: 'medium', risky: 'high', suspended: 'high' };
const NAIROBI_DROPOFFS = [
  { address: 'Jomo Kenyatta International Airport, Departures', lat: -1.3192, lng: 36.9278 },
  { address: 'The Hub Karen, Dagoretti Road', lat: -1.3187, lng: 36.7126 },
  { address: 'Two Rivers Mall, Limuru Road', lat: -1.2117, lng: 36.8047 },
  { address: 'Yaya Centre, Argwings Kodhek Road', lat: -1.2914, lng: 36.7879 },
  { address: 'Sarit Centre, Westlands', lat: -1.2597, lng: 36.8039 },
  { address: 'Kikuyu Town, Waiyaki Way', lat: -1.2458, lng: 36.6631 },
];

async function main() {
  console.log(DRY ? 'DRY RUN: building and validating data, database untouched.' : 'Seeding DriveShare demo data...');
  const passwordHash = DRY ? 'dry-run' : await bcrypt.hash(PASSWORD, 10);
  /** Rows written outside the plan (users, company, tiers, vehicles); captured in dry-run so they can be exported for testing. */
  const preRows: { table: string; rows: any[] }[] = [{ table: 'User', rows: [] }, { table: 'CompanyProfile', rows: [] }, { table: 'CoverageTier', rows: [] }, { table: 'Vehicle', rows: [] }];

  // ---------------------------------------------------------------- users (matched by email)
  const U = {} as Record<UserKey, string>;
  for (const u of USERS) {
    if (DRY) { U[u.key] = uid(`user:${u.key}`); preRows[0].rows.push({ id: U[u.key], email: u.email, passwordHash, role: u.role, phone: u.phone }); continue; }
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, phone: u.phone, passwordHash },
      create: { id: uid(`user:${u.key}`), email: u.email, passwordHash, role: u.role, phone: u.phone },
    });
    U[u.key] = row.id;
  }
  const seededUserIds = USERS.map((u) => U[u.key]);

  // ---------------------------------------------------------------- company profile (fleet operator)
  let companyId = uid('company:fleet');
  const COMPANY_NAME = 'Savannah Wheels Ltd';
  const COMPANY_DESC = 'Nairobi-based fleet operator: pickups, vans and executive sedans, serviced on a fixed schedule and delivered to your door.';
  if (DRY) preRows[1].rows.push({ id: companyId, ownerUserId: U.fleet, name: COMPANY_NAME, description: COMPANY_DESC });
  if (!DRY) {
    const c = await prisma.companyProfile.upsert({
      where: { ownerUserId: U.fleet },
      update: { name: COMPANY_NAME, description: COMPANY_DESC },
      create: { id: companyId, ownerUserId: U.fleet, name: COMPANY_NAME, description: COMPANY_DESC },
    });
    companyId = c.id;
  }

  // ---------------------------------------------------------------- coverage tiers (one per name; removes duplicates from earlier seed runs)
  const TIER_ID: Record<Cov, string> = { baseline: uid('tier:baseline'), standard: uid('tier:standard'), premium: uid('tier:premium') };
  const LIABILITY: Record<Cov, bigint> = { baseline: 3000000000n, standard: 5000000000n, premium: 10000000000n };
  if (DRY) preRows[2].rows.push(...(['baseline', 'standard', 'premium'] as Cov[]).map((n) => ({ id: TIER_ID[n], name: n, deductibleCents: COV[n].ded, liabilityLimitCents: LIABILITY[n], basePriceMultiplier: COV[n].mult })));
  if (!DRY) {
    const all = await prisma.coverageTier.findMany({ orderBy: { id: 'asc' } });
    for (const name of ['baseline', 'standard', 'premium'] as Cov[]) {
      const data = { deductibleCents: COV[name].ded, liabilityLimitCents: LIABILITY[name], basePriceMultiplier: COV[name].mult };
      const same = all.filter((t) => t.name === name);
      if (same.length === 0) {
        const t = await prisma.coverageTier.create({ data: { id: TIER_ID[name], name, ...data } });
        TIER_ID[name] = t.id;
        continue;
      }
      const keep = same[0];
      await prisma.coverageTier.update({ where: { id: keep.id }, data });
      TIER_ID[name] = keep.id;
      const dupes = same.slice(1).map((t) => t.id);
      if (dupes.length) {
        await prisma.policy.updateMany({ where: { tierId: { in: dupes } }, data: { tierId: keep.id } });
        await prisma.insuranceQuote.updateMany({ where: { tierId: { in: dupes } }, data: { tierId: keep.id } });
        await prisma.trip.updateMany({ where: { coverageTierId: { in: dupes } }, data: { coverageTierId: keep.id } });
        await prisma.coverageTier.deleteMany({ where: { id: { in: dupes } } });
      }
    }
  }

  // ---------------------------------------------------------------- vehicles (matched by VIN)
  const VID: Record<string, string> = {};
  for (const c of CARS) {
    const data = {
      ownerId: U[c.owner],
      licensePlateEnc: b64(c.plate),
      make: c.make, model: c.model, year: c.year, trim: c.trim ?? null,
      seats: c.seats, transmission: c.transmission, fuelType: c.fuelType,
      mileageLimitPerDay: c.mileageLimitPerDay, features: c.features,
      ownershipDocTokenRef: uid(`doc:ownership:${c.slug}`),
      ownershipVerificationStatus: c.ownership,
      telematicsDeviceId: c.device ? `dev-${c.slug}` : null,
      status: c.vehicleStatus,
      companyProfileId: c.company ? companyId : null,
    };
    if (DRY) { VID[c.slug] = uid(`vehicle:${c.slug}`); preRows[3].rows.push({ id: VID[c.slug], vin: c.vin, ...data }); continue; }
    const row = await prisma.vehicle.upsert({ where: { vin: c.vin }, update: data, create: { id: uid(`vehicle:${c.slug}`), vin: c.vin, ...data } });
    VID[c.slug] = row.id;
  }

  // ---------------------------------------------------------------- row buckets (registered in insert order below)
  const trustRows: Prisma.TrustScoreCreateManyInput[] = [];
  const listingRows: Prisma.ListingCreateManyInput[] = [];
  const photoRows: Prisma.VehiclePhotoCreateManyInput[] = [];
  const baselineRows: Prisma.ConditionBaselineCreateManyInput[] = [];
  const pmRows: Prisma.PaymentMethodCreateManyInput[] = [];
  const trips: Prisma.TripCreateManyInput[] = [];
  const auths: Prisma.PaymentAuthorizationCreateManyInput[] = [];
  const deposits: Prisma.DepositHoldCreateManyInput[] = [];
  const payouts: Prisma.PayoutCreateManyInput[] = [];
  const ledger: Prisma.TransactionLedgerEntryCreateManyInput[] = [];
  const quotes: Prisma.InsuranceQuoteCreateManyInput[] = [];
  const policies: Prisma.PolicyCreateManyInput[] = [];
  const comps: Prisma.ComprehensionCheckAttemptCreateManyInput[] = [];
  const keys: Prisma.DigitalKeyCreateManyInput[] = [];
  const geofences: Prisma.GeofenceRuleCreateManyInput[] = [];
  const deliveries: Prisma.DeliveryRequestCreateManyInput[] = [];
  const reviews: Prisma.ReviewCreateManyInput[] = [];
  const risks: Prisma.RiskEvaluationCreateManyInput[] = [];
  const cancelRisks: Prisma.CancellationRiskScoreCreateManyInput[] = [];

  // ---------------------------------------------------------------- trust scores
  for (const u of USERS) {
    const t = TRUST[u.key];
    trustRows.push({
      userId: U[u.key], overallScore: t.score, tier: t.tier, scoreVersion: between(2, 14),
      lastCalculatedAt: ago(between(6, 200)),
      factorBreakdown: { verification: t.f[0], tripHistory: t.f[1], behavior: t.f[2], disputes: t.f[3], fraud: t.f[4] },
    });
  }

  // ---------------------------------------------------------------- listings, photos, listing baselines
  const CAR: Record<string, Ref> = {};
  const odo: Record<string, number> = {};
  for (const c of CARS) {
    odo[c.slug] = between(38, 118) * 1000;
    c.listings.forEach((l, i) => {
      const listingId = uid(`listing:${l.key}`);
      listingRows.push({
        id: listingId, vehicleId: VID[c.slug], ownerId: U[c.owner], basePriceCents: l.priceUsd * 100, currency: 'USD',
        description: l.description, locationLat: l.lat, locationLng: l.lng, locationLabel: l.label,
        instantBookEnabled: l.instantBook, deliveryOptions: l.delivery, minimumTrustTier: l.minTier ?? null,
        status: l.status, createdAt: ago(l.ageDays * 24), updatedAt: ago(Math.min(l.ageDays, 12) * 24),
      });
      if (i === 0) CAR[c.slug] = { slug: c.slug, listingId, ownerKey: c.owner, vehicleId: VID[c.slug], priceCents: l.priceUsd * 100, delivery: l.delivery, instant: l.instantBook, label: l.label, lat: l.lat, lng: l.lng };
    });
    loadPhotos(c.slug).forEach((url, i) => photoRows.push({ id: uid(`photo:${c.slug}:${i}`), vehicleId: VID[c.slug], url, position: i, createdAt: ago(c.listings[0].ageDays * 24 - i) }));
    if (c.vehicleStatus !== 'under_review') {
      baselineRows.push({
        id: uid(`baseline:${c.slug}:listing`), vehicleId: VID[c.slug], tripId: null, type: 'listing_baseline',
        mediaAssetRefs: ['front', 'rear', 'left', 'right', 'interior', 'dashboard'].map((p) => `mock://vehicle/${c.slug}/baseline/${p}.jpg`),
        aiDamageAnnotations: [], odometerReading: odo[c.slug], fuelOrChargeLevel: 1, capturedAt: ago(c.listings[0].ageDays * 24 - 2),
      });
    }
  }

  // ---------------------------------------------------------------- payment methods
  const PM = {} as Record<UserKey, string>;
  const VISA_LAST4: Record<UserKey, string> = {
    owner: '1111', host: '2222', fleet: '3333', renter: '4242', newbie: '0341', elite: '8888', admin: '9999', support: '1212',
    arbitrator: '3434', service: '5656', suspended: '7777', risky: '0002', expired: '6060', rejected: '1313',
  };
  for (const u of USERS) {
    PM[u.key] = uid(`pm:${u.key}:visa`);
    pmRows.push({ id: PM[u.key], userId: U[u.key], processorToken: `tok_mock_${u.key}_visa`, type: 'card', brand: 'Visa', last4: VISA_LAST4[u.key], status: 'active', createdAt: ago(24 * 220) });
  }
  pmRows.push(
    { id: uid('pm:renter:mc'), userId: U.renter, processorToken: 'tok_mock_renter_mc', type: 'card', brand: 'Mastercard', last4: '5454', status: 'active', createdAt: ago(24 * 90) },
    { id: uid('pm:renter:amex'), userId: U.renter, processorToken: 'tok_mock_renter_amex', type: 'card', brand: 'American Express', last4: '0005', status: 'expired', createdAt: ago(24 * 500) },
    { id: uid('pm:renter:mpesa'), userId: U.renter, processorToken: 'tok_mock_renter_mpesa', type: 'wallet', brand: 'M-Pesa', last4: '4471', status: 'active', createdAt: ago(24 * 60) },
    { id: uid('pm:renter:bank'), userId: U.renter, processorToken: 'tok_mock_renter_bank', type: 'bank_account', brand: 'Equity Bank', last4: '7788', status: 'removed', createdAt: ago(24 * 300) },
    { id: uid('pm:elite:mc'), userId: U.elite, processorToken: 'tok_mock_elite_mc', type: 'card', brand: 'Mastercard', last4: '4444', status: 'active', createdAt: ago(24 * 150) },
    { id: uid('pm:owner:bank'), userId: U.owner, processorToken: 'tok_mock_owner_bank', type: 'bank_account', brand: 'Equity Bank', last4: '2041', status: 'active', createdAt: ago(24 * 200) },
    { id: uid('pm:owner:mpesa'), userId: U.owner, processorToken: 'tok_mock_owner_mpesa', type: 'wallet', brand: 'M-Pesa', last4: '3310', status: 'active', createdAt: ago(24 * 200) },
    { id: uid('pm:host:bank'), userId: U.host, processorToken: 'tok_mock_host_bank', type: 'bank_account', brand: 'KCB', last4: '5512', status: 'active', createdAt: ago(24 * 280) },
    { id: uid('pm:fleet:bank'), userId: U.fleet, processorToken: 'tok_mock_fleet_bank', type: 'bank_account', brand: 'Stanbic', last4: '9021', status: 'active', createdAt: ago(24 * 330) },
  );

  // ---------------------------------------------------------------- calendar + occupancy bookkeeping
  const calMap = new Map<string, Prisma.AvailabilityCalendarCreateManyInput>();
  const setCal = (listingId: string, date: Date, status: 'available' | 'booked' | 'owner_blocked' | 'maintenance_hold') => {
    const k = `${listingId}|${+date}`;
    const ex = calMap.get(k);
    if (ex && ex.status !== status) throw new Error(`Calendar clash on ${k}: ${ex.status} vs ${status}`);
    calMap.set(k, { id: uid(`cal:${k}`), listingId, date, status });
  };
  const occ = new Map<string, [number, number][]>();
  const busy = (k: string, s: number, e: number) => (occ.get(k) ?? []).some(([a, b]) => s < b && e > a);
  const reserve = (k: string, s: number, e: number) => { occ.set(k, [...(occ.get(k) ?? []), [s, e]]); };
  const blockRange = (slug: string, from: number, to: number, status: 'owner_blocked' | 'maintenance_hold') => {
    for (let d = from; d <= to; d++) setCal(CAR[slug].listingId, day(d), status);
    reserve(`car:${slug}`, from, to + 1);
  };

  const drawRating = (subject: UserKey): number => {
    const r = rand();
    if (subject === 'host' || subject === 'fleet') return r < 0.88 ? 5 : 4;
    if (subject === 'elite') return 5;
    if (subject === 'owner') return r < 0.35 ? 5 : r < 0.7 ? 4 : r < 0.92 ? 3 : 2;
    if (subject === 'suspended') return r < 0.5 ? 3 : 2;
    if (subject === 'expired') return r < 0.3 ? 5 : r < 0.75 ? 4 : 3;
    return r < 0.7 ? 5 : 4;
  };
  const commentToOwner = (rating: number) => (rand() < 0.15 ? null : rating >= 5 ? pick(POS_TO_OWNER) : rating === 4 ? pick(OK_TO_OWNER) : pick(BAD_TO_OWNER));
  const commentToRenter = (rating: number) => (rand() < 0.2 ? null : rating >= 4 ? pick(TO_RENTER) : rating === 3 ? pick(OK_TO_RENTER) : 'Returned late and with a warning light on the dash. Please take more care.');

  // ---------------------------------------------------------------- THE TRIP ENGINE
  const T: Record<string, TripMeta> = {};
  const allTrips: TripMeta[] = [];

  function buildTrip(o: TripOpts): TripMeta {
    const car = CAR[o.car];
    if (!car) throw new Error(`Unknown car ${o.car}`);
    const owner = car.ownerKey;
    const renterTier = TRUST[o.renter].tier;
    const cov = o.cov ?? 'standard';
    const id = uid(`trip:${o.key}`);
    const start = day(o.startDay);
    const end = day(o.startDay + o.days);
    const rentalCents = car.priceCents * o.days;
    const coverCents = dailyCover(cov, renterTier) * o.days;
    const deliveryCents = o.delivery && car.delivery.delivery ? car.delivery.fee * 100 : 0;
    const totalCents = rentalCents + coverCents + deliveryCents;
    const depositCents = COV[cov].ded;
    const createdAt = o.life === 'requested' ? ago(between(5, 40)) : new Date(Math.min(+start - between(3, 6) * DAY, +NOW - between(2, 40) * HOUR));
    const hadPolicy = o.life === 'requested' ? false : o.life === 'cancelled' ? o.cancelledBy === 'renter' && car.instant : true;
    const policyId = hadPolicy ? uid(`policy:${o.key}`) : null;
    const authId = uid(`auth:${o.key}`);
    const depId = uid(`deposit:${o.key}`);
    const status = o.life === 'cancelled' ? 'cancelled' : o.life === 'requested' ? 'requested' : 'confirmed';
    const confirmed = o.life === 'completed' || o.life === 'inProgress' || o.life === 'upcoming';
    const captured = o.life === 'completed' || o.life === 'inProgress';

    if (busy(`car:${o.car}`, o.startDay, o.startDay + o.days)) throw new Error(`Trip ${o.key}: car ${o.car} already busy`);
    if (busy(`renter:${o.renter}`, o.startDay, o.startDay + o.days)) throw new Error(`Trip ${o.key}: renter ${o.renter} already busy`);
    reserve(`car:${o.car}`, o.startDay, o.startDay + o.days);
    reserve(`renter:${o.renter}`, o.startDay, o.startDay + o.days);

    const cancelledAt = o.life !== 'cancelled' ? null : o.cancelHoursBefore != null ? new Date(+start - o.cancelHoursBefore * HOUR) : new Date(+createdAt + 3 * HOUR);
    trips.push({
      id, listingId: car.listingId, vehicleId: car.vehicleId, renterId: U[o.renter], ownerId: U[owner],
      startDate: start, endDate: end, days: o.days, currency: 'USD', rentalCents, coverCents, deliveryCents, totalCents, depositCents,
      coverageTierId: TIER_ID[cov], paymentMethodId: PM[o.renter], authorizationId: authId, depositHoldId: depId, policyId,
      status, cancelledAt, cancelledBy: o.life === 'cancelled' ? U[o.cancelledBy === 'owner' ? owner : o.renter] : null,
      createdAt, updatedAt: cancelledAt ?? (captured ? start : createdAt),
    });

    // calendar
    if (confirmed) for (let d = 0; d < o.days; d++) setCal(car.listingId, day(o.startDay + d), 'booked');
    if (o.life === 'cancelled' && hadPolicy) for (let d = 0; d < o.days; d++) setCal(car.listingId, day(o.startDay + d), 'available');

    // payments
    auths.push({
      id: authId, tripId: id, payerUserId: U[o.renter], amountCents: totalCents, currency: 'USD',
      status: o.life === 'cancelled' ? 'voided' : captured ? 'captured' : 'authorized',
      processorRef: `mock_auth_${short(id)}`, authorizedAt: createdAt, capturedAt: captured ? start : null,
    });
    const damaged = (o.damageCents ?? 0) > 0;
    deposits.push({
      id: depId, tripId: id, amountCents: depositCents, currency: 'USD',
      status: o.life === 'cancelled' ? 'released' : o.life === 'completed' ? (damaged ? (o.capture === 'full' ? 'fully_captured' : 'partially_captured') : 'released') : 'held',
      captureReason: damaged && o.life === 'completed' ? (o.capture === 'full' ? 'Vehicle not returned on time; full deposit retained.' : 'Damage found at return; repair cost withheld from deposit.') : null,
      createdAt,
    });
    if (captured) {
      ledger.push(
        { id: uid(`ledger:${o.key}:rental`), tripId: id, entryType: 'rental_fee', amountCents: rentalCents, currency: 'USD', createdAt: start },
        { id: uid(`ledger:${o.key}:cover`), tripId: id, entryType: 'insurance_fee', amountCents: coverCents, currency: 'USD', createdAt: start },
        { id: uid(`ledger:${o.key}:deposit`), tripId: id, entryType: 'deposit', amountCents: depositCents, currency: 'USD', createdAt: start },
      );
      if (deliveryCents > 0) ledger.push({ id: uid(`ledger:${o.key}:delivery`), tripId: id, entryType: 'delivery_fee', amountCents: deliveryCents, currency: 'USD', createdAt: start });
    }
    if (o.life === 'completed') {
      if (damaged) ledger.push({ id: uid(`ledger:${o.key}:adj`), tripId: id, entryType: 'fee_adjustment', amountCents: o.damageCents as number, currency: 'USD', createdAt: cl(end) });
      else ledger.push({ id: uid(`ledger:${o.key}:refund`), tripId: id, entryType: 'refund', amountCents: depositCents, currency: 'USD', createdAt: cl(end) });
      const fee = Math.round(rentalCents * 0.15);
      const payoutAmount = rentalCents + deliveryCents - fee;
      const hoursSinceEnd = (+NOW - +end) / HOUR;
      const pState = o.payout ?? (hoursSinceEnd > 72 ? 'paid' : hoursSinceEnd > 24 ? 'processing' : 'scheduled');
      payouts.push({
        id: uid(`payout:${o.key}`), ownerId: U[owner], tripId: id, amountCents: payoutAmount, platformFeeCents: fee, currency: 'USD',
        status: pState, scheduledReleaseAt: new Date(+end + DAY), createdAt: cl(end),
      });
      ledger.push({ id: uid(`ledger:${o.key}:payout`), tripId: id, entryType: 'payout', amountCents: payoutAmount, currency: 'USD', createdAt: cl(new Date(+end + DAY)) });
    }

    // insurance
    (['baseline', 'standard', 'premium'] as Cov[]).forEach((tierName) => {
      quotes.push({
        id: uid(`quote:${o.key}:${tierName}`), tripId: id, tierId: TIER_ID[tierName],
        riskFactorsUsed: { trustTier: renterTier, drivingRiskTier: DRIVING[o.renter] ?? 'low' },
        quotedPriceCents: dailyCover(tierName, renterTier), expiresAt: new Date(+createdAt + 15 * 60_000), createdAt: new Date(+createdAt - 15 * 60_000),
      });
    });
    if (policyId) {
      policies.push({
        id: policyId, tripId: id, tierId: TIER_ID[cov], comprehensionCheckPassed: true,
        status: o.life === 'completed' ? 'expired' : o.life === 'inProgress' ? 'active' : o.life === 'upcoming' ? 'bound' : 'voided',
        carrierRef: `MOCK-CARRIER-${short(id).toUpperCase()}`, createdAt,
      });
    }
    if (o.extraFailedCheck || rand() < 0.18) {
      comps.push({ id: uid(`comp:${o.key}:1`), userId: U[o.renter], tripId: id, passed: false, attemptCount: 1, createdAt: new Date(+createdAt - 4 * 60_000) });
      comps.push({ id: uid(`comp:${o.key}:2`), userId: U[o.renter], tripId: id, passed: true, attemptCount: 2, createdAt: new Date(+createdAt - 2 * 60_000) });
    } else {
      comps.push({ id: uid(`comp:${o.key}:1`), userId: U[o.renter], tripId: id, passed: true, attemptCount: 1, createdAt: new Date(+createdAt - 2 * 60_000) });
    }

    // fraud + pricing signals on the booking itself
    const riskBase = o.renter === 'risky' ? 0.55 : o.renter === 'suspended' ? 0.4 : o.renter === 'newbie' ? 0.22 : 0.05;
    const riskScore = round2(riskBase + rand() * 0.18);
    risks.push({
      id: uid(`risk:${o.key}`), subjectType: 'booking', subjectId: id, userId: U[o.renter], riskScore,
      signals: { trustTier: renterTier, deviceTrusted: riskScore < 0.4, ipGeoMatch: riskScore < 0.5, velocityLast24h: riskScore < 0.4 ? 1 : 4 },
      decision: riskScore >= 0.6 ? 'review' : 'allow', evaluatedAt: createdAt,
    });
    if (o.life !== 'completed' || rand() < 0.3) {
      const high = o.life === 'cancelled';
      cancelRisks.push({
        tripId: id, riskScore: high ? round2(0.55 + rand() * 0.35) : round2(rand() * 0.3),
        mitigationSuggested: high ? pick(['offer_backup_vehicle', 'flexible_rebooking']) : rand() < 0.2 ? 'offer_backup_vehicle' : 'none',
        createdAt: cl(new Date(+createdAt + 10 * 60_000)),
      });
    }

    // condition baselines
    if (o.life === 'completed' || o.life === 'inProgress') {
      const startOdo = odo[o.car];
      const driven = o.days * between(60, 180);
      odo[o.car] += driven;
      const refs = (phase: string) => ['front', 'rear', 'left', 'right', 'dashboard'].map((p) => `mock://trip/${o.key}/${phase}/${p}.jpg`);
      baselineRows.push({
        id: uid(`baseline:${o.key}:pre`), vehicleId: car.vehicleId, tripId: id, type: 'pre_trip', mediaAssetRefs: refs('pre'),
        aiDamageAnnotations: [], odometerReading: startOdo, fuelOrChargeLevel: round2(0.75 + rand() * 0.25), capturedAt: cl(new Date(+start + 9 * HOUR)),
      });
      if (o.life === 'completed') {
        baselineRows.push({
          id: uid(`baseline:${o.key}:post`), vehicleId: car.vehicleId, tripId: id, type: 'post_trip', mediaAssetRefs: refs('post'),
          aiDamageAnnotations: o.damageNotes ? [{ zone: 'rear_bumper', type: 'dent', severity: 'moderate', confidence: 0.94 }, { zone: 'left_rear_door', type: 'scratch', severity: 'minor', confidence: 0.88 }] : [],
          odometerReading: startOdo + driven, fuelOrChargeLevel: round2(0.3 + rand() * 0.5), capturedAt: cl(new Date(+end - 2 * HOUR)),
        });
      }
    }

    // digital keys + geofence
    const fenceWanted = o.geofence ?? (o.life === 'inProgress' || o.life === 'upcoming');
    const fenceId = fenceWanted && confirmed ? uid(`fence:${o.key}`) : null;
    if (fenceId) {
      geofences.push({
        id: fenceId, vehicleId: car.vehicleId, tripId: id,
        polygon: { type: 'circle', center: { lat: car.lat, lng: car.lng }, radiusMeters: owner === 'fleet' ? 60000 : 35000 },
        breachAction: o.keyRevoked || o.life === 'inProgress' ? 'alert_and_flag_dispute' : 'alert_only',
      });
    }
    if (confirmed) {
      keys.push({
        id: uid(`key:${o.key}`), tripId: id, vehicleId: car.vehicleId, renterId: U[o.renter],
        validFrom: new Date(+start + 8 * HOUR), validUntil: new Date(+end + 10 * HOUR), geofenceId: fenceId,
        status: o.keyRevoked ? 'revoked' : o.life === 'completed' ? 'expired' : o.life === 'inProgress' ? 'active' : 'pending',
        cryptoTokenRef: `mock-key-${short(id)}`, createdAt: cl(new Date(+createdAt + HOUR)),
      });
    }

    // delivery
    if (deliveryCents > 0) {
      const d = pick(NAIROBI_DROPOFFS);
      const dStatus = o.deliveryStatus ?? (o.life === 'completed' || o.life === 'inProgress' ? 'completed' : o.life === 'upcoming' ? 'assigned' : o.life === 'requested' ? 'requested' : 'cancelled');
      deliveries.push({
        id: uid(`delivery:${o.key}`), tripId: id, feeCents: deliveryCents, status: dStatus,
        dropoffLocation: { address: d.address, lat: d.lat, lng: d.lng, instructions: 'Call on arrival; ask for the parking attendant.' },
        assignedTo: dStatus === 'requested' ? null : o.assignee ?? (car.delivery.radius_km >= 25 ? 'third_party_partner' : 'owner'),
        createdAt: cl(new Date(+createdAt + 2 * HOUR)),
      });
    }

    // reviews
    const reviewIds: string[] = [];
    const mode = o.reviews ?? (o.life === 'completed' ? 'both' : 'none');
    if (o.life === 'completed' && mode !== 'none') {
      const rToO = o.toOwner ?? drawRating(owner);
      const oToR = o.toRenter ?? drawRating(o.renter);
      const renterReview: Prisma.ReviewCreateManyInput = {
        id: uid(`review:${o.key}:renter`), tripId: id, authorUserId: U[o.renter], subjectUserId: U[owner], rating: rToO,
        comment: o.toOwnerText !== undefined ? o.toOwnerText : commentToOwner(rToO), mediaRefs: rand() < 0.15 ? [`mock://review/${o.key}/1.jpg`] : [],
        visibility: 'visible', submittedAt: cl(new Date(+end + between(1, 20) * HOUR)), revealedAt: cl(new Date(+end + between(24, 70) * HOUR)),
      };
      const ownerReview: Prisma.ReviewCreateManyInput = {
        id: uid(`review:${o.key}:owner`), tripId: id, authorUserId: U[owner], subjectUserId: U[o.renter], rating: oToR,
        comment: o.toRenterText !== undefined ? o.toRenterText : commentToRenter(oToR), mediaRefs: [],
        visibility: 'visible', submittedAt: cl(new Date(+end + between(1, 30) * HOUR)), revealedAt: cl(new Date(+end + between(24, 70) * HOUR)),
      };
      if (mode === 'renter_only') { renterReview.visibility = 'hidden_pending_counterpart'; renterReview.revealedAt = null; renterReview.submittedAt = ago(40); reviews.push(renterReview); reviewIds.push(renterReview.id as string); }
      else if (mode === 'owner_only') { ownerReview.visibility = 'hidden_pending_counterpart'; ownerReview.revealedAt = null; ownerReview.submittedAt = ago(30); reviews.push(ownerReview); reviewIds.push(ownerReview.id as string); }
      else if (mode === 'renter_old_lone') { renterReview.visibility = 'hidden_pending_counterpart'; renterReview.revealedAt = null; renterReview.submittedAt = ago(24 * 20); reviews.push(renterReview); reviewIds.push(renterReview.id as string); }
      else if (mode === 'both_pending_window') {
        for (const r of [renterReview, ownerReview]) { r.visibility = 'hidden_pending_window'; r.revealedAt = null; r.submittedAt = ago(24 * 3); reviews.push(r); reviewIds.push(r.id as string); }
      } else { reviews.push(renterReview, ownerReview); reviewIds.push(renterReview.id as string, ownerReview.id as string); }
    }

    const meta: TripMeta = { id, key: o.key, car: o.car, ownerKey: owner, renter: o.renter, start, end, days: o.days, life: o.life, policyId, rentalCents, totalCents, depositCents, cov, listingId: car.listingId, vehicleId: car.vehicleId, createdAt, reviewIds };
    T[o.key] = meta;
    allTrips.push(meta);
    return meta;
  }

  // ---- reserve non-trip blocks first so nothing overlaps them
  blockRange('mazda-cx5', 3, 5, 'owner_blocked');
  blockRange('toyota-corolla', 10, 12, 'owner_blocked');
  blockRange('toyota-prado', 2, 8, 'owner_blocked');
  blockRange('subaru-forester', 15, 17, 'owner_blocked');
  blockRange('nissan-leaf', 25, 27, 'owner_blocked');
  blockRange('suzuki-swift', 30, 31, 'owner_blocked');
  blockRange('toyota-hilux', 20, 22, 'maintenance_hold');
  blockRange('toyota-hiace', 30, 33, 'maintenance_hold');
  blockRange('toyota-prado', -40, -39, 'maintenance_hold');
  blockRange('mercedes-c200', -1, 2, 'maintenance_hold');

  // ---- narrative trips (what you'll click through)
  // renter@ (main demo renter): every lifecycle
  buildTrip({ key: 'r-upcoming-corolla', car: 'toyota-corolla', renter: 'renter', startDay: 4, days: 3, life: 'upcoming', cov: 'standard', delivery: true });
  buildTrip({ key: 'r-request-noah', car: 'toyota-noah', renter: 'renter', startDay: 9, days: 3, life: 'requested', cov: 'premium', delivery: true });
  buildTrip({ key: 'r-active-forester', car: 'subaru-forester', renter: 'renter', startDay: -1, days: 3, life: 'inProgress', cov: 'standard', delivery: true });
  buildTrip({ key: 'r-cancel-swift', car: 'suzuki-swift', renter: 'renter', startDay: -9, days: 2, life: 'cancelled', cancelledBy: 'renter', cancelHoursBefore: 10, cov: 'baseline' });
  buildTrip({ key: 'r-declined-note', car: 'nissan-note', renter: 'renter', startDay: 20, days: 2, life: 'cancelled', cancelledBy: 'owner', cov: 'baseline' });
  buildTrip({ key: 'r-damage-prado', car: 'toyota-prado', renter: 'renter', startDay: -30, days: 4, life: 'completed', cov: 'premium', damageCents: 45000, capture: 'partial', damageNotes: true, toOwner: 4, toRenter: 3,
    toOwnerText: 'Great vehicle, but the dispute over the bumper took a while to settle.', toRenterText: 'Returned with bumper damage that was not there at pick-up.' });
  buildTrip({ key: 'r-both-forester', car: 'subaru-forester', renter: 'renter', startDay: -45, days: 3, life: 'completed', cov: 'standard', toOwner: 5, toRenter: 5,
    toOwnerText: 'Perfect family car for the Mara trip. Highly recommend.', toRenterText: 'Wonderful guest. Left the car cleaner than they found it.' });
  buildTrip({ key: 'r-lone-hilux', car: 'toyota-hilux', renter: 'renter', startDay: -5, days: 2, life: 'completed', cov: 'standard', reviews: 'renter_only', toOwner: 5,
    toOwnerText: 'Strong, comfortable and exactly what we needed for the site visit.' });
  buildTrip({ key: 'r-late-corolla', car: 'toyota-corolla', renter: 'renter', startDay: -60, days: 2, life: 'completed', cov: 'baseline', toOwner: 4, toRenter: 4 });
  // owner@ and host@ renting other people's cars
  buildTrip({ key: 'o-upcoming-hiace', car: 'toyota-hiace', renter: 'owner', startDay: 6, days: 2, life: 'upcoming', cov: 'standard', delivery: true });
  buildTrip({ key: 'o-past-leaf', car: 'nissan-leaf', renter: 'owner', startDay: -22, days: 2, life: 'completed', cov: 'baseline', toOwner: 5, toRenter: 5 });
  buildTrip({ key: 'h-upcoming-corolla', car: 'toyota-corolla', renter: 'host', startDay: 8, days: 2, life: 'upcoming', cov: 'baseline', delivery: true });
  // elite@
  buildTrip({ key: 'e-today-hiace', car: 'toyota-hiace', renter: 'elite', startDay: 0, days: 3, life: 'inProgress', cov: 'premium', delivery: true, deliveryStatus: 'in_progress', assignee: 'third_party_partner' });
  buildTrip({ key: 'e-upcoming-prado', car: 'toyota-prado', renter: 'elite', startDay: 14, days: 3, life: 'upcoming', cov: 'premium', delivery: true });
  // recent completions so the payout queue (scheduled / processing) is populated
  buildTrip({ key: 'r-ended-today-cx5', car: 'mazda-cx5', renter: 'elite', startDay: -2, days: 2, life: 'completed', cov: 'standard', reviews: 'renter_only', toOwner: 5, toOwnerText: 'Spotless CX-5, effortless pick-up. Will book again.' });
  buildTrip({ key: 'r-ended-2d-cx5', car: 'mazda-cx5', renter: 'expired', startDay: -5, days: 3, life: 'completed', cov: 'baseline', reviews: 'both', toOwner: 4, toRenter: 4 });
  // newbie@ (awaiting host approval)
  buildTrip({ key: 'n-request-note', car: 'nissan-note', renter: 'newbie', startDay: 6, days: 2, life: 'requested', cov: 'baseline' });
  // suspended@ (theft story) and risky@ (staged damage story) and expired@
  buildTrip({ key: 's-theft-hilux', car: 'toyota-hilux', renter: 'suspended', startDay: -12, days: 5, life: 'completed', cov: 'baseline', damageCents: 150000, capture: 'full', keyRevoked: true, geofence: true, reviews: 'none', payout: 'failed' });
  buildTrip({ key: 's-past-prado', car: 'toyota-prado', renter: 'suspended', startDay: -90, days: 3, life: 'completed', cov: 'standard', toRenter: 2, toOwner: 4 });
  buildTrip({ key: 'x-staged-swift', car: 'suzuki-swift', renter: 'risky', startDay: -20, days: 2, life: 'completed', cov: 'baseline', damageCents: 60000, capture: 'partial', damageNotes: true, reviews: 'owner_only', toRenter: 1,
    toRenterText: 'Returned with fresh damage and an inconsistent story about what happened.' });
  buildTrip({ key: 'x-past-leaf', car: 'nissan-leaf', renter: 'expired', startDay: -25, days: 2, life: 'completed', cov: 'standard', reviews: 'renter_old_lone', toOwner: 4 });
  buildTrip({ key: 'x-window-forester', car: 'subaru-forester', renter: 'expired', startDay: -70, days: 2, life: 'completed', cov: 'baseline', reviews: 'both_pending_window' });

  // ---- bulk history: gives hosts/fleet real review volume (badges), revenue, payouts, baselines
  const BULK_RENTERS: UserKey[] = ['elite', 'renter', 'elite', 'expired', 'elite', 'suspended', 'elite', 'owner', 'host', 'elite', 'renter', 'fleet'];
  let bi = 0;
  const bulk: TripMeta[] = [];
  for (const c of CARS) {
    for (let j = 0; j < c.bulkTrips; j++) {
      let renter: UserKey;
      do { renter = BULK_RENTERS[bi++ % BULK_RENTERS.length]; } while (renter === c.owner);
      const days = between(2, 5);
      let a = 16 + j * 34 + between(0, 12);
      while (busy(`car:${c.slug}`, -a, -a + days) || busy(`renter:${renter}`, -a, -a + days)) a += 3;
      bulk.push(buildTrip({
        key: `bulk-${c.slug}-${j}`, car: c.slug, renter, startDay: -a, days, life: 'completed',
        cov: pick<Cov>(['baseline', 'standard', 'standard', 'premium']), delivery: rand() < 0.25,
      }));
    }
  }

  // ================================================================ everything below hangs off the trips above
  const tripIdSet = new Set(allTrips.map((t) => t.id));
  const need = (key: string): TripMeta => { const t = T[key]; if (!t) throw new Error(`Missing trip ${key}`); return t; };
  const policyOf = (key: string): string => { const p = need(key).policyId; if (!p) throw new Error(`Trip ${key} has no policy`); return p; };
  const bulkDone = bulk.filter((t) => t.life === 'completed');

  // ---------------------------------------------------------------- failed / extra payment attempts + extra risk evaluations (monitoring feeds look at the last 24h)
  const fakeTripIds: string[] = [];
  const fake = (n: string) => { const i = uid(`fake-booking:${n}`); fakeTripIds.push(i); return i; };
  const failed: [UserKey, number, number][] = [['risky', 2, 14000], ['risky', 6, 9500], ['newbie', 11, 21000], ['suspended', 40, 8800], ['risky', 70, 12500]];
  failed.forEach(([who, hrs, cents], i) => {
    auths.push({ id: uid(`auth:failed:${i}`), tripId: fake(`failed-${i}`), payerUserId: U[who], amountCents: cents, currency: 'USD', status: 'failed', processorRef: `mock_auth_failed_${i}`, authorizedAt: ago(hrs), capturedAt: null });
  });
  const blockedWho: [UserKey, number, number][] = [['risky', 2, 0.91], ['suspended', 7, 0.86], ['rejected', 19, 0.94]];
  blockedWho.forEach(([who, hrs, score], i) => {
    risks.push({ id: uid(`risk:block:${i}`), subjectType: 'booking', subjectId: fake(`block-${i}`), userId: U[who], riskScore: score,
      signals: { sharedDevice: true, ipGeoMismatch: true, velocityLast24h: 6, trustTier: 'new' }, decision: 'block', evaluatedAt: ago(hrs) });
  });
  [[1, 'newbie'], [4, 'risky'], [9, 'newbie'], [16, 'expired']].forEach(([hrs, who], i) => {
    risks.push({ id: uid(`risk:review:${i}`), subjectType: 'booking', subjectId: fake(`review-${i}`), userId: U[who as UserKey], riskScore: round2(0.62 + rand() * 0.12),
      signals: { newAccount: who === 'newbie', cardCountryMismatch: who === 'risky', velocityLast24h: 3 }, decision: 'review', evaluatedAt: ago(hrs as number) });
  });
  for (let i = 0; i < 12; i++) {
    const who = pick<UserKey>(['renter', 'elite', 'owner', 'host', 'expired']);
    risks.push({ id: uid(`risk:allow:${i}`), subjectType: 'booking', subjectId: fake(`allow-${i}`), userId: U[who], riskScore: round2(0.02 + rand() * 0.14),
      signals: { deviceTrusted: true, ipGeoMatch: true, velocityLast24h: 1 }, decision: 'allow', evaluatedAt: ago(between(1, 23)) });
  }
  for (const c of CARS) for (const l of c.listings) {
    const bad = c.slug === 'bmw-x3';
    risks.push({ id: uid(`risk:listing:${l.key}`), subjectType: 'listing', subjectId: uid(`listing:${l.key}`), userId: U[c.owner], riskScore: bad ? 0.48 : round2(0.03 + rand() * 0.12),
      signals: { photosAuthentic: !bad, ownershipDocsVerified: c.ownership === 'verified', priceWithinMarket: true }, decision: bad ? 'review' : 'allow', evaluatedAt: ago(l.ageDays * 24 - 1) });
  }
  risks.push({ id: uid('risk:user:risky'), subjectType: 'user', subjectId: U.risky, userId: U.risky, riskScore: 0.88,
    signals: { sharedDeviceWith: 2, failedPayments: 3, identityMismatch: true }, decision: 'block', evaluatedAt: ago(24 * 5) });

  // ---------------------------------------------------------------- claims
  const claims: Prisma.ClaimCreateManyInput[] = [
    { id: uid('claim:damage-prado'), policyId: policyOf('r-damage-prado'), tripId: need('r-damage-prado').id, claimType: 'vehicle_damage', status: 'paid', evidenceRefs: ['mock://claim/prado/rear-bumper-1.jpg', 'mock://claim/prado/rear-bumper-2.jpg', 'mock://claim/prado/repair-quote.pdf'], payoutAmountCents: 62000, createdAt: ago(24 * 24) },
    { id: uid('claim:staged-swift'), policyId: policyOf('x-staged-swift'), tripId: need('x-staged-swift').id, claimType: 'vehicle_damage', status: 'under_review', evidenceRefs: ['mock://claim/swift/photo-1.jpg', 'mock://claim/swift/photo-2.jpg'], payoutAmountCents: null, createdAt: ago(24 * 9) },
    { id: uid('claim:theft-hilux'), policyId: policyOf('s-theft-hilux'), tripId: need('s-theft-hilux').id, claimType: 'theft', status: 'under_review', evidenceRefs: ['mock://claim/hilux/police-abstract.pdf', 'mock://claim/hilux/telematics-trace.json', 'mock://claim/hilux/key-log.json'], payoutAmountCents: null, createdAt: ago(24 * 8) },
    { id: uid('claim:b0'), policyId: bulkDone[0].policyId as string, tripId: bulkDone[0].id, claimType: 'liability', status: 'approved', evidenceRefs: ['mock://claim/b0/third-party-report.pdf'], payoutAmountCents: 30000, createdAt: ago(24 * 6) },
    { id: uid('claim:b1'), policyId: bulkDone[1].policyId as string, tripId: bulkDone[1].id, claimType: 'vehicle_damage', status: 'filed', evidenceRefs: ['mock://claim/b1/windscreen.jpg'], payoutAmountCents: null, createdAt: ago(5) },
    { id: uid('claim:b2'), policyId: bulkDone[2].policyId as string, tripId: bulkDone[2].id, claimType: 'vehicle_damage', status: 'denied', evidenceRefs: ['mock://claim/b2/mirror.jpg'], payoutAmountCents: null, createdAt: ago(24 * 11) },
    { id: uid('claim:b3'), policyId: bulkDone[3].policyId as string, tripId: bulkDone[3].id, claimType: 'vehicle_damage', status: 'paid', evidenceRefs: ['mock://claim/b3/door-ding.jpg'], payoutAmountCents: 18000, createdAt: ago(24 * 13) },
    { id: uid('claim:b4'), policyId: bulkDone[4].policyId as string, tripId: bulkDone[4].id, claimType: 'liability', status: 'under_review', evidenceRefs: ['mock://claim/b4/statement.pdf'], payoutAmountCents: null, createdAt: ago(24 * 10) },
    { id: uid('claim:b5'), policyId: bulkDone[5].policyId as string, tripId: bulkDone[5].id, claimType: 'vehicle_damage', status: 'approved', evidenceRefs: ['mock://claim/b5/tyre.jpg'], payoutAmountCents: 25000, createdAt: ago(24 * 3) },
  ];

  // ---------------------------------------------------------------- disputes
  const disputes: Prisma.DisputeCaseCreateManyInput[] = [];
  const evidence: Prisma.EvidenceItemCreateManyInput[] = [];
  const mediator: Prisma.MediatorDecisionCreateManyInput[] = [];
  interface DSpec {
    key: string; trip: TripMeta; by: 'renter' | 'owner'; type: 'damage' | 'mileage' | 'late_return' | 'cleanliness' | 'billing' | 'other';
    tier: 'auto_review' | 'mediator_review' | 'arbitration'; status: 'open' | 'resolved_auto' | 'resolved_mediator' | 'resolved_arbitration' | 'withdrawn';
    openedHoursAgo: number; resolvedHoursAgo?: number; outcome?: Prisma.InputJsonValue;
    evidence: [string, string, UserKey | null][]; decision?: string;
  }
  const dspec: DSpec[] = [
    { key: 'prado-damage', trip: need('r-damage-prado'), by: 'owner', type: 'damage', tier: 'mediator_review', status: 'resolved_mediator', openedHoursAgo: 24 * 26, resolvedHoursAgo: 24 * 22,
      outcome: { outcome: 'partial_renter_liability', renterLiableCents: 62000, depositCapturedCents: 45000, claimFiledForRemainder: true },
      evidence: [['condition_baseline_diff', `mock://trip/${short(need('r-damage-prado').id)}/diff/rear_bumper`, null], ['user_submission', 'rear_bumper_photo_1.jpg', 'host'], ['user_submission', 'renter_statement.txt', 'renter'], ['repair_quote', 'garage_quote_KES_80k.pdf', 'host']],
      decision: 'Post-trip photos show a new dent in the rear bumper that is absent from the pre-trip baseline. Renter is liable for the repair cost; the deposit is applied and the remainder is claimed under cover.' },
    { key: 'swift-staged', trip: need('x-staged-swift'), by: 'owner', type: 'damage', tier: 'arbitration', status: 'open', openedHoursAgo: 24 * 6,
      evidence: [['condition_baseline_diff', 'diff/left_rear_door', null], ['telematics_log', 'telematics/no_impact_event.json', null], ['user_submission', 'host_photos.zip', 'owner'], ['user_submission', 'renter_story_v1.txt', 'risky'], ['user_submission', 'renter_story_v2.txt', 'risky']],
      decision: 'Telematics shows no impact event during the trip and the renter has given two different accounts. Escalating to arbitration with a staged-damage flag.' },
    { key: 'hilux-late', trip: need('s-theft-hilux'), by: 'owner', type: 'late_return', tier: 'mediator_review', status: 'open', openedHoursAgo: 60,
      evidence: [['telematics_log', 'telematics/geofence_breach_chain.json', null], ['chat_transcript', 'chat/hilux_thread.txt', null], ['user_submission', 'owner_timeline.txt', 'fleet']] },
    { key: 'b0-mileage', trip: bulkDone[0], by: 'owner', type: 'mileage', tier: 'auto_review', status: 'resolved_auto', openedHoursAgo: 24 * 14, resolvedHoursAgo: 24 * 14 - 1,
      outcome: { outcome: 'no_new_damage_found', comparison: { odometerStart: 52310, odometerEnd: 52790, allowedKm: 600, overageKm: 0 } },
      evidence: [['odometer_photo', 'odometer_end.jpg', null]] },
    { key: 'b1-clean', trip: bulkDone[1], by: 'owner', type: 'cleanliness', tier: 'mediator_review', status: 'resolved_mediator', openedHoursAgo: 24 * 18, resolvedHoursAgo: 24 * 16,
      outcome: { outcome: 'cleaning_fee_applied', amountCents: 2500 },
      evidence: [['user_submission', 'interior_photos.zip', 'owner'], ['condition_baseline_diff', 'diff/interior', null]],
      decision: 'Interior photos show heavy staining not present at pick-up. A flat cleaning fee is applied.' },
    { key: 'b2-billing', trip: bulkDone[2], by: 'renter', type: 'billing', tier: 'auto_review', status: 'open', openedHoursAgo: 0.4,
      evidence: [['user_submission', 'receipt_screenshot.png', null]] },
    { key: 'b3-withdrawn', trip: bulkDone[3], by: 'renter', type: 'other', tier: 'auto_review', status: 'withdrawn', openedHoursAgo: 24 * 9, resolvedHoursAgo: 24 * 9 - 6, evidence: [] },
    { key: 'b4-late', trip: bulkDone[4], by: 'owner', type: 'late_return', tier: 'arbitration', status: 'resolved_arbitration', openedHoursAgo: 24 * 40, resolvedHoursAgo: 24 * 30,
      outcome: { outcome: 'late_fee_upheld', amountCents: 9000, hoursLate: 6 },
      evidence: [['telematics_log', 'telematics/return_time.json', null], ['chat_transcript', 'chat/late_return.txt', null]],
      decision: 'Return was six hours past the agreed time with no notice. Late fee upheld on appeal.' },
    { key: 'b5-damage-auto', trip: bulkDone[5], by: 'owner', type: 'damage', tier: 'auto_review', status: 'resolved_auto', openedHoursAgo: 24 * 21, resolvedHoursAgo: 24 * 21 - 1,
      outcome: { outcome: 'no_new_damage_found', comparison: { zonesCompared: 6, newFindings: 0 } }, evidence: [['condition_baseline_diff', 'diff/all_zones', null]] },
    { key: 'b6-mileage-mediator', trip: bulkDone[6], by: 'owner', type: 'mileage', tier: 'mediator_review', status: 'open', openedHoursAgo: 30,
      evidence: [['odometer_photo', 'odometer_end.jpg', null], ['user_submission', 'trip_log.csv', 'renter']] },
  ];
  for (const d of dspec) {
    const id = uid(`dispute:${d.key}`);
    const owner = d.trip.ownerKey;
    disputes.push({ id, tripId: d.trip.id, filedByUserId: U[d.by === 'owner' ? owner : d.trip.renter], disputeType: d.type, tier: d.tier, status: d.status,
      resolutionOutcome: d.outcome ?? Prisma.JsonNull, createdAt: ago(d.openedHoursAgo), resolvedAt: d.resolvedHoursAgo != null ? ago(d.resolvedHoursAgo) : null });
    d.evidence.forEach(([sourceType, refPointer, who], i) => {
      const submitter = who === null ? null : who === 'host' || who === 'owner' || who === 'fleet' ? U[owner] : U[d.trip.renter];
      evidence.push({ id: uid(`evidence:${d.key}:${i}`), disputeId: id, sourceType, refPointer, submittedByUserId: submitter, createdAt: ago(d.openedHoursAgo - 0.1 * (i + 1)) });
    });
    if (d.decision) mediator.push({ id: uid(`mediator:${d.key}`), disputeId: id, mediatorId: U.arbitrator, decisionSummary: d.decision, decidedAt: ago((d.resolvedHoursAgo ?? d.openedHoursAgo - 20)) });
  }

  // ---------------------------------------------------------------- fraud
  const fraudCases: Prisma.FraudCaseCreateManyInput[] = [
    { id: uid('fraud:collusion'), relatedUserIds: [U.risky, U.suspended, U.rejected], caseType: 'collusion_ring', status: 'open', evidenceRefs: ['link-analysis:fp-shared-9f3a', 'risk:block:0', 'risk:block:2'], createdAt: ago(20) },
    { id: uid('fraud:payment'), relatedUserIds: [U.risky], caseType: 'payment_fraud', status: 'under_review', evidenceRefs: ['auth:failed:0', 'auth:failed:1', 'auth:failed:4'], createdAt: ago(24 * 2) },
    { id: uid('fraud:staged'), relatedUserIds: [U.risky], caseType: 'staged_damage', status: 'under_review', evidenceRefs: [`dispute:swift-staged`, `trip:${short(need('x-staged-swift').id)}`], createdAt: ago(24 * 6) },
    { id: uid('fraud:identity'), relatedUserIds: [U.newbie, U.rejected], caseType: 'identity_sharing', status: 'confirmed', evidenceRefs: ['verification:doc-reuse'], createdAt: ago(24 * 15), resolvedAt: ago(24 * 12) },
    { id: uid('fraud:listing'), relatedUserIds: [U.owner], caseType: 'listing_fraud', status: 'dismissed', evidenceRefs: ['listing:polo-old'], createdAt: ago(24 * 30), resolvedAt: ago(24 * 29) },
    { id: uid('fraud:theft'), relatedUserIds: [U.suspended], caseType: 'payment_fraud', status: 'confirmed', evidenceRefs: [`trip:${short(need('s-theft-hilux').id)}`, 'chargeback'], createdAt: ago(24 * 8), resolvedAt: ago(24 * 5) },
  ];
  const signals: Prisma.DeviceSignalCreateManyInput[] = [];
  for (const u of USERS) {
    const shared = u.key === 'risky' || u.key === 'suspended' || u.key === 'rejected';
    signals.push({ id: uid(`signal:${u.key}:a`), userId: U[u.key], deviceFingerprint: shared ? 'fp-shared-9f3a' : `fp-${u.key}-phone`, behavioralBiometricScore: shared ? round2(0.2 + rand() * 0.15) : round2(0.82 + rand() * 0.16), ipGeoMismatchFlag: shared, createdAt: ago(between(10, 300)) });
    signals.push({ id: uid(`signal:${u.key}:b`), userId: U[u.key], deviceFingerprint: `fp-${u.key}-laptop`, behavioralBiometricScore: shared ? round2(0.3 + rand() * 0.2) : round2(0.85 + rand() * 0.14), ipGeoMismatchFlag: u.key === 'risky', createdAt: ago(between(10, 300)) });
  }
  const chargebacks: Prisma.ChargebackEvidenceBundleCreateManyInput[] = [
    { id: uid('chargeback:theft'), tripId: need('s-theft-hilux').id, includedArtifacts: ['digital_key_log', 'telematics_trace', 'condition_baseline_pre_trip', 'signed_rental_agreement', 'identity_verification_record', 'chat_transcript'], generatedAt: ago(24 * 6), submittedToProcessor: true },
    { id: uid('chargeback:prado'), tripId: need('r-damage-prado').id, includedArtifacts: ['condition_baseline_diff', 'repair_quote', 'chat_transcript'], generatedAt: ago(24 * 20), submittedToProcessor: false },
    { id: uid('chargeback:swift'), tripId: need('x-staged-swift').id, includedArtifacts: ['telematics_trace', 'condition_baseline_diff', 'renter_statements'], generatedAt: ago(24 * 5), submittedToProcessor: false },
  ];

  // ---------------------------------------------------------------- access / IoT / telematics / maintenance / fleet
  const devices: Prisma.AccessDeviceCreateManyInput[] = [];
  for (const c of CARS) {
    if (!c.device) continue;
    const offline = c.slug === 'toyota-corolla' || c.slug === 'subaru-forester';
    devices.push({ id: uid(`device:${c.slug}`), vehicleId: VID[c.slug], deviceType: c.device, vendorRef: c.device === 'native_connected_car_api' ? `connected-api-${c.slug}` : `smartlock-${c.slug}`,
      firmwareVersion: c.device === 'native_connected_car_api' ? 'api-v3' : pick(['2.4.1', '2.4.1', '2.3.9']), lastHeartbeatAt: offline ? ago(between(26, 40)) : ago(rand() * 0.5) });
  }
  const telematics: Prisma.TelematicsEventCreateManyInput[] = [
    { id: uid('tele:tamper-outlander'), vehicleId: VID['mitsubishi-outlander'], eventType: 'tamper_detected', payload: { sensor: 'door_shock', severity: 'high', lat: -1.211, lng: 36.8058 }, occurredAt: ago(3), resolvedFlag: false },
    { id: uid('tele:tamper-outlander-2'), vehicleId: VID['mitsubishi-outlander'], eventType: 'tamper_detected', payload: { sensor: 'ignition_bypass', severity: 'high', lat: -1.211, lng: 36.8058 }, occurredAt: ago(3.2), resolvedFlag: false },
    { id: uid('tele:tamper-corolla'), vehicleId: VID['toyota-corolla'], eventType: 'tamper_detected', payload: { sensor: 'tilt', severity: 'low', note: 'Parked on a slope' }, occurredAt: ago(18), resolvedFlag: true },
    { id: uid('tele:geo-hilux'), vehicleId: VID['toyota-hilux'], eventType: 'geofence_breach', payload: { tripId: need('s-theft-hilux').id, distanceOutsideMeters: 148000, lat: -0.0917, lng: 34.768 }, occurredAt: ago(5), resolvedFlag: false },
    { id: uid('tele:geo-hilux-2'), vehicleId: VID['toyota-hilux'], eventType: 'geofence_breach', payload: { tripId: need('s-theft-hilux').id, distanceOutsideMeters: 61000, lat: -0.3031, lng: 36.08 }, occurredAt: ago(9), resolvedFlag: false },
    { id: uid('tele:geo-forester'), vehicleId: VID['subaru-forester'], eventType: 'geofence_breach', payload: { tripId: need('r-active-forester').id, distanceOutsideMeters: 2200, lat: -1.1021, lng: 36.6377 }, occurredAt: ago(1.5), resolvedFlag: false },
    { id: uid('tele:tow-hilux'), vehicleId: VID['toyota-hilux'], eventType: 'tow_detected', payload: { speedKmh: 34, towTruckNearby: true, lat: -0.9, lng: 35.7 }, occurredAt: ago(24 * 9), resolvedFlag: true },
    { id: uid('tele:diag-c200'), vehicleId: VID['mercedes-c200'], eventType: 'diagnostic_code', payload: { code: 'P0420', description: 'Catalyst system efficiency below threshold' }, occurredAt: ago(24 * 2), resolvedFlag: false },
    { id: uid('tele:diag-corolla'), vehicleId: VID['toyota-corolla'], eventType: 'diagnostic_code', payload: { code: 'P0171', description: 'System too lean (Bank 1)' }, occurredAt: ago(24 * 12), resolvedFlag: true },
    { id: uid('tele:disc-corolla'), vehicleId: VID['toyota-corolla'], eventType: 'unexpected_disconnect', payload: { minutesOffline: 1500, lastSeenAt: ago(26).toISOString() }, occurredAt: ago(25), resolvedFlag: false },
    { id: uid('tele:disc-forester'), vehicleId: VID['subaru-forester'], eventType: 'unexpected_disconnect', payload: { minutesOffline: 2100, lastSeenAt: ago(36).toISOString() }, occurredAt: ago(35), resolvedFlag: false },
    { id: uid('tele:disc-prado'), vehicleId: VID['toyota-prado'], eventType: 'unexpected_disconnect', payload: { minutesOffline: 45, lastSeenAt: ago(24 * 4).toISOString() }, occurredAt: ago(24 * 4), resolvedFlag: true },
  ];
  const holds: Prisma.MaintenanceHoldCreateManyInput[] = [
    { id: uid('hold:prado'), vehicleId: VID['toyota-prado'], reason: 'scheduled_service', startDate: day(-40), endDate: day(-38), triggeringDiagnosticCode: null, createdAt: ago(24 * 50) },
    { id: uid('hold:hilux'), vehicleId: VID['toyota-hilux'], reason: 'scheduled_service', startDate: day(20), endDate: day(23), triggeringDiagnosticCode: null, createdAt: ago(24 * 6) },
    { id: uid('hold:hiace'), vehicleId: VID['toyota-hiace'], reason: 'recall', startDate: day(30), endDate: day(34), triggeringDiagnosticCode: null, createdAt: ago(24 * 2) },
    { id: uid('hold:c200'), vehicleId: VID['mercedes-c200'], reason: 'diagnostic_flag', startDate: day(-1), endDate: day(3), triggeringDiagnosticCode: 'P0420', createdAt: ago(24 * 2) },
  ];
  const redistribution: Prisma.FleetRedistributionSuggestionCreateManyInput[] = [
    ['toyota-hilux', -1.3347, 36.8756, 'Embakasi / JKIA corridor', 0.91], ['toyota-hiace', -1.3192, 36.9278, 'JKIA Departures', 0.94],
    ['mercedes-c200', -1.2864, 36.8172, 'CBD / Upper Hill', 0.88], ['mitsubishi-outlander', -1.2634, 36.8008, 'Westlands', 0.67],
    ['toyota-prado', -1.3866, 36.7344, 'Ngong / Rongai', 0.72], ['subaru-forester', -1.2864, 36.8172, 'CBD / Upper Hill', 0.63],
  ].map(([slug, lat, lng, label, score], i) => ({ id: uid(`redistrib:${slug}`), vehicleId: VID[slug as string], suggestedZone: { lat: lat as number, lng: lng as number, label: label as string }, demandHeatmapScore: score as number, createdAt: ago(3 + i) }));

  // ---------------------------------------------------------------- listing intelligence
  const TIER_MIN: Record<Tier, number> = { new: 0, standard: 400, trusted: 650, elite: 850 };
  const thresholds: Prisma.ListingTrustThresholdCreateManyInput[] = [];
  for (const c of CARS) for (const l of c.listings) if (l.minTier) thresholds.push({ listingId: uid(`listing:${l.key}`), minimumScore: TIER_MIN[l.minTier], minimumTier: l.minTier });
  const priceSuggestions: Prisma.PriceSuggestionCreateManyInput[] = [
    ['corolla', 4300, 1.13, 5], ['swift', 2900, 1.12, 4], ['cx5', 6800, 1.1, 3], ['note', 3300, 1.1, 2], ['prado', 9900, 1.04, 4], ['leaf', 4700, 1.12, 1],
    ['hilux', 8800, 1.1, 2], ['hiace', 11800, 1.07, 3],
  ].map(([k, cents, lift, hrs], i) => ({
    id: uid(`price:${k}`), listingId: uid(`listing:${k}`), suggestedPriceCents: cents as number,
    factorsUsed: { comparableAvg: 5800, demandEventsCount: 2, demandLift: lift as number, MOCKED: true }, validUntil: soon(6 - (hrs as number)), createdAt: ago(hrs as number + i),
  }));
  priceSuggestions.push({ id: uid('price:corolla:old'), listingId: uid('listing:corolla'), suggestedPriceCents: 4100, factorsUsed: { comparableAvg: 5600, demandEventsCount: 1, demandLift: 1.08, MOCKED: true }, validUntil: ago(30), createdAt: ago(36) });
  const idle: Prisma.IdleRecommendationCreateManyInput[] = [
    { id: uid('idle:swift'), listingId: uid('listing:swift'), recommendationType: 'lower_price', projectedImpact: { currentUtilization: 0.04, projectedBookingLift: 0.25, suggestedPriceCents: 2200 }, createdAt: ago(12) },
    { id: uid('idle:note'), listingId: uid('listing:note'), recommendationType: 'enable_delivery', projectedImpact: { currentUtilization: 0.12, projectedBookingLift: 0.25, estimatedExtraTripsPerMonth: 2 }, createdAt: ago(12) },
    { id: uid('idle:leaf'), listingId: uid('listing:leaf'), recommendationType: 'relocate_suggestion', projectedImpact: { currentUtilization: 0.18, suggestedArea: 'Westlands', projectedBookingLift: 0.4 }, createdAt: ago(30) },
    { id: uid('idle:polo'), listingId: uid('listing:polo'), recommendationType: 'lower_price', projectedImpact: { currentUtilization: 0, projectedBookingLift: 0.3, note: 'Listing is paused' }, createdAt: ago(48) },
  ];
  const surge: Prisma.SurgeCapPolicyCreateManyInput[] = [
    { id: uid('surge:nairobi'), marketRegion: 'nairobi', maxMultiplier: 1.8 }, { id: uid('surge:mombasa'), marketRegion: 'mombasa', maxMultiplier: 2.0 },
    { id: uid('surge:kisumu'), marketRegion: 'kisumu', maxMultiplier: 1.6 }, { id: uid('surge:default'), marketRegion: 'default', maxMultiplier: 2.0 },
  ];

  // ---------------------------------------------------------------- identity, licences, driving history, consent, documents
  const sessions: Prisma.VerificationSessionCreateManyInput[] = [];
  const S = (key: string, who: UserKey, status: 'pending' | 'doc_uploaded' | 'liveness_submitted' | 'in_review' | 'approved' | 'rejected' | 'expired', docType: 'passport' | 'drivers_license' | 'national_id', created: number, extra: { liveness?: number; reason?: string } = {}) =>
    sessions.push({ id: uid(`verif:${key}`), userId: U[who], status, documentType: docType, documentTokenRef: status === 'pending' ? null : uid(`doc:id:${who}`), livenessScore: extra.liveness ?? null,
      vendorRef: status === 'pending' ? null : `mock-vendor-${key}`, rejectionReason: extra.reason ?? null, createdAt: ago(created * 24), updatedAt: ago(created * 24 - 2) });
  S('owner', 'owner', 'approved', 'national_id', 215, { liveness: 0.97 });
  S('host', 'host', 'approved', 'passport', 290, { liveness: 0.98 });
  S('fleet', 'fleet', 'approved', 'national_id', 335, { liveness: 0.99 });
  S('renter-1', 'renter', 'rejected', 'drivers_license', 130, { liveness: 0.88, reason: 'Document image was blurry and the expiry date could not be read. Please re-upload.' });
  S('renter-2', 'renter', 'approved', 'drivers_license', 128, { liveness: 0.95 });
  S('newbie-1', 'newbie', 'pending', 'national_id', 6);
  S('newbie-2', 'newbie', 'doc_uploaded', 'national_id', 2);
  S('elite', 'elite', 'approved', 'passport', 160, { liveness: 0.99 });
  S('admin', 'admin', 'approved', 'national_id', 400, { liveness: 0.99 });
  S('support', 'support', 'approved', 'national_id', 380, { liveness: 0.98 });
  S('arbitrator', 'arbitrator', 'approved', 'national_id', 370, { liveness: 0.98 });
  S('service', 'service', 'approved', 'national_id', 360, { liveness: 0.99 });
  S('suspended', 'suspended', 'approved', 'drivers_license', 100, { liveness: 0.9 });
  S('risky-1', 'risky', 'liveness_submitted', 'national_id', 9, { liveness: 0.51 });
  S('risky-2', 'risky', 'in_review', 'national_id', 3, { liveness: 0.52 });
  S('expired', 'expired', 'expired', 'drivers_license', 395, { liveness: 0.93 });
  S('rejected', 'rejected', 'rejected', 'passport', 14, { liveness: 0.41, reason: 'Liveness check failed and the document photo matches a different account.' });

  const licenses: Prisma.LicenseRecordCreateManyInput[] = [];
  const L = (who: UserKey, num: string, cls: string, expiresInDays: number, st: 'valid' | 'invalid' | 'suspended' | 'unknown' | 'pending', validatedDaysAgo: number | null) =>
    licenses.push({ id: uid(`license:${who}`), userId: U[who], licenseNumberEnc: b64(`DL-${num}`), issuingRegion: 'Kenya (NTSA)', licenseClass: cls, expirationDate: day(expiresInDays),
      dmvValidationStatus: st, lastValidatedAt: validatedDaysAgo == null ? null : ago(validatedDaysAgo * 24), createdAt: ago(24 * 200) });
  L('owner', '4471920', 'B', 900, 'valid', 12); L('host', '3381201', 'B', 1100, 'valid', 20); L('fleet', '2209113', 'BCE', 700, 'valid', 5);
  L('renter', '5512044', 'B', 25, 'valid', 30); L('newbie', '7710029', 'B', 1500, 'pending', null); L('elite', '1190233', 'B', 1300, 'valid', 3);
  L('admin', '6600412', 'B', 800, 'valid', 40); L('support', '6600413', 'B', 800, 'valid', 40); L('arbitrator', '6600414', 'B', 800, 'valid', 40); L('service', '6600415', 'B', 800, 'valid', 40);
  L('suspended', '8842001', 'B', 300, 'suspended', 8); L('risky', '9930077', 'B', 600, 'invalid', 2); L('expired', '1128840', 'B', -40, 'valid', 200);

  const history: Prisma.DrivingHistoryReportCreateManyInput[] = [];
  const DH = (who: UserKey, v: number, a: number, sus: boolean, tier: 'low' | 'medium' | 'high', daysAgo: number) =>
    history.push({ id: uid(`history:${who}`), userId: U[who], consentTokenId: uid(`consent:${who}:driving`), violationCount: v, atFaultAccidentCount: a, suspensionFlag: sus, riskTier: tier,
      rawReportTokenRef: uid(`doc:history:${who}`), requestedAt: ago(daysAgo * 24), completedAt: ago(daysAgo * 24 - 0.1) });
  DH('owner', 0, 0, false, 'low', 210); DH('host', 0, 0, false, 'low', 285); DH('fleet', 0, 0, false, 'low', 330); DH('renter', 1, 0, false, 'low', 125);
  DH('elite', 0, 0, false, 'low', 155); DH('expired', 3, 1, false, 'medium', 390); DH('risky', 6, 2, false, 'high', 8); DH('suspended', 4, 1, true, 'high', 95);

  const imports: Prisma.ExternalHistoryImportCreateManyInput[] = [
    { id: uid('import:renter'), userId: U.renter, sourcePlatform: 'Getaround', verificationMethod: 'oauth_pull', status: 'verified', weightApplied: 0.15, createdAt: ago(24 * 100) },
    { id: uid('import:elite'), userId: U.elite, sourcePlatform: 'Turo', verificationMethod: 'document_upload', status: 'verified', weightApplied: 0.08, createdAt: ago(24 * 140) },
    { id: uid('import:newbie'), userId: U.newbie, sourcePlatform: 'Uber Rent', verificationMethod: 'document_upload', status: 'pending', weightApplied: 0, createdAt: ago(30) },
    { id: uid('import:risky'), userId: U.risky, sourcePlatform: 'Getaround', verificationMethod: 'oauth_pull', status: 'rejected', weightApplied: 0, createdAt: ago(24 * 6) },
    { id: uid('import:host'), userId: U.host, sourcePlatform: 'Turo', verificationMethod: 'oauth_pull', status: 'verified', weightApplied: 0.15, createdAt: ago(24 * 250) },
  ];

  const consents: Prisma.ConsentRecordCreateManyInput[] = [];
  for (const u of USERS) {
    consents.push({ id: uid(`consent:${u.key}:tos`), userId: U[u.key], consentType: 'terms_of_service', grantedAt: ago(24 * 220), revokedAt: null, ipAddress: `41.90.${between(1, 250)}.${between(1, 250)}`, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126' });
    consents.push({ id: uid(`consent:${u.key}:privacy`), userId: U[u.key], consentType: 'privacy_policy', grantedAt: ago(24 * 220), revokedAt: null, ipAddress: `41.90.${between(1, 250)}.${between(1, 250)}`, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126' });
  }
  for (const h of history) {
    const who = USERS.find((u) => U[u.key] === h.userId)!.key;
    consents.push({ id: uid(`consent:${who}:driving`), userId: h.userId, consentType: 'driving_history_check', grantedAt: h.requestedAt as Date, revokedAt: null, ipAddress: '105.160.12.44', userAgent: 'Mozilla/5.0 (iPhone) Safari/17' });
  }
  consents.push(
    { id: uid('consent:renter:marketing'), userId: U.renter, consentType: 'marketing_emails', grantedAt: ago(24 * 200), revokedAt: ago(24 * 40), ipAddress: '41.90.11.20', userAgent: 'Mozilla/5.0 Chrome/126' },
    { id: uid('consent:elite:marketing'), userId: U.elite, consentType: 'marketing_emails', grantedAt: ago(24 * 150), revokedAt: null, ipAddress: '41.90.12.21', userAgent: 'Mozilla/5.0 Chrome/126' },
    { id: uid('consent:host:telematics'), userId: U.host, consentType: 'telematics_tracking', grantedAt: ago(24 * 280), revokedAt: null, ipAddress: '41.90.13.22', userAgent: 'Mozilla/5.0 Chrome/126' },
    { id: uid('consent:fleet:telematics'), userId: U.fleet, consentType: 'telematics_tracking', grantedAt: ago(24 * 330), revokedAt: null, ipAddress: '41.90.14.23', userAgent: 'Mozilla/5.0 Chrome/126' },
    { id: uid('consent:suspended:telematics'), userId: U.suspended, consentType: 'telematics_tracking', grantedAt: ago(24 * 100), revokedAt: ago(24 * 9), ipAddress: '41.90.15.24', userAgent: 'Mozilla/5.0 Chrome/126' },
  );

  const docs: Prisma.TokenizedDocumentCreateManyInput[] = [];
  const D = (token: string, owner: string, cls: 'id_doc' | 'license' | 'ownership_doc' | 'driving_history_report' | 'other', hold: boolean, daysAgo: number) =>
    docs.push({ token, ownerUserId: owner, documentClass: cls, encryptedBlobRef: `mock-blob://${cls}/${token}`, kmsKeyId: 'mock-kms-key-2026-01', retentionPolicy: hold ? 'extended_legal_hold' : 'standard', createdAt: ago(daysAgo * 24) });
  for (const u of USERS) D(uid(`doc:id:${u.key}`), U[u.key], 'id_doc', u.key === 'suspended' || u.key === 'risky' || u.key === 'rejected', u.key === 'newbie' ? 2 : 200);
  for (const l of licenses) { const who = USERS.find((u) => U[u.key] === l.userId)!.key; D(uid(`doc:license:${who}`), l.userId, 'license', who === 'suspended', 190); }
  for (const h of history) { const who = USERS.find((u) => U[u.key] === h.userId)!.key; D(uid(`doc:history:${who}`), h.userId, 'driving_history_report', who === 'suspended' || who === 'risky', 120); }
  for (const c of CARS) D(uid(`doc:ownership:${c.slug}`), U[c.owner], 'ownership_doc', c.slug === 'mitsubishi-outlander', c.slug === 'bmw-x3' ? 3 : 150);
  D(uid('doc:other:police'), U.fleet, 'other', true, 8); D(uid('doc:other:insurance'), U.host, 'other', false, 90);
  const docTokens = docs.map((d) => d.token as string);

  const lifecycle: Prisma.DataLifecycleRequestCreateManyInput[] = [
    { id: uid('dlr:renter-export'), userId: U.renter, type: 'export', status: 'completed', rejectionReason: null, createdAt: ago(24 * 20), completedAt: ago(24 * 20 - 6) },
    { id: uid('dlr:owner-export'), userId: U.owner, type: 'export', status: 'completed', rejectionReason: null, createdAt: ago(24 * 33), completedAt: ago(24 * 33 - 20) },
    { id: uid('dlr:host-export'), userId: U.host, type: 'export', status: 'completed', rejectionReason: null, createdAt: ago(24 * 14), completedAt: ago(24 * 14 - 3) },
    { id: uid('dlr:elite-export'), userId: U.elite, type: 'export', status: 'pending', rejectionReason: null, createdAt: ago(5), completedAt: null },
    { id: uid('dlr:rejected-delete'), userId: U.rejected, type: 'delete', status: 'processing', rejectionReason: null, createdAt: ago(30), completedAt: null },
    { id: uid('dlr:suspended-delete'), userId: U.suspended, type: 'delete', status: 'rejected', rejectionReason: 'Account is under investigation and subject to a legal hold; deletion cannot proceed.', createdAt: ago(24 * 4), completedAt: ago(24 * 3) },
    { id: uid('dlr:gone-delete'), userId: uid('user:deleted-example'), type: 'delete', status: 'completed', rejectionReason: null, createdAt: ago(24 * 9), completedAt: ago(24 * 8) },
  ];
  const accessAudit: Prisma.AccessAuditLogEntryCreateManyInput[] = [];
  const AA_ACTORS: [UserKey, string][] = [['admin', 'admin'], ['support', 'support_agent'], ['arbitrator', 'arbitrator'], ['service', 'service']];
  for (let i = 0; i < 28; i++) {
    const [a, role] = AA_ACTORS[i % AA_ACTORS.length];
    accessAudit.push({ id: uid(`access-audit:${i}`), actorId: U[a], actorRole: role, resourceToken: docTokens[(i * 7) % docTokens.length], action: i % 9 === 8 ? 'delete' : i % 4 === 3 ? 'write' : 'read', occurredAt: ago(between(1, 24 * 20)) });
  }

  // ---------------------------------------------------------------- badges (mirrors ReviewsService.evaluateBadges so the nightly sweep agrees)
  const badges: Prisma.BadgeStatusCreateManyInput[] = [];
  for (const u of USERS) {
    const mine = reviews.filter((r) => r.subjectUserId === U[u.key] && r.visibility === 'visible');
    const avg = mine.length ? mine.reduce((s, r) => s + r.rating, 0) / mine.length : null;
    const eligible = mine.length >= 10 && (avg ?? 0) >= 4.5;
    const metrics = { reviewCount: mine.length, averageRating: avg == null ? null : round2(avg) };
    if (eligible) for (const t of ['super_host', 'elite_renter'] as const) badges.push({ id: uid(`badge:${u.key}:${t}`), userId: U[u.key], badgeType: t, earnedAt: ago(24 * between(5, 60)), rollingWindowMetrics: metrics });
    else if (['owner', 'renter', 'expired', 'suspended'].includes(u.key)) {
      const t = ['owner'].includes(u.key) ? 'super_host' : 'elite_renter';
      badges.push({ id: uid(`badge:${u.key}:${t}`), userId: U[u.key], badgeType: t, earnedAt: null, rollingWindowMetrics: { ...metrics, neededReviews: 10, neededRating: 4.5 } });
    }
  }

  // ================================================================ admin & operations
  const allCaps = ['view_financials', 'manage_staff', 'immobilize_vehicles', 'resolve_disputes', 'moderate_content', 'manage_config', 'view_audit_log', 'suspend_users', 'override_trust_score', 'manage_incidents', 'impersonate_users'] as const;
  const staffPerms: Prisma.StaffPermissionCreateManyInput[] = allCaps.map((c) => ({ id: uid(`perm:admin:${c}`), userId: U.admin, capability: c, grantedBy: U.admin, grantedAt: ago(24 * 400) }));
  const grant = (who: UserKey, cap: (typeof allCaps)[number], daysAgo: number, revoked?: { daysAgo: number }) =>
    staffPerms.push({ id: uid(`perm:${who}:${cap}`), userId: U[who], capability: cap, grantedBy: U.admin, grantedAt: ago(24 * daysAgo), revokedAt: revoked ? ago(24 * revoked.daysAgo) : null, revokedBy: revoked ? U.admin : null });
  grant('support', 'moderate_content', 370); grant('support', 'suspend_users', 370); grant('support', 'impersonate_users', 300, { daysAgo: 20 }); grant('support', 'view_audit_log', 200);
  grant('arbitrator', 'resolve_disputes', 365); grant('arbitrator', 'view_audit_log', 365); grant('arbitrator', 'view_financials', 120);
  grant('service', 'immobilize_vehicles', 360);

  const reviewsWithText = reviews.filter((r) => !!r.comment);
  const modItems: Prisma.ModerationQueueItemCreateManyInput[] = [
    { id: uid('mod:r0'), itemType: 'review', itemId: reviewsWithText[0].id as string, flaggedReason: 'Contains a phone number', status: 'pending', createdAt: ago(3) },
    { id: uid('mod:r1'), itemType: 'review', itemId: reviewsWithText[3].id as string, flaggedReason: 'Reported by the host as inaccurate', status: 'pending', createdAt: ago(9) },
    { id: uid('mod:l0'), itemType: 'listing', itemId: uid('listing:x3'), flaggedReason: 'Photos may not belong to this vehicle', status: 'pending', createdAt: ago(20) },
    { id: uid('mod:l1'), itemType: 'listing', itemId: uid('listing:fit'), flaggedReason: 'Ownership document rejected', status: 'pending', createdAt: ago(24 * 2) },
    { id: uid('mod:r2'), itemType: 'review', itemId: reviewsWithText[6].id as string, flaggedReason: 'Possible harassment', status: 'approved', resolvedBy: U.support, resolvedAt: ago(24 * 3), createdAt: ago(24 * 4) },
    { id: uid('mod:r3'), itemType: 'review', itemId: reviewsWithText[9].id as string, flaggedReason: 'Contains profanity', status: 'removed', resolvedBy: U.support, resolvedAt: ago(24 * 6), createdAt: ago(24 * 7) },
    { id: uid('mod:l2'), itemType: 'listing', itemId: uid('listing:polo-old'), flaggedReason: 'Duplicate listing for the same vehicle', status: 'removed', resolvedBy: U.admin, resolvedAt: ago(24 * 29), createdAt: ago(24 * 30) },
  ];
  const userSusp: Prisma.UserSuspensionCreateManyInput[] = [
    { id: uid('susp:suspended'), userId: U.suspended, reason: 'Vehicle not returned and geofence breached on trip; theft claim open.', suspendedBy: U.admin, suspendedAt: ago(24 * 8), liftedAt: null, liftedBy: null },
    { id: uid('susp:risky-old'), userId: U.risky, reason: 'Multiple failed payment attempts from a shared device.', suspendedBy: U.support, suspendedAt: ago(24 * 20), liftedAt: ago(24 * 17), liftedBy: U.admin },
    { id: uid('susp:expired-old'), userId: U.expired, reason: 'Driving licence expired; re-verification required.', suspendedBy: U.admin, suspendedAt: ago(24 * 35), liftedAt: ago(24 * 33), liftedBy: U.admin },
  ];
  const vehSusp: Prisma.VehicleSuspensionCreateManyInput[] = [
    { id: uid('vsusp:outlander'), vehicleId: VID['mitsubishi-outlander'], reason: 'Tamper alerts while parked; inspection required before further bookings.', suspendedBy: U.admin, suspendedAt: ago(3), liftedAt: null, liftedBy: null },
    { id: uid('vsusp:corolla-old'), vehicleId: VID['toyota-corolla'], reason: 'Brake warning reported by renter; cleared after service.', suspendedBy: U.admin, suspendedAt: ago(24 * 40), liftedAt: ago(24 * 37), liftedBy: U.admin },
  ];
  const overrides: Prisma.TrustScoreOverrideCreateManyInput[] = [
    { id: uid('override:suspended'), userId: U.suspended, previousScore: 410, newScore: 240, reason: 'Confirmed fraudulent trip.', overriddenBy: U.admin, occurredAt: ago(24 * 5) },
    { id: uid('override:elite'), userId: U.elite, previousScore: 880, newScore: 910, reason: 'Manual correction after verified external history was applied late.', overriddenBy: U.admin, occurredAt: ago(24 * 50) },
    { id: uid('override:renter'), userId: U.renter, previousScore: 480, newScore: 530, reason: 'Dispute resolved in renter favour on appeal.', overriddenBy: U.admin, occurredAt: ago(24 * 22) },
  ];
  const impersonation: Prisma.ImpersonationSessionCreateManyInput[] = [
    { id: uid('imp:renter'), staffId: U.support, targetUserId: U.renter, reason: 'Customer could not complete checkout; reproducing the payment-method error.', startedAt: ago(24 * 3), endedAt: ago(24 * 3 - 0.4) },
    { id: uid('imp:newbie'), staffId: U.admin, targetUserId: U.newbie, reason: 'Investigating why identity upload keeps failing on mobile.', startedAt: ago(0.3), endedAt: null },
    { id: uid('imp:owner'), staffId: U.support, targetUserId: U.owner, reason: 'Owner reported calendar not saving blocked dates.', startedAt: ago(24 * 12), endedAt: ago(24 * 12 - 0.7) },
  ];
  const audit: Prisma.AdminAuditLogCreateManyInput[] = [];
  const A = (i: string, actor: UserKey, role: string, action: string, tt: string, tid: string, hrs: number, reason?: string, metadata: Prisma.InputJsonValue = {}) =>
    audit.push({ id: uid(`audit:${i}`), actorId: U[actor], actorRole: role, action, targetType: tt, targetId: tid, reason: reason ?? null, metadata, occurredAt: ago(hrs) });
  A('suspend', 'admin', 'admin', 'suspend_user', 'user', U.suspended, 24 * 8, 'Vehicle not returned and geofence breached on trip; theft claim open.');
  A('suspend-risky', 'support', 'support_agent', 'suspend_user', 'user', U.risky, 24 * 20, 'Multiple failed payment attempts from a shared device.');
  A('unsuspend-risky', 'admin', 'admin', 'unsuspend_user', 'user', U.risky, 24 * 17);
  A('suspend-expired', 'admin', 'admin', 'suspend_user', 'user', U.expired, 24 * 35, 'Driving licence expired; re-verification required.');
  A('unsuspend-expired', 'admin', 'admin', 'unsuspend_user', 'user', U.expired, 24 * 33);
  A('suspend-vehicle', 'admin', 'admin', 'suspend_vehicle', 'vehicle', VID['mitsubishi-outlander'], 3, 'Tamper alerts while parked; inspection required before further bookings.');
  A('suspend-vehicle-old', 'admin', 'admin', 'suspend_vehicle', 'vehicle', VID['toyota-corolla'], 24 * 40, 'Brake warning reported by renter; cleared after service.');
  A('reverify', 'admin', 'admin', 'force_reverification', 'user', U.expired, 24 * 34, 'Manager-triggered re-verification');
  A('override-1', 'admin', 'admin', 'override_trust_score', 'trust_score', U.suspended, 24 * 5, 'Confirmed fraudulent trip.', { previousScore: 410, newScore: 240 });
  A('override-2', 'admin', 'admin', 'override_trust_score', 'trust_score', U.elite, 24 * 50, 'Manual correction after verified external history was applied late.', { previousScore: 880, newScore: 910 });
  A('override-3', 'admin', 'admin', 'override_trust_score', 'trust_score', U.renter, 24 * 22, 'Dispute resolved in renter favour on appeal.', { previousScore: 480, newScore: 530 });
  A('threshold', 'admin', 'admin', 'override_listing_threshold', 'listing', uid('listing:prado'), 24 * 27, 'Host requested a higher bar after a damage dispute.');
  A('imp-start-1', 'support', 'support_agent', 'start_impersonation', 'user', U.renter, 24 * 3, 'Customer could not complete checkout; reproducing the payment-method error.');
  A('imp-start-2', 'admin', 'admin', 'start_impersonation', 'user', U.newbie, 0.3, 'Investigating why identity upload keeps failing on mobile.');
  A('imp-start-3', 'support', 'support_agent', 'start_impersonation', 'user', U.owner, 24 * 12, 'Owner reported calendar not saving blocked dates.');
  A('staff-create', 'admin', 'admin', 'create_staff_account', 'user', U.support, 24 * 380, 'Created support_agent account');
  A('staff-create-2', 'admin', 'admin', 'create_staff_account', 'user', U.arbitrator, 24 * 370, 'Created arbitrator account');
  A('grant-1', 'admin', 'admin', 'grant_capability', 'staff_permission', uid('perm:support:moderate_content'), 24 * 370, 'Granted moderate_content');
  A('grant-2', 'admin', 'admin', 'grant_capability', 'staff_permission', uid('perm:arbitrator:resolve_disputes'), 24 * 365, 'Granted resolve_disputes');
  A('revoke-1', 'admin', 'admin', 'revoke_capability', 'staff_permission', uid('perm:support:impersonate_users'), 24 * 20, 'Impersonation no longer part of this role');
  A('mod-approve', 'support', 'support_agent', 'moderation_approved', 'review', reviewsWithText[6].id as string, 24 * 3, 'Reviewed in context; within guidelines.');
  A('mod-remove', 'support', 'support_agent', 'moderation_removed', 'review', reviewsWithText[9].id as string, 24 * 6, 'Contains profanity.');
  A('mod-remove-listing', 'admin', 'admin', 'moderation_removed', 'listing', uid('listing:polo-old'), 24 * 29, 'Duplicate listing for the same vehicle.');
  A('cfg-1', 'admin', 'admin', 'set_config', 'config_setting', 'payouts.platform_fee_bps', 24 * 45, undefined, { value: 1500 });
  A('cfg-2', 'admin', 'admin', 'set_config', 'config_setting', 'booking.max_trip_days', 24 * 30, undefined, { value: 30 });
  A('cfg-3', 'admin', 'admin', 'set_config', 'config_setting', 'search.default_radius_km', 24 * 10, undefined, { value: 50 });
  A('flag-1', 'admin', 'admin', 'set_feature_flag', 'feature_flag', 'delivery_partner_dispatch', 24 * 8, undefined, { enabled: true, scopeRegion: 'nairobi' });
  A('flag-2', 'admin', 'admin', 'set_feature_flag', 'feature_flag', 'ev_charging_filter', 24 * 4, undefined, { enabled: false, scopeRegion: null });
  A('surge', 'admin', 'admin', 'set_surge_cap', 'surge_cap_policy', 'nairobi', 24 * 21, undefined, { maxMultiplier: 1.8 });
  A('inc-1', 'admin', 'admin', 'create_incident', 'incident', uid('incident:payments'), 24 * 12, 'Payment processor timeouts');
  A('inc-2', 'admin', 'admin', 'update_incident_status', 'incident', uid('incident:payments'), 24 * 12 - 3, 'resolved');
  A('inc-3', 'admin', 'admin', 'create_incident', 'incident', uid('incident:telematics'), 6, 'Telematics webhook delays');
  A('inc-4', 'admin', 'admin', 'update_incident_status', 'incident', uid('incident:telematics'), 4, 'investigating');

  const incidents: Prisma.IncidentCreateManyInput[] = [
    { id: uid('incident:payments'), title: 'Payment processor timeouts', severity: 'p1', status: 'resolved', description: 'Card authorisations timing out for roughly 40 minutes. Processor rolled back a bad release.', affectedServices: ['payments', 'trips'], createdBy: U.admin, createdAt: ago(24 * 12), updatedAt: ago(24 * 12 - 3), resolvedAt: ago(24 * 12 - 3) },
    { id: uid('incident:telematics'), title: 'Telematics webhook delays', severity: 'p2', status: 'investigating', description: 'Vendor events are arriving 5 to 15 minutes late, so geofence alerts and disconnect flags are delayed.', affectedServices: ['access-iot', 'fleet'], createdBy: U.admin, createdAt: ago(6), updatedAt: ago(1), resolvedAt: null },
    { id: uid('incident:identity'), title: 'Identity vendor returning intermittent 502s', severity: 'p2', status: 'open', description: 'Some verification sessions are stuck in doc_uploaded. Vendor has acknowledged.', affectedServices: ['identity'], createdBy: U.admin, createdAt: ago(2), updatedAt: ago(2), resolvedAt: null },
    { id: uid('incident:search'), title: 'Elevated listing search latency', severity: 'p3', status: 'monitoring', description: 'p95 search latency doubled after a deploy. Index rebuild applied; watching.', affectedServices: ['listings'], createdBy: U.admin, createdAt: ago(24 * 2), updatedAt: ago(10), resolvedAt: null },
    { id: uid('incident:email'), title: 'Delayed booking confirmation emails', severity: 'p3', status: 'open', description: 'Confirmation emails delayed by up to 20 minutes for some users.', affectedServices: ['notifications'], createdBy: U.admin, createdAt: ago(30), updatedAt: ago(28), resolvedAt: null },
    { id: uid('incident:typo'), title: 'Wrong currency symbol on payout statement', severity: 'p4', status: 'resolved', description: 'Payout statement PDF showed the wrong currency symbol for KES owners.', affectedServices: ['payments'], createdBy: U.admin, createdAt: ago(24 * 20), updatedAt: ago(24 * 19), resolvedAt: ago(24 * 19) },
  ];
  const alertRules: Prisma.AlertRuleCreateManyInput[] = [
    { id: uid('alert:fraud'), name: 'Blocked bookings spike', metric: 'fraud.blocked_bookings_24h', comparator: 'gte', threshold: 3, notifyChannel: '#trust-and-safety', enabled: true, createdAt: ago(24 * 100), updatedAt: ago(24 * 20) },
    { id: uid('alert:auth'), name: 'Payment authorisation failures', metric: 'payments.auth_failures_24h', comparator: 'gt', threshold: 2, notifyChannel: '#payments-oncall', enabled: true, createdAt: ago(24 * 100), updatedAt: ago(24 * 20) },
    { id: uid('alert:payout'), name: 'Payout backlog growing', metric: 'payments.payout_backlog', comparator: 'gt', threshold: 5, notifyChannel: '#finance-ops', enabled: true, createdAt: ago(24 * 90), updatedAt: ago(24 * 15) },
    { id: uid('alert:sla'), name: 'Disputes past SLA', metric: 'disputes.sla_at_risk_count', comparator: 'gt', threshold: 0, notifyChannel: '#disputes', enabled: true, createdAt: ago(24 * 90), updatedAt: ago(24 * 15) },
    { id: uid('alert:fraud-low'), name: 'Fraud feed stalled (no evaluations)', metric: 'fraud.blocked_bookings_24h', comparator: 'lt', threshold: 0, notifyChannel: '#trust-and-safety', enabled: false, createdAt: ago(24 * 60), updatedAt: ago(24 * 40) },
  ];
  const firings: Prisma.AlertFiringCreateManyInput[] = [
    { id: uid('firing:0'), alertRuleId: uid('alert:fraud'), observedValue: 3, firedAt: ago(1), acknowledgedAt: null, acknowledgedBy: null },
    { id: uid('firing:1'), alertRuleId: uid('alert:auth'), observedValue: 3, firedAt: ago(2), acknowledgedAt: null, acknowledgedBy: null },
    { id: uid('firing:2'), alertRuleId: uid('alert:sla'), observedValue: 1, firedAt: ago(4), acknowledgedAt: ago(3.5), acknowledgedBy: U.admin },
    { id: uid('firing:3'), alertRuleId: uid('alert:payout'), observedValue: 7, firedAt: ago(24 * 3), acknowledgedAt: ago(24 * 3 - 1), acknowledgedBy: U.admin },
    { id: uid('firing:4'), alertRuleId: uid('alert:auth'), observedValue: 5, firedAt: ago(24 * 12), acknowledgedAt: ago(24 * 12 - 0.2), acknowledgedBy: U.admin },
    { id: uid('firing:5'), alertRuleId: uid('alert:fraud'), observedValue: 4, firedAt: ago(24 * 6), acknowledgedAt: ago(24 * 6 - 2), acknowledgedBy: U.support },
  ];
  const FLAG_ROWS: Prisma.FeatureFlagCreateManyInput[] = [
    { key: 'instant_book', enabled: true, scopeRegion: null, description: 'Allow hosts to enable instant booking.', updatedBy: U.admin },
    { key: 'delivery_partner_dispatch', enabled: true, scopeRegion: 'nairobi', description: 'Dispatch third-party partners for delivery requests.', updatedBy: U.admin },
    { key: 'ev_charging_filter', enabled: false, scopeRegion: null, description: 'Search filter for electric vehicles with charge cable.', updatedBy: U.admin },
    { key: 'mpesa_payments', enabled: true, scopeRegion: 'kenya', description: 'M-Pesa wallet as a payment method.', updatedBy: U.admin },
    { key: 'ai_damage_detection', enabled: true, scopeRegion: null, description: 'Run computer-vision comparison on pre/post trip photos.', updatedBy: U.admin },
    { key: 'dynamic_pricing_suggestions', enabled: true, scopeRegion: null, description: 'Show hosts suggested prices based on local demand.', updatedBy: U.admin },
    { key: 'long_trips_over_30_days', enabled: false, scopeRegion: null, description: 'Allow trips longer than the standard 30-day maximum.', updatedBy: U.admin },
    { key: 'corporate_accounts', enabled: true, scopeRegion: 'nairobi', description: 'Company profiles for fleet operators.', updatedBy: U.admin },
    { key: 'weekend_surge_pricing', enabled: false, scopeRegion: 'mombasa', description: 'Weekend surge multiplier within the regional cap.', updatedBy: U.admin },
    { key: 'review_photos', enabled: true, scopeRegion: null, description: 'Allow photos on reviews.', updatedBy: U.admin },
  ];
  const CONFIG_ROWS: Prisma.ConfigSettingCreateManyInput[] = [
    { key: 'trust_score.weights', value: { verification: 0.3, tripHistory: 0.2, behavior: 0.25, disputes: 0.15, fraud: 0.1 }, updatedBy: U.admin },
    { key: 'insurance.base_price_cents', value: 2000, updatedBy: U.admin },
    { key: 'payouts.platform_fee_bps', value: 1500, updatedBy: U.admin },
    { key: 'booking.max_trip_days', value: 30, updatedBy: U.admin },
    { key: 'search.default_radius_km', value: 50, updatedBy: U.admin },
    { key: 'cancellation.free_hours', value: 24, updatedBy: U.admin },
    { key: 'disputes.sla_hours', value: { auto_review: 1, mediator_review: 72 }, updatedBy: U.admin },
    { key: 'trust_score.tier_thresholds', value: { standard: 400, trusted: 650, elite: 850 }, updatedBy: U.admin },
  ];

  // ---------------------------------------------------------------- calendar: explicit "available" days so market/utilisation views have data
  for (const c of CARS) for (const l of c.listings) {
    if (l.status !== 'active') continue;
    for (let d = 0; d < 21; d++) if (!calMap.has(`${uid(`listing:${l.key}`)}|${+day(d)}`)) setCal(uid(`listing:${l.key}`), day(d), 'available');
  }
  const calendarRows = [...calMap.values()];

  // ================================================================ plan (insert order) + validation
  const allTripIds = [...tripIdSet, ...fakeTripIds];
  const vehicleIds = Object.values(VID);
  const listingIds = listingRows.map((l) => l.id as string);
  const disputeIds = disputes.map((d) => d.id as string);
  add('TrustScore', prisma.trustScore, trustRows, { field: 'userId', values: seededUserIds });
  add('TokenizedDocument', prisma.tokenizedDocument, docs, { field: 'token', values: docTokens });
  add('ConsentRecord', prisma.consentRecord, consents, { field: 'userId', values: seededUserIds });
  add('VerificationSession', prisma.verificationSession, sessions, { field: 'userId', values: seededUserIds });
  add('LicenseRecord', prisma.licenseRecord, licenses, { field: 'userId', values: seededUserIds });
  add('DrivingHistoryReport', prisma.drivingHistoryReport, history, { field: 'userId', values: seededUserIds });
  add('ExternalHistoryImport', prisma.externalHistoryImport, imports, { field: 'userId', values: seededUserIds });
  add('DataLifecycleRequest', prisma.dataLifecycleRequest, lifecycle, { field: 'id', values: lifecycle.map((r) => r.id as string) });
  add('AccessAuditLogEntry', prisma.accessAuditLogEntry, accessAudit);
  add('Listing', prisma.listing, listingRows, { field: 'vehicleId', values: vehicleIds });
  add('ListingTrustThreshold', prisma.listingTrustThreshold, thresholds, { field: 'listingId', values: listingIds });
  add('VehiclePhoto', prisma.vehiclePhoto, photoRows, { field: 'vehicleId', values: vehicleIds });
  add('ConditionBaseline', prisma.conditionBaseline, baselineRows, { field: 'vehicleId', values: vehicleIds });
  add('AccessDevice', prisma.accessDevice, devices, { field: 'vehicleId', values: vehicleIds });
  add('PaymentMethod', prisma.paymentMethod, pmRows);
  add('AvailabilityCalendar', prisma.availabilityCalendar, calendarRows, { field: 'listingId', values: listingIds });
  add('Trip', prisma.trip, trips, { field: 'id', values: [...tripIdSet] });
  add('PaymentAuthorization', prisma.paymentAuthorization, auths, { field: 'tripId', values: allTripIds });
  add('DepositHold', prisma.depositHold, deposits, { field: 'tripId', values: allTripIds });
  add('Payout', prisma.payout, payouts, { field: 'tripId', values: allTripIds });
  add('TransactionLedgerEntry', prisma.transactionLedgerEntry, ledger, { field: 'tripId', values: allTripIds });
  add('InsuranceQuote', prisma.insuranceQuote, quotes, { field: 'tripId', values: allTripIds });
  add('Policy', prisma.policy, policies, { field: 'tripId', values: allTripIds });
  add('ComprehensionCheckAttempt', prisma.comprehensionCheckAttempt, comps, { field: 'tripId', values: allTripIds });
  add('Claim', prisma.claim, claims, { field: 'tripId', values: allTripIds });
  add('DigitalKey', prisma.digitalKey, keys, { field: 'tripId', values: allTripIds });
  add('GeofenceRule', prisma.geofenceRule, geofences, { field: 'tripId', values: allTripIds });
  add('TelematicsEvent', prisma.telematicsEvent, telematics, { field: 'vehicleId', values: vehicleIds });
  add('MaintenanceHold', prisma.maintenanceHold, holds, { field: 'vehicleId', values: vehicleIds });
  add('FleetRedistributionSuggestion', prisma.fleetRedistributionSuggestion, redistribution, { field: 'vehicleId', values: vehicleIds });
  add('DeliveryRequest', prisma.deliveryRequest, deliveries, { field: 'tripId', values: allTripIds });
  add('DisputeCase', prisma.disputeCase, disputes, { field: 'tripId', values: allTripIds });
  add('EvidenceItem', prisma.evidenceItem, evidence, { field: 'disputeId', values: disputeIds });
  add('MediatorDecision', prisma.mediatorDecision, mediator, { field: 'disputeId', values: disputeIds });
  add('RiskEvaluation', prisma.riskEvaluation, risks);
  add('FraudCase', prisma.fraudCase, fraudCases);
  add('DeviceSignal', prisma.deviceSignal, signals, { field: 'userId', values: seededUserIds });
  add('ChargebackEvidenceBundle', prisma.chargebackEvidenceBundle, chargebacks, { field: 'tripId', values: allTripIds });
  add('CancellationRiskScore', prisma.cancellationRiskScore, cancelRisks, { field: 'tripId', values: allTripIds });
  add('PriceSuggestion', prisma.priceSuggestion, priceSuggestions, { field: 'listingId', values: listingIds });
  add('IdleRecommendation', prisma.idleRecommendation, idle, { field: 'listingId', values: listingIds });
  add('SurgeCapPolicy', prisma.surgeCapPolicy, surge, { field: 'marketRegion', values: surge.map((s) => s.marketRegion as string) });
  add('Review', prisma.review, reviews, { field: 'tripId', values: allTripIds });
  add('BadgeStatus', prisma.badgeStatus, badges, { field: 'userId', values: seededUserIds });
  add('StaffPermission', prisma.staffPermission, staffPerms, { field: 'userId', values: seededUserIds });
  add('ModerationQueueItem', prisma.moderationQueueItem, modItems);
  add('UserSuspension', prisma.userSuspension, userSusp, { field: 'userId', values: seededUserIds });
  add('VehicleSuspension', prisma.vehicleSuspension, vehSusp, { field: 'vehicleId', values: vehicleIds });
  add('TrustScoreOverride', prisma.trustScoreOverride, overrides, { field: 'userId', values: seededUserIds });
  add('ImpersonationSession', prisma.impersonationSession, impersonation);
  add('AdminAuditLog', prisma.adminAuditLog, audit);
  add('Incident', prisma.incident, incidents);
  add('AlertRule', prisma.alertRule, alertRules);
  add('AlertFiring', prisma.alertFiring, firings);
  add('FeatureFlag', prisma.featureFlag, FLAG_ROWS, { field: 'key', values: FLAG_ROWS.map((f) => f.key as string) });
  add('ConfigSetting', prisma.configSetting, CONFIG_ROWS, { field: 'key', values: CONFIG_ROWS.map((f) => f.key as string) });

  validate({ trips, auths, deposits, payouts, ledger, quotes, policies, comps, claims, keys, geofences, deliveries, reviews, disputes, evidence, mediator, calendarRows, listingRows, VID, U, modItems, badges, staffPerms, cancelRisks, devices, firings, alertRules, fakeTripIds, tripIdSet, trustRows });

  // ---------------------------------------------------------------- write
  if (DRY) {
    summarize();
    if (process.env.SEED_EXPORT) {
      fs.writeFileSync(process.env.SEED_EXPORT, JSON.stringify([...preRows, ...plan.map((p) => ({ table: p.name, rows: p.rows, field: p.key, values: p.values }))], (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
      console.log(`Exported to ${process.env.SEED_EXPORT}`);
    }
    console.log('\nDry run OK: nothing was written.');
    return;
  }
  console.log('Clearing previous seeded rows...');
  // Old listings of these vehicles (from the first simple seed, or an earlier run) go first, with everything hanging off them.
  {
    const old = await prisma.listing.findMany({ where: { vehicleId: { in: Object.values(VID) } }, select: { id: true } });
    const oldIds = old.map((o) => o.id);
    if (oldIds.length) {
      await prisma.availabilityCalendar.deleteMany({ where: { listingId: { in: oldIds } } });
      await prisma.listingTrustThreshold.deleteMany({ where: { listingId: { in: oldIds } } });
      await prisma.priceSuggestion.deleteMany({ where: { listingId: { in: oldIds } } });
      await prisma.idleRecommendation.deleteMany({ where: { listingId: { in: oldIds } } });
      await prisma.listing.deleteMany({ where: { id: { in: oldIds } } });
    }
  }

  for (const item of [...plan].reverse()) {
    const field = item.key; const vals = item.values;
    if (vals.length === 0) continue;
    for (let i = 0; i < vals.length; i += 1000) await item.delegate.deleteMany({ where: { [field]: { in: vals.slice(i, i + 1000) } } });
  }
  console.log('Inserting...');
  for (const item of plan) {
    for (let i = 0; i < item.rows.length; i += 400) await item.delegate.createMany({ data: item.rows.slice(i, i + 400), skipDuplicates: true });
  }
  summarize();
  console.log('\nDone. Sign in with any account above using the password:', PASSWORD);

  function summarize() {
    console.log('\nRows prepared:');
    const w = Math.max(...plan.map((p) => p.name.length));
    for (const p of plan) console.log(`  ${p.name.padEnd(w)}  ${String(p.rows.length).padStart(5)}`);
    console.log(`  ${'TOTAL'.padEnd(w)}  ${String(plan.reduce((s, p) => s + p.rows.length, 0)).padStart(5)}`);
    console.log('\nAccounts (password for all: ' + PASSWORD + '):');
    const why: Record<UserKey, string> = {
      owner: 'host: 6 cars (1 live-but-paused, 1 under review), requests to answer, payouts',
      host: 'trusted host: 6 cars, super-host badge, a rejected car', fleet: 'company profile, 4 fleet vehicles, elite',
      renter: 'main renter: every trip state, 4 payment methods, damage dispute', newbie: 'new tier, ID upload in progress, blocked from stricter cars',
      elite: 'elite renter badge, trips in progress and upcoming', admin: 'all 11 staff capabilities', support: 'moderation + suspensions (impersonation revoked)',
      arbitrator: 'resolves disputes, audit log', service: 'machine caller (immobilize)', suspended: 'suspended after theft; legal hold',
      risky: 'shared device, blocked bookings, staged damage', expired: 'expired licence, medium risk', rejected: 'failed ID check, deletion request in progress',
    };
    for (const u of USERS) console.log(`  ${u.email.padEnd(28)} ${u.role.padEnd(14)} ${why[u.key]}`);
  }
}

// ------------------------------------------------------------------ validation (runs in dry-run AND real runs)
function validate(d: any) {
  const errs: string[] = [];
  const dupe = (name: string, rows: any[], f: (r: any) => string) => {
    const seen = new Set<string>();
    for (const r of rows) { const k = f(r); if (seen.has(k)) errs.push(`${name}: duplicate ${k}`); seen.add(k); }
  };
  for (const p of plan) if (p.key === 'id' || p.name === 'TokenizedDocument') dupe(p.name, p.rows, (r) => r.id ?? r.token);
  dupe('AvailabilityCalendar [listingId,date]', d.calendarRows, (r) => `${r.listingId}|${+r.date}`);
  dupe('Review [tripId,authorUserId]', d.reviews, (r) => `${r.tripId}|${r.authorUserId}`);
  dupe('BadgeStatus [userId,badgeType]', d.badges, (r) => `${r.userId}|${r.badgeType}`);
  dupe('StaffPermission [userId,capability]', d.staffPerms, (r) => `${r.userId}|${r.capability}`);
  dupe('Policy.tripId', d.policies, (r) => r.tripId);
  dupe('DigitalKey.tripId', d.keys, (r) => r.tripId);
  dupe('AccessDevice.vehicleId', d.devices, (r) => r.vehicleId);
  dupe('CancellationRiskScore.tripId', d.cancelRisks, (r) => r.tripId);
  dupe('TrustScore.userId', d.trustRows, (r) => r.userId);
  dupe('DisputeCase (one open per trip)', d.disputes, (r) => `${r.tripId}|${r.status === 'open' ? 'open' : r.id}`);

  const tripIds = d.tripIdSet as Set<string>; const fakes = new Set<string>(d.fakeTripIds);
  const mustTrip = (name: string, rows: any[]) => { for (const r of rows) if (!tripIds.has(r.tripId)) errs.push(`${name}: tripId ${r.tripId} not in trips`); };
  mustTrip('Policy', d.policies); mustTrip('DigitalKey', d.keys); mustTrip('Geofence', d.geofences); mustTrip('Delivery', d.deliveries);
  mustTrip('Review', d.reviews); mustTrip('Dispute', d.disputes); mustTrip('Claim', d.claims); mustTrip('Ledger', d.ledger); mustTrip('Payout', d.payouts);
  mustTrip('Deposit', d.deposits); mustTrip('Quote', d.quotes); mustTrip('Comprehension', d.comps); mustTrip('CancelRisk', d.cancelRisks);
  for (const r of d.auths) if (!tripIds.has(r.tripId) && !fakes.has(r.tripId)) errs.push(`Auth: tripId ${r.tripId} unknown`);
  const policyIds = new Set(d.policies.map((p: any) => p.id)); for (const c of d.claims) if (!policyIds.has(c.policyId)) errs.push(`Claim ${c.id}: policy missing`);
  const disputeIds = new Set(d.disputes.map((x: any) => x.id));
  for (const e of d.evidence) if (!disputeIds.has(e.disputeId)) errs.push('Evidence: dispute missing');
  for (const m of d.mediator) if (!disputeIds.has(m.disputeId)) errs.push('Mediator: dispute missing');
  const reviewIds = new Set(d.reviews.map((r: any) => r.id)); const listingIds = new Set(d.listingRows.map((l: any) => l.id));
  for (const m of d.modItems) if (!(m.itemType === 'review' ? reviewIds : listingIds).has(m.itemId) && m.itemId !== uid('listing:polo-old')) errs.push(`Moderation item ${m.itemId} unknown`);
  const ruleIds = new Set(d.alertRules.map((r: any) => r.id)); for (const f of d.firings) if (!ruleIds.has(f.alertRuleId)) errs.push('AlertFiring: rule missing');

  const tripById = new Map<string, any>(d.trips.map((t: any) => [t.id, t]));
  for (const t of d.trips) {
    if (t.totalCents !== t.rentalCents + t.coverCents + t.deliveryCents) errs.push(`Trip ${t.id}: total mismatch`);
    if (+t.endDate - +t.startDate !== t.days * DAY) errs.push(`Trip ${t.id}: days mismatch`);
    if (+t.createdAt > +NOW) errs.push(`Trip ${t.id}: createdAt in the future`);
  }
  for (const r of d.reviews) {
    const t = tripById.get(r.tripId);
    if (r.rating < 1 || r.rating > 5) errs.push(`Review ${r.id}: bad rating`);
    if (r.authorUserId === r.subjectUserId) errs.push(`Review ${r.id}: self review`);
    if (![t.renterId, t.ownerId].includes(r.authorUserId)) errs.push(`Review ${r.id}: author not on trip`);
    if (+(r.submittedAt as Date) > +NOW) errs.push(`Review ${r.id}: submittedAt in the future`);
  }
  // a car can never be booked twice, and every booked day on the calendar belongs to exactly one live trip
  const live = d.trips.filter((t: any) => t.status === 'confirmed');
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.listingId === b.listingId && +a.startDate < +b.endDate && +b.startDate < +a.endDate) errs.push(`Double booking: ${a.id} vs ${b.id}`);
  }
  const bookedDays = d.calendarRows.filter((c: any) => c.status === 'booked').length;
  const expected = live.reduce((s: number, t: any) => s + t.days, 0);
  if (bookedDays !== expected) errs.push(`Calendar booked days ${bookedDays} != confirmed trip days ${expected}`);
  if (errs.length) { console.error('\nSeed validation FAILED:\n  - ' + errs.slice(0, 40).join('\n  - ')); throw new Error(`${errs.length} validation error(s)`); }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { if (!DRY) await prisma.$disconnect(); });