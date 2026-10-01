/**
 * Accumulated state threaded through every runner, mirroring the plain PowerShell
 * variables ($ownerToken, $vehicleId, etc.) in smoke-test.ps1. Kept as one mutable
 * object rather than per-domain Zustand slices because that's exactly what it is:
 * a single end-to-end test run's working memory, thrown away on Reset.
 */
export interface TestContext {
  // seeded / well-known
  adminAvailable: boolean;
  adminEmail: string;
  adminPassword: string;
  adminToken?: string;
  adminId?: string;

  // section 1 — auth
  password: string;
  ownerEmail?: string;
  ownerToken?: string;
  ownerId?: string;
  renterEmail?: string;
  renterToken?: string;
  renterId?: string;
  deleteMeToken?: string;
  deleteMeId?: string;

  // section 2 — identity
  verificationId?: string;
  licenseId?: string;
  drivingHistoryId?: string;

  // section 3 — trust
  importId?: string;

  // section 4 — vehicle & listing
  vehicleId?: string;
  listingId?: string;
  tripId?: string;

  // section 5 — access & iot
  serviceToken?: string;
  serviceEmail?: string;
  deviceId?: string;
  keyId?: string;

  // section 6 — security & compliance
  docToken?: string;
  exportRequestId?: string;

  // section 7 — payments
  renterPaymentMethodId?: string;
  authId?: string;
  depositId?: string;
  payoutId?: string;

  // section 8 — fraud
  fraudsterId?: string;
  fraudCaseId?: string;
  bundleId?: string;

  // section 9 — insurance
  standardTierId?: string;
  quotedPriceCents?: number;
  policyId?: string;
  claimId?: string;

  // section 10 — dispute
  damageDisputeId?: string;
  mileageDisputeId?: string;
  arbDisputeId?: string;
  workbenchDisputeId?: string;

  // section 12 — logistics
  deliveryRequestId?: string;

  // section 13 — reviews
  review1Id?: string;

  // section 14 — admin & operations
  supportId?: string;
  supportToken?: string;
  arbitratorToken?: string;
  impersonationSessionId?: string;
  moderationItemId?: string;
  incidentId?: string;
  alertRuleId?: string;
  alertFiringId?: string;

  // section 15 — company profile (added per the verification-check follow-up,
  // "company/business profile" gap)
  companyProfileId?: string;
  renterCompanyId?: string;
  companyVehicleId?: string;
}

export function freshContext(): TestContext {
  return {
    adminAvailable: false,
    adminEmail: 'admin@driveshare.dev',
    adminPassword: 'Password123!',
    password: 'Password123!',
  };
}
