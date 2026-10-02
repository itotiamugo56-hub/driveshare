import { describe, expect, it } from 'vitest';
import { modeForPath } from './modeStore';

describe('modeForPath', () => {
  it('owner pages are host', () => {
    for (const p of ['/owner', '/owner/new', '/owner/cars/abc', '/owner/vehicles/v1/photos', '/owner/company-profile'])
      expect(modeForPath(p)).toBe('host');
  });
  it('browsing pages are rent', () => {
    for (const p of ['/', '/saved', '/compare', '/listings/abc', '/listings/abc/checkout'])
      expect(modeForPath(p)).toBe('rent');
  });
  it('shared pages keep the current side', () => {
    for (const p of ['/users/u1', '/verify', '/trips', '/trips/t1', '/companies/c1', '/login', '/nope'])
      expect(modeForPath(p)).toBeNull();
  });
  it('does not mistake look-alike paths for the host area', () => {
    expect(modeForPath('/owners')).toBeNull();
  });
});
