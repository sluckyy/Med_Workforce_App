-- CreateEnum
CREATE TYPE "PractitionerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MERGED');

-- CreateEnum
CREATE TYPE "IdentifierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OrganisationType" AS ENUM ('LHN', 'HOSPITAL', 'AGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialCategory" AS ENUM ('REGISTRATION', 'QUALIFICATION', 'TRAINING', 'CHECKS', 'EMPLOYMENT_EXPERIENCE', 'ORGANISATION_ATTESTATION', 'IMMIGRATION_WORK_RIGHTS', 'ENGLISH_LANGUAGE_TEST', 'MANDATORY_LEARNING', 'OTHER');

-- CreateEnum
CREATE TYPE "Sensitivity" AS ENUM ('STANDARD', 'SENSITIVE_IDENTITY', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('DECLARED', 'CURRENT', 'EXPIRED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('GENERAL', 'PROVISIONAL', 'LIMITED', 'SUPERVISED_PRACTICE');

-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('UPLOAD', 'AUTHORITATIVE_URI', 'API_RESPONSE', 'ORGANISATION_RECORD');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('SELF_ATTESTED', 'DOCUMENT_INSPECTION', 'PRIMARY_SOURCE', 'API', 'EMPLOYER_RECORD');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('VERIFIED', 'PARTIAL', 'FAILED', 'UNABLE', 'REVOKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ProceduralEndorsementType" AS ENUM ('ANAESTHETICS', 'OBSTETRICS', 'OBSTETRICS_SURGICAL', 'SURGERY', 'EMERGENCY_MEDICINE', 'MENTAL_HEALTH', 'ADULT_INTERNAL_MEDICINE', 'PAEDIATRICS', 'INDIGENOUS_HEALTH');

-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('IN_PERSON', 'TELEHEALTH_SYNCHRONOUS', 'HYBRID');

-- CreateEnum
CREATE TYPE "RequirementSetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('ACTIVE_SCOPE', 'REGISTRATION', 'CREDENTIAL', 'SPECIALTY', 'EXPERIENCE', 'TRAINING', 'AVAILABILITY', 'FATIGUE', 'PROCUREMENT', 'COMMERCIAL', 'PREFERENCE', 'AREA_OF_NEED', 'MORATORIUM_LOCATION', 'VISA_WORK_RIGHTS', 'TELEHEALTH_MEDICARE_ELIGIBILITY', 'CROSS_BORDER_PRESCRIBING_AUTHORITY', 'TECHNOLOGY_CREDENTIAL');

-- CreateEnum
CREATE TYPE "ScopeGrantStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PreferenceDimension" AS ENUM ('SITE', 'REGION', 'ROLE', 'RATE', 'TRAVEL', 'ACCOMMODATION', 'AGENCY_RELATIONSHIP');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'APPROVED', 'SOURCING', 'CANDIDATE_SELECTED', 'BOOKED', 'WORKED', 'TIMESHEET_PENDING', 'COMPLETE', 'CANCELLED', 'UNFILLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CandidateSourceType" AS ENUM ('AGENCY', 'DIRECT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('DISCOVERED', 'NOTIFIED', 'INTERESTED', 'APPLIED', 'AGENCY_PROPOSED', 'ELIGIBILITY_PENDING', 'ELIGIBLE', 'INELIGIBLE', 'SELECTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('ELIGIBLE', 'INELIGIBLE', 'INDETERMINATE');

-- CreateEnum
CREATE TYPE "RequirementResultStatus" AS ENUM ('PASS', 'FAIL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELLED_BY_DOCTOR', 'CANCELLED_BY_SERVICE', 'REPLACED', 'WORKED', 'NO_SHOW', 'CLOSED');

-- CreateEnum
CREATE TYPE "PanelStatus" AS ENUM ('ELIGIBLE', 'SUSPENDED', 'EXPIRED', 'INELIGIBLE');

-- CreateEnum
CREATE TYPE "FeeModel" AS ENUM ('PERCENT', 'FIXED', 'MARKUP', 'OTHER');

-- CreateEnum
CREATE TYPE "AgencyProposalStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVAL_SENT', 'APPROVED', 'AMENDED', 'REJECTED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportabilityStatus" AS ENUM ('PENDING', 'AGGREGATABLE', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "ShareStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ShareAccessEventType" AS ENUM ('OPEN', 'VIEW', 'DOWNLOAD', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkEpisodeSource" AS ENUM ('PLATFORM_BOOKING', 'SELF_DECLARED', 'PARTNER_FEED');

-- CreateTable
CREATE TABLE "Practitioner" (
    "id" TEXT NOT NULL,
    "status" "PractitionerStatus" NOT NULL DEFAULT 'ACTIVE',
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practitioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerIdentifier" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "issuer" TEXT,
    "status" "IdentifierStatus" NOT NULL DEFAULT 'ACTIVE',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "type" "OrganisationType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceGroupId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CredentialCategory" NOT NULL,
    "issuerType" TEXT,
    "validityModel" TEXT,
    "requiredFieldsJson" JSONB,
    "allowedEvidenceTypes" JSONB,
    "allowedVerificationMethods" JSONB,
    "sensitivity" "Sensitivity" NOT NULL DEFAULT 'STANDARD',
    "shareDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CredentialDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerCredential" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "issuer" TEXT,
    "referenceNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "CredentialStatus" NOT NULL DEFAULT 'DECLARED',
    "registrationType" "RegistrationType",
    "attributesJson" JSONB,
    "createdBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PractitionerCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialEvidence" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "objectKey" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sensitivity" "Sensitivity" NOT NULL DEFAULT 'STANDARD',
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "CredentialEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "verifierActorId" TEXT,
    "verifierOrgId" TEXT,
    "method" "VerificationMethod" NOT NULL,
    "source" TEXT,
    "result" "VerificationResult" NOT NULL,
    "assuranceLevel" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "policyVersion" TEXT,
    "evidenceHash" TEXT,
    "notes" TEXT,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProceduralEndorsement" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "endorsementType" "ProceduralEndorsementType" NOT NULL,
    "awardingBody" TEXT,
    "awardedAt" TIMESTAMP(3),
    "currencyStatus" TEXT NOT NULL DEFAULT 'CURRENT',
    "caseCountWindowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProceduralEndorsement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleTemplate" (
    "id" TEXT NOT NULL,
    "ownerOrgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" TEXT,
    "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'IN_PERSON',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "defaultRequirementSetId" TEXT,

    CONSTRAINT "RoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementSet" (
    "id" TEXT NOT NULL,
    "roleTemplateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "RequirementSetStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "RequirementSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "requirementSetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "RequirementType" NOT NULL,
    "hard" BOOLEAN NOT NULL DEFAULT true,
    "evaluator" TEXT NOT NULL,
    "parametersJson" JSONB,
    "failureMessage" TEXT,
    "unknownMessage" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeGrant" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "issuingOrgId" TEXT NOT NULL,
    "roleActivityCode" TEXT NOT NULL,
    "status" "ScopeGrantStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "restrictionsJson" JSONB,
    "supervisionLevel" TEXT,
    "decisionReference" TEXT,
    "sourceSystem" TEXT,
    "sourceRef" TEXT,
    "sourceVersion" TEXT,
    "supersedesId" TEXT,

    CONSTRAINT "ScopeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeGrantFacility" (
    "scopeGrantId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "serviceId" TEXT,

    CONSTRAINT "ScopeGrantFacility_pkey" PRIMARY KEY ("scopeGrantId","facilityId")
);

-- CreateTable
CREATE TABLE "AreaOfNeedDetermination" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "determiningAuthority" TEXT NOT NULL,
    "organisationId" TEXT,
    "facilityId" TEXT,
    "positionRef" TEXT,
    "classification" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "AreaOfNeedDetermination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoratoriumStatus" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "facilityId" TEXT,
    "dwsAreaCode" TEXT,
    "restricted" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "source" TEXT,

    CONSTRAINT "MoratoriumStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerPreference" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "dimension" "PreferenceDimension" NOT NULL,
    "targetId" TEXT,
    "valueJson" JSONB,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "PractitionerPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "recurrenceJson" JSONB,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "roleTemplateId" TEXT NOT NULL,
    "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'IN_PERSON',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "VacancyStatus" NOT NULL DEFAULT 'DRAFT',
    "reasonCode" TEXT,
    "rateContextJson" JSONB,
    "travelAccommodationJson" JSONB,
    "sourcingPolicyId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stagesJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "approvedBy" TEXT,

    CONSTRAINT "SourcingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingRun" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "currentStage" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stageHistoryJson" JSONB,

    CONSTRAINT "SourcingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "sourceType" "CandidateSourceType" NOT NULL,
    "sourceId" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'DISCOVERED',
    "firstVisibleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "interestAt" TIMESTAMP(3),

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityAssessment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT,
    "practitionerId" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "requirementSetId" TEXT NOT NULL,
    "requirementSetVersion" INTEGER NOT NULL,
    "status" "EligibilityStatus" NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "EligibilityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityResult" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" "RequirementResultStatus" NOT NULL,
    "explanation" TEXT NOT NULL,
    "sourceRefsJson" JSONB,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "placementId" TEXT,
    "sourceType" "CandidateSourceType" NOT NULL,
    "sourceId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirmedAt" TIMESTAMP(3),
    "eligibilityAssessmentId" TEXT,
    "commercialSnapshotJson" JSONB,
    "orientationVersion" TEXT,
    "orientationAckAt" TIMESTAMP(3),

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "roleTemplateId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "panelStatus" "PanelStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "categoriesJson" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyAgreement" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "category" TEXT,
    "feeModel" "FeeModel" NOT NULL,
    "termsJson" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "AgencyAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyProposal" (
    "id" TEXT NOT NULL,
    "sourcingRunId" TEXT,
    "agencyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "practitionerId" TEXT,
    "representedIdentityJson" JSONB,
    "rateFeeSnapshotJson" JSONB,
    "status" "AgencyProposalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PractitionerAgencyRelationship" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "categoryRestrictionsJson" JSONB,

    CONSTRAINT "PractitionerAgencyRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingException" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT,
    "reason" TEXT NOT NULL,
    "authority" TEXT,
    "approvedBy" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "reconciliationRef" TEXT,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetVersion" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "allowancesJson" JSONB,
    "doctorComment" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalToken" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "recipient" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "challengeStatus" TEXT,

    CONSTRAINT "ApprovalToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceResponse" (
    "id" TEXT NOT NULL,
    "bookingEpisodeId" TEXT,
    "practitionerId" TEXT NOT NULL,
    "practitionerAnalyticsKey" TEXT,
    "siteFacilityId" TEXT,
    "roleTemplateId" TEXT,
    "period" TIMESTAMP(3),
    "scoresJson" JSONB NOT NULL,
    "freeText" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportability" "ReportabilityStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ExperienceResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementAction" (
    "id" TEXT NOT NULL,
    "siteFacilityId" TEXT,
    "theme" TEXT,
    "title" TEXT NOT NULL,
    "action" TEXT,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourcePeriodStart" TIMESTAMP(3),
    "sourcePeriodEnd" TIMESTAMP(3),

    CONSTRAINT "ImprovementAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialShare" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "recipientLabel" TEXT,
    "recipientContact" TEXT,
    "tokenHash" TEXT NOT NULL,
    "otpRequired" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "ShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareItem" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER,

    CONSTRAINT "ShareItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareAccessEvent" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "event" "ShareAccessEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,

    CONSTRAINT "ShareAccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkEpisode" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "organisationId" TEXT,
    "facilityId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "source" "WorkEpisodeSource" NOT NULL,
    "assuranceLevel" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatigueRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parametersJson" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "RequirementSetStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "FatigueRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatigueAssessment" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EligibilityStatus" NOT NULL,
    "ruleVersion" TEXT,
    "episodesConsideredJson" JSONB,

    CONSTRAINT "FatigueAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatigueDeclaration" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "vacancyId" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statement" TEXT NOT NULL,

    CONSTRAINT "FatigueDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "actorId" TEXT,
    "actingOrgId" TEXT,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "action" TEXT,
    "outcome" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Practitioner_email_key" ON "Practitioner"("email");

-- CreateIndex
CREATE INDEX "PractitionerIdentifier_practitionerId_idx" ON "PractitionerIdentifier"("practitionerId");

-- CreateIndex
CREATE INDEX "Facility_organisationId_idx" ON "Facility"("organisationId");

-- CreateIndex
CREATE INDEX "Service_facilityId_idx" ON "Service"("facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "CredentialDefinition_code_key" ON "CredentialDefinition"("code");

-- CreateIndex
CREATE INDEX "PractitionerCredential_practitionerId_idx" ON "PractitionerCredential"("practitionerId");

-- CreateIndex
CREATE INDEX "CredentialEvidence_credentialId_idx" ON "CredentialEvidence"("credentialId");

-- CreateIndex
CREATE INDEX "Verification_credentialId_idx" ON "Verification"("credentialId");

-- CreateIndex
CREATE INDEX "ProceduralEndorsement_practitionerId_idx" ON "ProceduralEndorsement"("practitionerId");

-- CreateIndex
CREATE INDEX "RoleTemplate_ownerOrgId_idx" ON "RoleTemplate"("ownerOrgId");

-- CreateIndex
CREATE INDEX "RequirementSet_roleTemplateId_idx" ON "RequirementSet"("roleTemplateId");

-- CreateIndex
CREATE INDEX "Requirement_requirementSetId_idx" ON "Requirement"("requirementSetId");

-- CreateIndex
CREATE INDEX "ScopeGrant_practitionerId_idx" ON "ScopeGrant"("practitionerId");

-- CreateIndex
CREATE INDEX "ScopeGrant_issuingOrgId_idx" ON "ScopeGrant"("issuingOrgId");

-- CreateIndex
CREATE INDEX "AreaOfNeedDetermination_practitionerId_idx" ON "AreaOfNeedDetermination"("practitionerId");

-- CreateIndex
CREATE INDEX "MoratoriumStatus_practitionerId_idx" ON "MoratoriumStatus"("practitionerId");

-- CreateIndex
CREATE INDEX "PractitionerPreference_practitionerId_idx" ON "PractitionerPreference"("practitionerId");

-- CreateIndex
CREATE INDEX "Availability_practitionerId_idx" ON "Availability"("practitionerId");

-- CreateIndex
CREATE INDEX "Vacancy_organisationId_idx" ON "Vacancy"("organisationId");

-- CreateIndex
CREATE INDEX "Vacancy_facilityId_idx" ON "Vacancy"("facilityId");

-- CreateIndex
CREATE INDEX "SourcingPolicy_orgId_idx" ON "SourcingPolicy"("orgId");

-- CreateIndex
CREATE INDEX "SourcingRun_vacancyId_idx" ON "SourcingRun"("vacancyId");

-- CreateIndex
CREATE INDEX "Candidate_vacancyId_idx" ON "Candidate"("vacancyId");

-- CreateIndex
CREATE INDEX "Candidate_practitionerId_idx" ON "Candidate"("practitionerId");

-- CreateIndex
CREATE INDEX "EligibilityAssessment_practitionerId_idx" ON "EligibilityAssessment"("practitionerId");

-- CreateIndex
CREATE INDEX "EligibilityAssessment_vacancyId_idx" ON "EligibilityAssessment"("vacancyId");

-- CreateIndex
CREATE INDEX "EligibilityResult_assessmentId_idx" ON "EligibilityResult"("assessmentId");

-- CreateIndex
CREATE INDEX "Booking_vacancyId_idx" ON "Booking"("vacancyId");

-- CreateIndex
CREATE INDEX "Booking_practitionerId_idx" ON "Booking"("practitionerId");

-- CreateIndex
CREATE INDEX "Placement_practitionerId_idx" ON "Placement"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "Agency_organisationId_key" ON "Agency"("organisationId");

-- CreateIndex
CREATE INDEX "AgencyAgreement_agencyId_idx" ON "AgencyAgreement"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyProposal_candidateId_key" ON "AgencyProposal"("candidateId");

-- CreateIndex
CREATE INDEX "AgencyProposal_agencyId_idx" ON "AgencyProposal"("agencyId");

-- CreateIndex
CREATE INDEX "PractitionerAgencyRelationship_practitionerId_idx" ON "PractitionerAgencyRelationship"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_bookingId_key" ON "Timesheet"("bookingId");

-- CreateIndex
CREATE INDEX "TimesheetVersion_timesheetId_idx" ON "TimesheetVersion"("timesheetId");

-- CreateIndex
CREATE INDEX "ApprovalToken_timesheetId_idx" ON "ApprovalToken"("timesheetId");

-- CreateIndex
CREATE INDEX "ExperienceResponse_practitionerId_idx" ON "ExperienceResponse"("practitionerId");

-- CreateIndex
CREATE INDEX "CredentialShare_practitionerId_idx" ON "CredentialShare"("practitionerId");

-- CreateIndex
CREATE INDEX "ShareItem_shareId_idx" ON "ShareItem"("shareId");

-- CreateIndex
CREATE INDEX "ShareAccessEvent_shareId_idx" ON "ShareAccessEvent"("shareId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEpisode_bookingId_key" ON "WorkEpisode"("bookingId");

-- CreateIndex
CREATE INDEX "WorkEpisode_practitionerId_idx" ON "WorkEpisode"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "FatigueRule_code_key" ON "FatigueRule"("code");

-- CreateIndex
CREATE INDEX "FatigueAssessment_practitionerId_idx" ON "FatigueAssessment"("practitionerId");

-- CreateIndex
CREATE INDEX "FatigueDeclaration_practitionerId_idx" ON "FatigueDeclaration"("practitionerId");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "PractitionerIdentifier" ADD CONSTRAINT "PractitionerIdentifier_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerCredential" ADD CONSTRAINT "PractitionerCredential_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerCredential" ADD CONSTRAINT "PractitionerCredential_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CredentialDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialEvidence" ADD CONSTRAINT "CredentialEvidence_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "PractitionerCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "PractitionerCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "CredentialEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProceduralEndorsement" ADD CONSTRAINT "ProceduralEndorsement_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleTemplate" ADD CONSTRAINT "RoleTemplate_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSet" ADD CONSTRAINT "RequirementSet_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "RoleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_requirementSetId_fkey" FOREIGN KEY ("requirementSetId") REFERENCES "RequirementSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeGrant" ADD CONSTRAINT "ScopeGrant_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeGrant" ADD CONSTRAINT "ScopeGrant_issuingOrgId_fkey" FOREIGN KEY ("issuingOrgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeGrantFacility" ADD CONSTRAINT "ScopeGrantFacility_scopeGrantId_fkey" FOREIGN KEY ("scopeGrantId") REFERENCES "ScopeGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopeGrantFacility" ADD CONSTRAINT "ScopeGrantFacility_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaOfNeedDetermination" ADD CONSTRAINT "AreaOfNeedDetermination_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaOfNeedDetermination" ADD CONSTRAINT "AreaOfNeedDetermination_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaOfNeedDetermination" ADD CONSTRAINT "AreaOfNeedDetermination_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoratoriumStatus" ADD CONSTRAINT "MoratoriumStatus_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoratoriumStatus" ADD CONSTRAINT "MoratoriumStatus_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerPreference" ADD CONSTRAINT "PractitionerPreference_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "RoleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_sourcingPolicyId_fkey" FOREIGN KEY ("sourcingPolicyId") REFERENCES "SourcingPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingPolicy" ADD CONSTRAINT "SourcingPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingRun" ADD CONSTRAINT "SourcingRun_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingRun" ADD CONSTRAINT "SourcingRun_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SourcingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_requirementSetId_fkey" FOREIGN KEY ("requirementSetId") REFERENCES "RequirementSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityResult" ADD CONSTRAINT "EligibilityResult_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "EligibilityAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityResult" ADD CONSTRAINT "EligibilityResult_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "Placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eligibilityAssessmentId_fkey" FOREIGN KEY ("eligibilityAssessmentId") REFERENCES "EligibilityAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agency" ADD CONSTRAINT "Agency_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyAgreement" ADD CONSTRAINT "AgencyAgreement_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyProposal" ADD CONSTRAINT "AgencyProposal_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyProposal" ADD CONSTRAINT "AgencyProposal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerAgencyRelationship" ADD CONSTRAINT "PractitionerAgencyRelationship_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PractitionerAgencyRelationship" ADD CONSTRAINT "PractitionerAgencyRelationship_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetVersion" ADD CONSTRAINT "TimesheetVersion_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalToken" ADD CONSTRAINT "ApprovalToken_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceResponse" ADD CONSTRAINT "ExperienceResponse_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialShare" ADD CONSTRAINT "CredentialShare_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareItem" ADD CONSTRAINT "ShareItem_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "CredentialShare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareAccessEvent" ADD CONSTRAINT "ShareAccessEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "CredentialShare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEpisode" ADD CONSTRAINT "WorkEpisode_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEpisode" ADD CONSTRAINT "WorkEpisode_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkEpisode" ADD CONSTRAINT "WorkEpisode_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FatigueAssessment" ADD CONSTRAINT "FatigueAssessment_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FatigueAssessment" ADD CONSTRAINT "FatigueAssessment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FatigueDeclaration" ADD CONSTRAINT "FatigueDeclaration_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
