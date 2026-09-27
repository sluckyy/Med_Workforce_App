/**
 * Shared enums mirroring services/api/prisma/schema.prisma.
 *
 * These are hand-kept in sync with the Prisma schema for now. Once the API
 * has real endpoints, prefer generating this file (or an OpenAPI client)
 * from the schema/contract rather than maintaining it by hand in two
 * places — flagged here so it isn't mistaken for the source of truth.
 */

export const EligibilityStatus = {
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE: "INELIGIBLE",
  INDETERMINATE: "INDETERMINATE",
} as const;
export type EligibilityStatus = (typeof EligibilityStatus)[keyof typeof EligibilityStatus];

export const RequirementResultStatus = {
  PASS: "PASS",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
} as const;
export type RequirementResultStatus =
  (typeof RequirementResultStatus)[keyof typeof RequirementResultStatus];

export const RequirementType = {
  ACTIVE_SCOPE: "ACTIVE_SCOPE",
  REGISTRATION: "REGISTRATION",
  CREDENTIAL: "CREDENTIAL",
  SPECIALTY: "SPECIALTY",
  EXPERIENCE: "EXPERIENCE",
  TRAINING: "TRAINING",
  AVAILABILITY: "AVAILABILITY",
  FATIGUE: "FATIGUE",
  PROCUREMENT: "PROCUREMENT",
  COMMERCIAL: "COMMERCIAL",
  PREFERENCE: "PREFERENCE",
  // v0.3 addendum §2 — IMG / visa / Area of Need
  AREA_OF_NEED: "AREA_OF_NEED",
  MORATORIUM_LOCATION: "MORATORIUM_LOCATION",
  VISA_WORK_RIGHTS: "VISA_WORK_RIGHTS",
  // v0.3 addendum §4 — telehealth / virtual care
  TELEHEALTH_MEDICARE_ELIGIBILITY: "TELEHEALTH_MEDICARE_ELIGIBILITY",
  CROSS_BORDER_PRESCRIBING_AUTHORITY: "CROSS_BORDER_PRESCRIBING_AUTHORITY",
  TECHNOLOGY_CREDENTIAL: "TECHNOLOGY_CREDENTIAL",
} as const;
export type RequirementType = (typeof RequirementType)[keyof typeof RequirementType];

export const DeliveryMode = {
  IN_PERSON: "IN_PERSON",
  TELEHEALTH_SYNCHRONOUS: "TELEHEALTH_SYNCHRONOUS",
  HYBRID: "HYBRID",
} as const;
export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

export const ScopeGrantStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED",
  WITHDRAWN: "WITHDRAWN",
} as const;
export type ScopeGrantStatus = (typeof ScopeGrantStatus)[keyof typeof ScopeGrantStatus];

export const VacancyStatus = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  SOURCING: "SOURCING",
  CANDIDATE_SELECTED: "CANDIDATE_SELECTED",
  BOOKED: "BOOKED",
  WORKED: "WORKED",
  TIMESHEET_PENDING: "TIMESHEET_PENDING",
  COMPLETE: "COMPLETE",
  CANCELLED: "CANCELLED",
  UNFILLED: "UNFILLED",
  WITHDRAWN: "WITHDRAWN",
} as const;
export type VacancyStatus = (typeof VacancyStatus)[keyof typeof VacancyStatus];

export const ProceduralEndorsementType = {
  ANAESTHETICS: "ANAESTHETICS",
  OBSTETRICS: "OBSTETRICS",
  OBSTETRICS_SURGICAL: "OBSTETRICS_SURGICAL",
  SURGERY: "SURGERY",
  EMERGENCY_MEDICINE: "EMERGENCY_MEDICINE",
  MENTAL_HEALTH: "MENTAL_HEALTH",
  ADULT_INTERNAL_MEDICINE: "ADULT_INTERNAL_MEDICINE",
  PAEDIATRICS: "PAEDIATRICS",
  INDIGENOUS_HEALTH: "INDIGENOUS_HEALTH",
} as const;
export type ProceduralEndorsementType =
  (typeof ProceduralEndorsementType)[keyof typeof ProceduralEndorsementType];

// Identity & Access (docs/spec/01-technical-architecture-data-model-v0.2.docx
// §24 RBAC and ABAC model). DOCTOR is not an OrganisationRole — practitioners
// authenticate via User.practitionerId, not organisation membership.
// TIMESHEET_APPROVER is also absent — §33 specifies a single-purpose token
// (ApprovalToken), not a platform account with a persistent role.
export const OrganisationRole = {
  MEDICAL_WORKFORCE: "MEDICAL_WORKFORCE",
  CREDENTIAL_OFFICER: "CREDENTIAL_OFFICER",
  SCOPE_APPROVER: "SCOPE_APPROVER",
  AGENCY_USER: "AGENCY_USER",
  SITE_LEADER: "SITE_LEADER",
  PROCUREMENT: "PROCUREMENT",
  FINANCE: "FINANCE",
  STATE_ANALYST: "STATE_ANALYST",
  PLATFORM_SECURITY_ADMIN: "PLATFORM_SECURITY_ADMIN",
} as const;
export type OrganisationRole = (typeof OrganisationRole)[keyof typeof OrganisationRole];

export const UserStatus = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  LOCKED: "LOCKED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
