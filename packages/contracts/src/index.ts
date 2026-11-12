import { z } from 'zod';

// ==========================================
// 1. Core Enums and Shared Identifiers
// ==========================================

export const FundingStageEnum = z.enum([
  'BOOTSTRAPPED',
  'PRE_SEED',
  'SEED',
  'SERIES_A',
  'SERIES_B',
  'SERIES_C',
  'SERIES_D_PLUS',
  'GROWTH',
  'IPO',
  'UNKNOWN',
]);
export type FundingStage = z.infer<typeof FundingStageEnum>;

export const AtsProviderEnum = z.enum([
  'GREENHOUSE',
  'LEVER',
  'ASHBY',
  'WORKABLE',
  'OTHER',
  'UNKNOWN',
]);
export type AtsProvider = z.infer<typeof AtsProviderEnum>;

export const EvaluationDecisionEnum = z.enum([
  'QUALIFIED',
  'REVIEW',
  'REJECTED',
]);
export type EvaluationDecision = z.infer<typeof EvaluationDecisionEnum>;

export const ApplicationStatusEnum = z.enum([
  'SAVED',
  'READY_TO_APPLY',
  'APPLIED',
  'SHORTLISTED',
  'INTERVIEWING',
  'REJECTED',
  'GHOSTED',
  'WITHDRAWN',
  'OFFER',
  'CLOSED',
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusEnum>;

// ==========================================
// 2. Agent 01 — Funding Scout Contracts
// ==========================================

export const FundingScoutInputSchema = z.object({
  geographies: z.array(z.string()).min(1),
  funding_stages: z.array(FundingStageEnum).min(1),
  lookback_days: z.number().int().positive().default(30),
  max_results: z.number().int().positive().default(100),
});
export type FundingScoutInput = z.infer<typeof FundingScoutInputSchema>;

export const DiscoveredCompanyCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().nullable().optional(),
  country_code: z.string().length(2).nullable().optional(),
  funding_stage: FundingStageEnum.default('UNKNOWN'),
  funding_amount: z.number().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  announcement_date: z.string().nullable().optional(),
  publication_date: z.string(),
  investors: z.array(z.string()).default([]),
  source_url: z.string().url(),
  confidence: z.number().min(0).max(1),
});
export type DiscoveredCompanyCandidate = z.infer<typeof DiscoveredCompanyCandidateSchema>;

export const FundingScoutOutputSchema = z.object({
  companies: z.array(DiscoveredCompanyCandidateSchema),
  discovery_metadata: z.object({
    sources_checked: z.number().int().nonnegative(),
    companies_found: z.number().int().nonnegative(),
  }),
});
export type FundingScoutOutput = z.infer<typeof FundingScoutOutputSchema>;

// ==========================================
// 3. Agent 02 — Company Investigator Contracts
// ==========================================

export const CompanyInvestigatorInputSchema = z.object({
  company_id: z.string().uuid(),
  website: z.string().url(),
  research_depth: z.enum(['standard', 'deep']).default('standard'),
});
export type CompanyInvestigatorInput = z.infer<typeof CompanyInvestigatorInputSchema>;

export const HiringSignalSchema = z.object({
  signal_type: z.string().min(1),
  evidence_url: z.string().url(),
  confidence: z.number().min(0).max(1),
});
export type HiringSignal = z.infer<typeof HiringSignalSchema>;

export const CompanyInvestigatorOutputSchema = z.object({
  company_id: z.string().uuid(),
  description: z.string(),
  industry: z.string().nullable().optional(),
  employee_count: z.number().int().positive().nullable().optional(),
  headquarters: z.string().nullable().optional(),
  career_page: z.string().url().nullable().optional(),
  ats_provider: AtsProviderEnum.default('UNKNOWN'),
  hiring_signals: z.array(HiringSignalSchema).default([]),
  investigation_status: z.enum(['COMPLETED', 'FAILED', 'IN_PROGRESS']),
});
export type CompanyInvestigatorOutput = z.infer<typeof CompanyInvestigatorOutputSchema>;

// ==========================================
// 4. Agent 03 — Job Hunter Contracts
// ==========================================

export const JobHunterInputSchema = z.object({
  company_id: z.string().uuid(),
  source_id: z.string().uuid(),
  source_type: AtsProviderEnum,
  source_url: z.string().url(),
  last_checked_at: z.string().datetime({ offset: true }).nullable().optional(),
});
export type JobHunterInput = z.infer<typeof JobHunterInputSchema>;

