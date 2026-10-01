-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'support_agent', 'arbitrator', 'admin');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'doc_uploaded', 'liveness_submitted', 'in_review', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('passport', 'drivers_license', 'national_id');

-- CreateEnum
CREATE TYPE "DmvValidationStatus" AS ENUM ('valid', 'invalid', 'suspended', 'unknown', 'pending');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "TrustTier" AS ENUM ('new', 'standard', 'trusted', 'elite');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('active', 'inactive', 'under_review', 'suspended');

-- CreateEnum
CREATE TYPE "OwnershipVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ConditionBaselineType" AS ENUM ('listing_baseline', 'pre_trip', 'post_trip');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'active', 'paused', 'removed');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('available', 'booked', 'owner_blocked', 'maintenance_hold');

-- CreateEnum
CREATE TYPE "AccessDeviceType" AS ENUM ('aftermarket_smart_lock', 'native_connected_car_api');

-- CreateEnum
CREATE TYPE "DigitalKeyStatus" AS ENUM ('pending', 'active', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "BreachAction" AS ENUM ('alert_only', 'alert_and_flag_dispute');

-- CreateEnum
CREATE TYPE "TelematicsEventType" AS ENUM ('tow_detected', 'tamper_detected', 'geofence_breach', 'diagnostic_code', 'unexpected_disconnect');

-- CreateEnum
CREATE TYPE "DocumentClass" AS ENUM ('id_doc', 'license', 'ownership_doc', 'driving_history_report', 'other');

-- CreateEnum
CREATE TYPE "RetentionPolicy" AS ENUM ('standard', 'extended_legal_hold');

-- CreateEnum
CREATE TYPE "DataLifecycleType" AS ENUM ('export', 'delete');

-- CreateEnum
CREATE TYPE "DataLifecycleStatus" AS ENUM ('pending', 'processing', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('card', 'bank_account', 'wallet');

-- CreateEnum
CREATE TYPE "PaymentMethodStatus" AS ENUM ('active', 'expired', 'removed');

-- CreateEnum
CREATE TYPE "AuthorizationStatus" AS ENUM ('authorized', 'captured', 'voided', 'failed');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('held', 'released', 'partially_captured', 'fully_captured');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('scheduled', 'processing', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('rental_fee', 'insurance_fee', 'delivery_fee', 'deposit', 'fee_adjustment', 'refund', 'payout');

-- CreateEnum
CREATE TYPE "RiskDecision" AS ENUM ('allow', 'review', 'block');

-- CreateEnum
CREATE TYPE "FraudCaseType" AS ENUM ('payment_fraud', 'staged_damage', 'identity_sharing', 'collusion_ring', 'listing_fraud');

-- CreateEnum
CREATE TYPE "FraudCaseStatus" AS ENUM ('open', 'under_review', 'confirmed', 'dismissed');

-- CreateEnum
CREATE TYPE "CoverageTierName" AS ENUM ('baseline', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('quoted', 'bound', 'active', 'expired', 'voided');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('vehicle_damage', 'liability', 'theft');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('filed', 'under_review', 'approved', 'denied', 'paid');

-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('damage', 'mileage', 'late_return', 'cleanliness', 'billing', 'other');

-- CreateEnum
CREATE TYPE "DisputeTier" AS ENUM ('auto_review', 'mediator_review', 'arbitration');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'resolved_auto', 'resolved_mediator', 'resolved_arbitration', 'withdrawn');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('requested', 'assigned', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DeliveryAssignee" AS ENUM ('owner', 'third_party_partner');

-- CreateEnum
CREATE TYPE "MaintenanceReason" AS ENUM ('scheduled_service', 'diagnostic_flag', 'recall');

-- CreateEnum
CREATE TYPE "ReviewVisibility" AS ENUM ('hidden_pending_counterpart', 'hidden_pending_window', 'visible');

-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('super_host', 'elite_renter');

-- CreateEnum
CREATE TYPE "StaffCapability" AS ENUM ('view_financials', 'manage_staff', 'immobilize_vehicles', 'resolve_disputes', 'moderate_content', 'manage_config', 'view_audit_log', 'suspend_users', 'override_trust_score', 'manage_incidents', 'impersonate_users');

-- CreateEnum
CREATE TYPE "ModerationItemType" AS ENUM ('review', 'listing');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'removed');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('p1', 'p2', 'p3', 'p4');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'investigating', 'monitoring', 'resolved');

-- CreateEnum
CREATE TYPE "AlertComparator" AS ENUM ('gt', 'gte', 'lt', 'lte');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "documentType" "DocumentType" NOT NULL,
    "documentTokenRef" TEXT,
    "livenessScore" DOUBLE PRECISION,
    "vendorRef" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseNumberEnc" TEXT NOT NULL,
    "issuingRegion" TEXT NOT NULL,
    "licenseClass" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "dmvValidationStatus" "DmvValidationStatus" NOT NULL DEFAULT 'pending',
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrivingHistoryReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentTokenId" TEXT NOT NULL,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "atFaultAccidentCount" INTEGER NOT NULL DEFAULT 0,
    "suspensionFlag" BOOLEAN NOT NULL DEFAULT false,
    "riskTier" "RiskTier" NOT NULL DEFAULT 'low',
    "rawReportTokenRef" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DrivingHistoryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScore" (
    "userId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL DEFAULT 300,
    "factorBreakdown" JSONB NOT NULL DEFAULT '{}',
    "tier" "TrustTier" NOT NULL DEFAULT 'new',
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoreVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TrustScore_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ExternalHistoryImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "weightApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalHistoryImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingTrustThreshold" (
    "listingId" TEXT NOT NULL,
    "minimumScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumTier" "TrustTier",

    CONSTRAINT "ListingTrustThreshold_pkey" PRIMARY KEY ("listingId")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "licensePlateEnc" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "trim" TEXT,
    "ownershipDocTokenRef" TEXT,
    "ownershipVerificationStatus" "OwnershipVerificationStatus" NOT NULL DEFAULT 'pending',
    "telematicsDeviceId" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'inactive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionBaseline" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT,
    "type" "ConditionBaselineType" NOT NULL,
    "mediaAssetRefs" TEXT[],
    "aiDamageAnnotations" JSONB NOT NULL DEFAULT '[]',
    "odometerReading" INTEGER,
    "fuelOrChargeLevel" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConditionBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "instantBookEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryOptions" JSONB NOT NULL DEFAULT '{"delivery": false, "radius_km": 0, "fee": 0}',
    "minimumTrustTier" "TrustTier",
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityCalendar" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'available',

    CONSTRAINT "AvailabilityCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessDevice" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "deviceType" "AccessDeviceType" NOT NULL,
    "vendorRef" TEXT NOT NULL,
    "firmwareVersion" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),

    CONSTRAINT "AccessDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalKey" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "renterId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "geofenceId" TEXT,
    "status" "DigitalKeyStatus" NOT NULL DEFAULT 'pending',
    "cryptoTokenRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeofenceRule" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "polygon" JSONB NOT NULL,
    "breachAction" "BreachAction" NOT NULL DEFAULT 'alert_only',

    CONSTRAINT "GeofenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelematicsEvent" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "eventType" "TelematicsEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedFlag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TelematicsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenizedDocument" (
    "token" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "documentClass" "DocumentClass" NOT NULL,
    "encryptedBlobRef" TEXT NOT NULL,
    "kmsKeyId" TEXT NOT NULL,
    "retentionPolicy" "RetentionPolicy" NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenizedDocument_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataLifecycleRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "DataLifecycleType" NOT NULL,
    "status" "DataLifecycleStatus" NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DataLifecycleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAuditLogEntry" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "resourceToken" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "processorToken" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "status" "PaymentMethodStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAuthorization" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "AuthorizationStatus" NOT NULL DEFAULT 'authorized',
    "processorRef" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositHold" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "DepositStatus" NOT NULL DEFAULT 'held',
    "captureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "PayoutStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledReleaseAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionLedgerEntry" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvaluation" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL DEFAULT '{}',
    "decision" "RiskDecision" NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudCase" (
    "id" TEXT NOT NULL,
    "relatedUserIds" TEXT[],
    "caseType" "FraudCaseType" NOT NULL,
    "status" "FraudCaseStatus" NOT NULL DEFAULT 'open',
    "evidenceRefs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FraudCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "behavioralBiometricScore" DOUBLE PRECISION NOT NULL,
    "ipGeoMismatchFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargebackEvidenceBundle" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "includedArtifacts" TEXT[],
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedToProcessor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChargebackEvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageTier" (
    "id" TEXT NOT NULL,
    "name" "CoverageTierName" NOT NULL,
    "deductibleCents" INTEGER NOT NULL,
    "liabilityLimitCents" INTEGER NOT NULL,
    "basePriceMultiplier" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CoverageTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceQuote" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "riskFactorsUsed" JSONB NOT NULL DEFAULT '{}',
    "quotedPriceCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "comprehensionCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "status" "PolicyStatus" NOT NULL DEFAULT 'quoted',
    "carrierRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprehensionCheckAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprehensionCheckAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'filed',
    "evidenceRefs" TEXT[],
    "payoutAmountCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeCase" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "filedByUserId" TEXT NOT NULL,
    "disputeType" "DisputeType" NOT NULL,
    "tier" "DisputeTier" NOT NULL DEFAULT 'auto_review',
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolutionOutcome" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DisputeCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "refPointer" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediatorDecision" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "mediatorId" TEXT NOT NULL,
    "decisionSummary" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediatorDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSuggestion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "suggestedPriceCents" INTEGER NOT NULL,
    "factorsUsed" JSONB NOT NULL DEFAULT '{}',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdleRecommendation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "recommendationType" TEXT NOT NULL,
    "projectedImpact" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdleRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRiskScore" (
    "tripId" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "mitigationSuggested" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationRiskScore_pkey" PRIMARY KEY ("tripId")
);

-- CreateTable
CREATE TABLE "SurgeCapPolicy" (
    "id" TEXT NOT NULL,
    "marketRegion" TEXT NOT NULL,
    "maxMultiplier" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SurgeCapPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRequest" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "dropoffLocation" JSONB NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'requested',
    "assignedTo" "DeliveryAssignee",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetRedistributionSuggestion" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "suggestedZone" JSONB NOT NULL,
    "demandHeatmapScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetRedistributionSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceHold" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reason" "MaintenanceReason" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "triggeringDiagnosticCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "mediaRefs" TEXT[],
    "visibility" "ReviewVisibility" NOT NULL DEFAULT 'hidden_pending_counterpart',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeType" "BadgeType" NOT NULL,
    "earnedAt" TIMESTAMP(3),
    "rollingWindowMetrics" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "BadgeStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "StaffCapability" NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpersonationSession" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationQueueItem" (
    "id" TEXT NOT NULL,
    "itemType" "ModerationItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "flaggedReason" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSuspension" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suspendedBy" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedBy" TEXT,

    CONSTRAINT "UserSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSuspension" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suspendedBy" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedBy" TEXT,

    CONSTRAINT "VehicleSuspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustScoreOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousScore" DOUBLE PRECISION NOT NULL,
    "newScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "overriddenBy" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustScoreOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "affectedServices" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "comparator" "AlertComparator" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "notifyChannel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertFiring" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT NOT NULL,
    "observedValue" DOUBLE PRECISION NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,

    CONSTRAINT "AlertFiring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scopeRegion" TEXT,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ConfigSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityCalendar_listingId_date_key" ON "AvailabilityCalendar"("listingId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccessDevice_vehicleId_key" ON "AccessDevice"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalKey_tripId_key" ON "DigitalKey"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_tripId_key" ON "Policy"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "SurgeCapPolicy_marketRegion_key" ON "SurgeCapPolicy"("marketRegion");

-- CreateIndex
CREATE UNIQUE INDEX "Review_tripId_authorUserId_key" ON "Review"("tripId", "authorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeStatus_userId_badgeType_key" ON "BadgeStatus"("userId", "badgeType");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermission_userId_capability_key" ON "StaffPermission"("userId", "capability");

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseRecord" ADD CONSTRAINT "LicenseRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrivingHistoryReport" ADD CONSTRAINT "DrivingHistoryReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustScore" ADD CONSTRAINT "TrustScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionBaseline" ADD CONSTRAINT "ConditionBaseline_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityCalendar" ADD CONSTRAINT "AvailabilityCalendar_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessDevice" ADD CONSTRAINT "AccessDevice_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceItem" ADD CONSTRAINT "EvidenceItem_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "DisputeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediatorDecision" ADD CONSTRAINT "MediatorDecision_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "DisputeCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
