import { describe, it, expect } from 'vitest';
import { toCents, ownerNetCents, readiness, EMPTY_DRAFT, money } from './owner';

describe('toCents', () => {
  it.each([['80', 8000], ['80.5', 8050], ['$1,200.25', 120025], [' 65 ', 6500], ['0.99', 99]])('%s -> %s', (i, o) => expect(toCents(i as string)).toBe(o));
  it.each(['', 'abc', '0', '-5', '12.345', '1e3', '12,5,0x'])('rejects %j', (i) => expect(toCents(i)).toBeNull());
});
describe('ownerNetCents', () => {
  it('takes the 15% fee', () => { expect(ownerNetCents(10000)).toBe(8500); expect(ownerNetCents(8000)).toBe(6800); });
  it('rounds to whole cents', () => expect(ownerNetCents(999)).toBe(849));
});
describe('readiness', () => {
  const ok = { ...EMPTY_DRAFT, seats: '5', transmission: 'automatic' as const, fuelType: 'hybrid' as const, price: '80', locationLabel: 'Austin, TX' };
  it('is all done for a complete car', () => expect(readiness(3, ok).every((c) => c.done)).toBe(true));
  it('flags each missing piece and points to the step that fixes it', () => {
    const r = readiness(2, { ...EMPTY_DRAFT });
    expect(r.filter((c) => !c.done).map((c) => [c.key, c.fixStep])).toEqual([['photos', 'photos'], ['specs', 'details'], ['price', 'price'], ['place', 'price']]);
  });
  it('needs a real place, not a blank or one letter', () => { expect(readiness(3, { ...ok, locationLabel: ' ' })[3].done).toBe(false); expect(readiness(3, { ...ok, locationLabel: 'A' })[3].done).toBe(false); });
  it('formats money', () => expect(money(6800)).toBe('$68.00'));
});
