import type { EligibilityStatus, RequirementResultStatus, RequirementType } from "./enums.js";

/**
 * Shape of an eligibility explanation as returned to a doctor, credentialling
 * officer or workforce user — see docs/spec/01-technical-architecture-
 * data-model-v0.2.docx Appendix B for the reference JSON example.
 *
 * INVARIANT: `status` must never be ELIGIBLE if any requirement result is
 * UNKNOWN — that combination should be treated as a bug in the caller, not
 * a valid state, if it is ever produced.
 */
export interface EligibilityExplanation {
  assessmentId: string;
  status: EligibilityStatus;
  assessedAt: string;
  role: string;
  facility: string;
  requirements: EligibilityRequirementResult[];
}

export interface EligibilityRequirementResult {
  code: RequirementType | string;
  status: RequirementResultStatus;
  explanation: string;
  source?: {
    type: string;
    id: string;
    version?: number | string;
  };
}
