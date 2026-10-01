import { request } from '../client';
import { companyProfileSchema, type CompanyProfile } from '../schemas/companyProfile.schemas';

/**
 * Added per explicit product decision (verification-check follow-up, "company/
 * business profile" gap). Backend: `backend/src/modules/company-profile/`.
 */
export const companyProfileApi = {
  create: (name: string, description: string | undefined, token?: string | null) =>
    request<{ id: string }>({ method: 'POST', url: '/company-profiles', data: { name, description }, token }),

  /** Auth-gated — returns the caller's own company profile, or `null` if they don't have one yet. */
  getMine: (token?: string | null) =>
    request<{ id: string; ownerUserId: string; name: string; description: string | null } | null>({
      method: 'GET',
      url: '/company-profiles/me',
      token,
    }),

  /** @Public() on the backend — no token required or sent. */
  get: async (companyProfileId: string): Promise<CompanyProfile> => {
    const body = await request({ method: 'GET', url: `/company-profiles/${companyProfileId}`, token: null });
    return companyProfileSchema.parse(body);
  },

  update: (companyProfileId: string, data: { name?: string; description?: string }, token?: string | null) =>
    request({ method: 'PUT', url: `/company-profiles/${companyProfileId}`, data, token }),

  assignVehicle: (companyProfileId: string, vehicleId: string, token?: string | null) =>
    request({ method: 'POST', url: `/company-profiles/${companyProfileId}/vehicles`, data: { vehicleId }, token }),

  unassignVehicle: (companyProfileId: string, vehicleId: string, token?: string | null) =>
    request({ method: 'DELETE', url: `/company-profiles/${companyProfileId}/vehicles/${vehicleId}`, token }),
};
