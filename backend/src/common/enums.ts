export enum AppRole {
  USER = 'user',
  SUPPORT_AGENT = 'support_agent',
  ARBITRATOR = 'arbitrator',
  ADMIN = 'admin',
  SERVICE = 'service', // machine-to-machine callers (internal jobs / inter-service calls)
}

// Contextual, per-trip roles a `user` can hold (not stored on the User row itself)
export enum TripRole {
  OWNER = 'owner',
  RENTER = 'renter',
}

export enum StaffCapability {
  VIEW_FINANCIALS = 'view_financials',
  MANAGE_STAFF = 'manage_staff',
  IMMOBILIZE_VEHICLES = 'immobilize_vehicles',
  RESOLVE_DISPUTES = 'resolve_disputes',
  MODERATE_CONTENT = 'moderate_content',
  MANAGE_CONFIG = 'manage_config',
  VIEW_AUDIT_LOG = 'view_audit_log',
  SUSPEND_USERS = 'suspend_users',
  OVERRIDE_TRUST_SCORE = 'override_trust_score',
  MANAGE_INCIDENTS = 'manage_incidents',
  IMPERSONATE_USERS = 'impersonate_users',
}

export const EVT = {
  IDENTITY_VERIFICATION_APPROVED: 'evt.identity.verification_approved',
  IDENTITY_VERIFICATION_REJECTED: 'evt.identity.verification_rejected',
  IDENTITY_LICENSE_EXPIRING_SOON: 'evt.identity.license_expiring_soon',
  IDENTITY_REVERIFICATION_DUE: 'evt.identity.reverification_due',

  TRUST_SCORE_UPDATED: 'evt.trust.score_updated',
  TRUST_TIER_CHANGED: 'evt.trust.tier_changed',

  VEHICLE_REGISTERED: 'evt.vehicle.registered',
  LISTING_PUBLISHED: 'evt.listing.published',
  CONDITION_BASELINE_CAPTURED: 'evt.condition_baseline.captured',
  CALENDAR_UPDATED: 'evt.calendar.updated',

  ACCESS_KEY_ISSUED: 'evt.access.key_issued',
  ACCESS_KEY_REVOKED: 'evt.access.key_revoked',
  ACCESS_TAMPER_DETECTED: 'evt.access.tamper_detected',
  ACCESS_GEOFENCE_BREACH: 'evt.access.geofence_breach',
  ACCESS_IMMOBILIZATION_REQUESTED: 'evt.access.immobilization_requested',

  SECURITY_DOCUMENT_TOKENIZED: 'evt.security.document_tokenized',
  SECURITY_DATA_DELETION_COMPLETED: 'evt.security.data_deletion_completed',

  PAYMENT_AUTHORIZED: 'evt.payment.authorized',
  PAYMENT_CAPTURED: 'evt.payment.captured',
  PAYMENT_CHARGEBACK_FILED: 'evt.payment.chargeback_filed',
  PAYOUT_COMPLETED: 'evt.payout.completed',
  DEPOSIT_RELEASED: 'evt.deposit.released',

  FRAUD_CASE_OPENED: 'evt.fraud.case_opened',
  FRAUD_BOOKING_BLOCKED: 'evt.fraud.booking_blocked',
  FRAUD_CHARGEBACK_EVIDENCE_READY: 'evt.fraud.chargeback_evidence_ready',

  INSURANCE_POLICY_BOUND: 'evt.insurance.policy_bound',
  INSURANCE_CLAIM_FILED: 'evt.insurance.claim_filed',
  INSURANCE_CLAIM_RESOLVED: 'evt.insurance.claim_resolved',

  DISPUTE_FILED: 'evt.dispute.filed',
  DISPUTE_AUTO_RESOLVED: 'evt.dispute.auto_resolved',
  DISPUTE_ESCALATED: 'evt.dispute.escalated',
  DISPUTE_RESOLVED: 'evt.dispute.resolved',

  PRICING_SUGGESTION_GENERATED: 'evt.pricing.suggestion_generated',
  PRICING_IDLE_RECOMMENDATION_CREATED: 'evt.pricing.idle_recommendation_created',

  LOGISTICS_DELIVERY_ASSIGNED: 'evt.logistics.delivery_assigned',
  LOGISTICS_MAINTENANCE_HOLD_CREATED: 'evt.logistics.maintenance_hold_created',

  REVIEW_SUBMITTED: 'evt.review.submitted',
  REVIEW_REVEALED: 'evt.review.revealed',
  BADGE_EARNED: 'evt.badge.earned',
  BADGE_REVOKED: 'evt.badge.revoked',

  // Trip lifecycle (cross-cutting orchestration events referenced across services)
  TRIP_REQUESTED: 'evt.trip.requested',
  TRIP_BOOKED: 'evt.trip.booked',
  TRIP_CONFIRMED: 'evt.trip.confirmed',
  TRIP_COMPLETED: 'evt.trip.completed',
  TRIP_RETURN_CONFIRMED_CLEAN: 'evt.trip.return_confirmed_clean',
  TRIP_CANCELLED_LATE: 'evt.trip.cancelled_late',

  // --- 13. Admin & Operations (added on top of the original 12) ---
  ADMIN_STAFF_PERMISSION_GRANTED: 'evt.admin.staff_permission_granted',
  ADMIN_STAFF_PERMISSION_REVOKED: 'evt.admin.staff_permission_revoked',
  ADMIN_USER_SUSPENDED: 'evt.admin.user_suspended',
  ADMIN_USER_UNSUSPENDED: 'evt.admin.user_unsuspended',
  ADMIN_VEHICLE_SUSPENDED: 'evt.admin.vehicle_suspended',
  ADMIN_TRUST_SCORE_OVERRIDDEN: 'evt.admin.trust_score_overridden',
  ADMIN_IMPERSONATION_STARTED: 'evt.admin.impersonation_started',
  ADMIN_IMPERSONATION_ENDED: 'evt.admin.impersonation_ended',
  ADMIN_MODERATION_ITEM_FLAGGED: 'evt.admin.moderation_item_flagged',
  ADMIN_MODERATION_ITEM_RESOLVED: 'evt.admin.moderation_item_resolved',
  ADMIN_INCIDENT_OPENED: 'evt.admin.incident_opened',
  ADMIN_INCIDENT_RESOLVED: 'evt.admin.incident_resolved',
  ADMIN_ALERT_FIRED: 'evt.admin.alert_fired',
  ADMIN_CONFIG_CHANGED: 'evt.admin.config_changed',
  ADMIN_FEATURE_FLAG_CHANGED: 'evt.admin.feature_flag_changed',
} as const;
