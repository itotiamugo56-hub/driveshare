import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { companyProfileApi } from '../api/domains/companyProfile.api';
import { useAuthStore } from '../store/authStore';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile" gap).
 */
export function useCompanyProfile(companyProfileId: string | undefined) {
  return useQuery({
    queryKey: ['company-profiles', companyProfileId],
    queryFn: () => companyProfileApi.get(companyProfileId!),
    enabled: !!companyProfileId,
  });
}

export function useMyCompanyProfile() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['company-profiles', 'me'],
    queryFn: () => companyProfileApi.getMine(token),
    enabled: !!token,
  });
}

export function useCreateCompanyProfile() {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      companyProfileApi.create(name, description, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-profiles', 'me'] }),
  });
}

export function useUpdateCompanyProfile(companyProfileId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; description?: string }) => companyProfileApi.update(companyProfileId, data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-profiles', companyProfileId] }),
  });
}

export function useAssignVehicleToCompany(companyProfileId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) => companyProfileApi.assignVehicle(companyProfileId, vehicleId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-profiles', companyProfileId] }),
  });
}

export function useUnassignVehicleFromCompany(companyProfileId: string) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) => companyProfileApi.unassignVehicle(companyProfileId, vehicleId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-profiles', companyProfileId] }),
  });
}
