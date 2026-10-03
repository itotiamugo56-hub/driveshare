import { useQuery } from '@tanstack/react-query';
import { ownerApi, type HostingStatus } from '../api/domains/owner.api';
import { tripsApi } from '../api/domains/trips.api';
import { useAuthStore } from '../store/authStore';

const NONE: HostingStatus = { ownsVehicles: false, identityVerified: false, licenceValid: false, cars: [], canPublish: false, nextStep: 'none' };

/**
 * What this person can do, decided by the server's view of them, not by a toggle.
 * `owns` drives whether hosting appears in navigation at all; `verified` and `nextStep` drive the verification ring and prompts.
 */
export function useCapabilities() {
  const { userId, accessToken } = useAuthStore();
  const signedIn = !!userId;
  const status = useQuery({
    queryKey: ['hosting-status', userId],
    enabled: signedIn,
    staleTime: 60_000,
    retry: 0,
    queryFn: () => ownerApi.hostingStatus(accessToken),
  });
  const s = status.data ?? NONE;
  const trips = useQuery({
    queryKey: ['my-trips', userId],
    enabled: signedIn && s.ownsVehicles,
    staleTime: 60_000,
    retry: 0,
    queryFn: () => tripsApi.mine(accessToken),
  });
  const asks = (trips.data ?? []).filter((t) => t.role === 'owner' && t.status === 'requested' && +new Date(t.startDate) > Date.now()).length;
  const steps = 2 + (s.ownsVehicles ? 1 : 0);
  const done = Number(s.identityVerified) + Number(s.licenceValid) + (s.ownsVehicles && s.cars.some((c) => c.ownership === 'verified') ? 1 : 0);
  return {
    signedIn,
    loading: signedIn && status.isLoading,
    /** The server has answered. Until then (or if it can't) nothing is blocked client-side; the API still enforces vetting. */
    known: status.isSuccess,
    owns: s.ownsVehicles,
    host: s,
    /** Identity and licence done: allowed to book. */
    verifiedRenter: s.identityVerified && s.licenceValid,
    /** 0..1 progress across the steps that apply to this person. */
    progress: signedIn ? done / steps : 0,
    /** An owner with a vetting step still open. */
    hostNeedsAction: s.ownsVehicles && s.nextStep !== 'none',
    asks,
  };
}
