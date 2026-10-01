import { QueryClient } from '@tanstack/react-query';

/**
 * Audit gap addressed: `@tanstack/react-query` was a declared, unused
 * dependency — no caching/loading/error-state infrastructure existed for
 * what is necessarily frequent, paginated listing-feed data fetching.
 *
 * `staleTime` is set above zero because the feed's ranking (recommended
 * sort) is a computed blend, not a raw timestamp — treating every
 * navigation back to the hub as stale would refetch and reshuffle results
 * the person just looked at.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