export const DiscoveredJobSchema = z.object({
  external_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  location: z.string().nullable().optional(),
  work_mode: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN']).default('UNKNOWN'),
  employment_type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'UNKNOWN']).default('UNKNOWN'),
  apply_url: z.string().url().nullable().optional(),
  posted_at: z.string().datetime({ offset: true }).nullable().optional(),
  first_seen_at: z.string().datetime({ offset: true }),
});
export type DiscoveredJob = z.infer<typeof DiscoveredJobSchema>;

export const JobHunterOutputSchema = z.object({
  company_id: z.string().uuid(),
  discovered_jobs: z.array(DiscoveredJobSchema),
  source_status: z.enum(['HEALTHY', 'DEGRADED', 'FAILED']),
  new_jobs_count: z.number().int().nonnegative(),
  updated_jobs_count: z.number().int().nonnegative(),
  closed_jobs_count: z.number().int().nonnegative(),
});
export type JobHunterOutput = z.infer<typeof JobHunterOutputSchema>;

// ==========================================
// 5. Agent 04 — Job Evaluator Contracts
// ==========================================

export const JobEvaluatorInputSchema = z.object({
  job_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  profile_version: z.number().int().positive(),
  job_description: z.string().min(1),
  candidate_skills: z.array(z.string()).default([]),
  preferences: z.record(z.string(), z.any()).default({}),
});
export type JobEvaluatorInput = z.infer<typeof JobEvaluatorInputSchema>;

export const JobEvaluatorOutputSchema = z.object({
  job_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  decision: EvaluationDecisionEnum,
  hard_filters: z.record(z.string(), z.boolean()),
  score_breakdown: z.object({
    technical_skills: z.number().min(0).max(30),
    role_relevance: z.number().min(0).max(25),
    experience: z.number().min(0).max(15),
    responsibilities: z.number().min(0).max(15),
    location: z.number().min(0).max(10),
    salary: z.number().min(0).max(5),
  }),
  matched_skills: z.array(z.string()),
  missing_skills: z.array(z.string()),
  reasoning: z.string(),
  evidence: z.array(z.any()).default([]),
  evaluation_version: z.string().default('1.0'),
});
export type JobEvaluatorOutput = z.infer<typeof JobEvaluatorOutputSchema>;

// ==========================================
// 6. Agent 05 — Contact Finder Contracts
// ==========================================

export const ContactFinderInputSchema = z.object({
  company_id: z.string().uuid(),
  job_id: z.string().uuid(),
  target_roles: z.array(z.string()).min(1),
});
export type ContactFinderInput = z.infer<typeof ContactFinderInputSchema>;

export const DiscoveredContactSchema = z.object({
  name: z.string().min(1),
  designation: z.string().min(1),
  email: z.string().email().nullable().optional(),
  email_status: z.enum(['VERIFIED', 'PUBLICLY_LISTED', 'INFERRED', 'NOT_FOUND']),
  source_url: z.string().url(),
  linkedin_url: z.string().url().nullable().optional(),
});
export type DiscoveredContact = z.infer<typeof DiscoveredContactSchema>;

export const ContactFinderOutputSchema = z.object({
  company_id: z.string().uuid(),
  contacts: z.array(DiscoveredContactSchema),
  research_status: z.enum(['COMPLETED', 'NOT_FOUND', 'FAILED']),
});
export type ContactFinderOutput = z.infer<typeof ContactFinderOutputSchema>;

// ==========================================
// 7. Agent 06 — Outreach Assistant Contracts
// ==========================================

export const OutreachAssistantInputSchema = z.object({
  candidate_profile_id: z.string().uuid(),
  company_id: z.string().uuid(),
  job_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  research_context: z.record(z.string(), z.any()),
  candidate_experience: z.array(z.string()),
});
export type OutreachAssistantInput = z.infer<typeof OutreachAssistantInputSchema>;

export const OutreachAssistantOutputSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  personalization_evidence: z.array(z.any()).default([]),
  factual_claims_verified: z.boolean(),
  status: z.literal('PENDING_APPROVAL'),
});
export type OutreachAssistantOutput = z.infer<typeof OutreachAssistantOutputSchema>;

// ==========================================
// 8. Standard API Response Contracts
// ==========================================

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    requestId?: string;
    timestamp: string;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown[];
    requestId?: string;
  };
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  uptime_seconds: number;
  timestamp: string;
  version: string;
  environment: string;
  components: {
    api: boolean;
    database: boolean;
    redis: boolean;
    worker: boolean;
  };
}
