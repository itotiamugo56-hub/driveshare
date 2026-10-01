import { useQuery } from '@tanstack/react-query';
import { trustApi } from '../api/domains/trust.api';
import { insuranceApi } from '../api/domains/insurance.api';
import { useAuthStore } from '../store/authStore';

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  userScore?: number;
  userTier?: string;
  threshold?: { minimumScore?: number | null; minimumTier?: string | null };
}
export interface CoverTier { id: string; name: 'baseline' | 'standard' | 'premium'; deductibleCents: number; liabilityLimitCents: number | string }

/** Asks the backend whether the signed-in renter meets this listing's trust threshold. */
export function useEligibility(listingId: string | undefined) {
  const { userId, accessToken } = useAuthStore();
  return useQuery({
    queryKey: ['eligibility', userId, listingId],
    queryFn: () => trustApi.checkEligibility(userId!, listingId!, accessToken) as Promise<EligibilityResult>,
    enabled: !!userId && !!listingId,
  });
}

/** The three cover levels (baseline, standard, premium) with deductible and liability limit. */
export function useCoverTiers() {
  const { accessToken } = useAuthStore();
  return useQuery({
    queryKey: ['cover-tiers'],
    queryFn: () => insuranceApi.listTiers(accessToken) as Promise<CoverTier[]>,
  });
}
