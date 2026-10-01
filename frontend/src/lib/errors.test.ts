import { describe, it, expect } from 'vitest';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('explains a dead connection and what to do', () => {
    expect(friendlyError({ code: 'ERR_NETWORK' }, 'cars')).toMatch(/internet connection/);
  });
  it('asks the user to sign in on 401', () => {
    expect(friendlyError({ response: { status: 401 } }, 'cover options')).toBe('Sign in to see cover options.');
  });
  it('reassures on server errors', () => {
    expect(friendlyError({ response: { status: 503 } }, 'cars')).toMatch(/Nothing you did caused it/);
  });
  it('reads the API client error shape (statusCode)', () => {
    expect(friendlyError({ statusCode: 0, message: 'Network Error' }, 'cars')).toMatch(/internet connection/);
    expect(friendlyError({ statusCode: 404, message: 'x' }, 'this car')).toMatch(/couldn't find this car/);
  });
  it('falls back to a retry hint', () => {
    expect(friendlyError(new Error('x'), 'cars')).toBe("We couldn't load cars. Try again.");
  });
});
