import {
  FundingStage,
  AtsProvider,
  EvaluationDecision,
  ApplicationStatus,
} from '../../contracts/src/index.ts';

export interface UserRecord {
  id: string;
  email: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface CandidatePreferences {
  target_roles: string[];
  geographies: string[];
  remote_only: boolean;
  minimum_salary: number;
  salary_currency: string;
  maximum_experience: number;
  telegram_alerts_enabled?: boolean;
  telegram_chat_id?: string;
}

export interface CandidateProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  headline: string;
  summary: string;
  experience_years: number;
  resume_url: string | null;
  resume_text: string;
  preferences: CandidatePreferences;
  /** Structured work history extracted from the candidate resume (JSONB). */
  work_experience?: ResumeWorkExperienceRecord[] | null;
  /** Structured education history extracted from the candidate resume (JSONB). */
  education?: ResumeEducationRecord[] | null;
  profile_version: number;
  created_at: string;
  updated_at: string;
}

export interface ResumeWorkExperienceRecord {
  company: string | null;
  title: string | null;
  start: string | null;
  end: string | null;
  current: boolean;
  duration_years: number;
}

export interface ResumeEducationRecord {
  degree: string;
  institution: string | null;
  year: string | null;
}

export interface CandidateSkillRecord {
  id: string;
  profile_id: string;
  skill_name: string;
  normalized_skill: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  years_experience: number;
  created_at: string;
  updated_at: string;
}

export interface PriorityBreakdown {
  funding_score: number;
  hiring_score: number;
  growth_score: number;
  role_relevance_score: number;
  formula: string;
}

export interface CompanyRecord {
  id: string;
  name: string;
  normalized_name: string;
  website: string | null;
  domain: string | null;
  country_code: string | null;
  headquarters: string | null;
  industry: string | null;
  description: string | null;
  employee_count: number | null;
  investigation_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'UNKNOWN';
  hiring_priority: number;
  last_researched_at: string | null;
  metadata: {
    career_page?: string | null;
    ats_provider?: AtsProvider;
    priority_breakdown?: PriorityBreakdown;
    verified_identity?: boolean;
    source_evidence_url?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface FundingRoundRecord {
  id: string;
  company_id: string;
  round_type: FundingStage;
  amount: number | null;
  currency: string | null;
  announcement_date: string | null;
  publication_date: string;
  investors: string[];
  source_url: string;
  source_name: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface CompanySignalRecord {
  id: string;
  company_id: string;
  signal_type: string;
  signal_value: Record<string, any>;
  confidence: number;
  source_url: string | null;
  observed_at: string;
  created_at: string;
}

export interface JobSourceRecord {
  id: string;
  company_id: string;
  source_type: AtsProvider;
  source_url: string;
  ats_provider: AtsProvider;
  poll_interval_seconds: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  status: 'HEALTHY' | 'DEGRADED' | 'PAUSED' | 'FAILED';
  failure_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRecord {
  id: string;
  company_id: string;
  source_id: string;
  external_id: string | null;
  title: string;
  normalized_title: string;
  description: string;
  description_hash: string;
  location: string | null;
  country_code: string | null;
  work_mode: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'UNKNOWN';
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  experience_min: number | null;
  experience_max: number | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string | null;
  last_verified_open_at: string | null;
  apply_url: string | null;
  source_url: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'STALE';
  raw_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface JobEvaluationRecord {
  id: string;
  job_id: string;
  profile_id: string;
  profile_version: number;
  evaluation_version: string;
  score: number;
  decision: EvaluationDecision;
  score_breakdown: {
    technical_skills: number;
    role_relevance: number;
    experience: number;
    responsibilities: number;
    location: number;
    salary: number;
  };
  hard_filter_results: {
    location_eligible: boolean;
    experience_eligible: boolean;
    role_eligible: boolean;
    work_mode_eligible: boolean;
    salary_eligible: boolean;
  };
  matched_skills: string[];
  missing_skills: string[];
  reasoning: string;
  evidence: Array<{
    claim: string;
    quote: string;
    source: string;
  }>;
  model_version: string;
  evaluated_at: string;
}

export interface ContactRecord {
  id: string;
  company_id: string;
  name: string;
  designation: string;
  email: string | null;
  email_status: 'VERIFIED' | 'PUBLICLY_LISTED' | 'INFERRED' | 'NOT_FOUND';
  email_source_url: string | null;
  linkedin_url: string | null;
  other_profile_url: string | null;
  metadata: {
    priority_rank?: number;
    role_category?: string;
    provenance_note?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface OutreachDraftRecord {
  id: string;
  contact_id: string;
  job_id: string;
  profile_id: string;
  subject: string;
  body: string;
  personalization_evidence: Array<{
    fact_type: 'CANDIDATE_RESUME' | 'COMPANY_SIGNAL' | 'JOB_REQUIREMENT';
    detail: string;
    source: string;
  }>;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'DISCARDED' | 'FAILED';
  approved_at: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationRecord {
  id: string;
  job_id: string;
  profile_id: string;
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at: string | null;
  application_url: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationEventRecord {
  id: string;
  application_id: string;
  old_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  notes: string;
  occurred_at: string;
  created_by: string;
}

export interface AgentRunRecord {
  id: string;
  task_id: string;
  agent_name: string;
  task_type: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  input: Record<string, any>;
  output: Record<string, any> | null;
  idempotency_key: string;
  retry_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: 'QUALIFIED_JOB' | 'OUTREACH_READY' | 'SOURCE_ALERT' | 'SYSTEM';
  title: string;
  message: string;
  reference_type: 'JOB' | 'COMPANY' | 'DRAFT' | 'SOURCE';
  reference_id: string;
  delivery_channel: 'IN_APP' | 'TELEGRAM';
  delivery_status: 'DELIVERED' | 'PENDING' | 'FAILED';
  read_at: string | null;
  created_at: string;
}
