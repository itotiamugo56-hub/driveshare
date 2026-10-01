/**
 * Every external vendor integration named in the spec is built behind this
 * mode switch: `mock` (default, no credentials needed, clearly labeled fake
 * data) or `live` (real vendor SDK/HTTP calls once credentials are supplied
 * via env vars). Swapping modes never requires touching calling code — only
 * the provider's internals.
 */
export function isMockMode(envVar: string): boolean {
  return (process.env[envVar] || 'mock').toLowerCase() !== 'live';
}
