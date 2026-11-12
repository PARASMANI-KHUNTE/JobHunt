-- ============================================================================
-- JobHunt OS — Phase 1 Initial PostgreSQL Schema Migration
-- Matches Section 5 of the Product & Engineering Specification
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. candidate_profiles
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  headline TEXT,
  summary TEXT,
  experience_years NUMERIC(4, 1) DEFAULT 0,
  resume_url TEXT,
  resume_text TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  profile_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. candidate_skills
CREATE TABLE IF NOT EXISTS candidate_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  normalized_skill TEXT NOT NULL,
  proficiency TEXT DEFAULT 'INTERMEDIATE',
  years_experience NUMERIC(4, 1) DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_profile_normalized_skill UNIQUE (profile_id, normalized_skill)
);

-- 4. companies
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  country_code TEXT,
  headquarters TEXT,
  industry TEXT,
  description TEXT,
  employee_count INTEGER,
  investigation_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (investigation_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'UNKNOWN')),
  hiring_priority NUMERIC(5, 2) DEFAULT 0,
  last_researched_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. funding_rounds
CREATE TABLE IF NOT EXISTS funding_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  round_type TEXT NOT NULL
    CHECK (round_type IN ('BOOTSTRAPPED', 'PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'SERIES_D_PLUS', 'GROWTH', 'IPO', 'UNKNOWN')),
  amount NUMERIC(18, 2),
  currency CHAR(3),
  announcement_date DATE,
  publication_date DATE,
  investors JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_url TEXT NOT NULL,
  source_name TEXT,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. company_signals
CREATE TABLE IF NOT EXISTS company_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  signal_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
  source_url TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. job_sources
CREATE TABLE IF NOT EXISTS job_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  ats_provider TEXT NOT NULL DEFAULT 'UNKNOWN',
  poll_interval_seconds INTEGER NOT NULL DEFAULT 900,
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'HEALTHY'
    CHECK (status IN ('HEALTHY', 'DEGRADED', 'PAUSED', 'FAILED')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. jobs
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  external_id TEXT,
  title TEXT NOT NULL,
  normalized_title TEXT,
  description TEXT,
  description_hash TEXT,
  location TEXT,
  country_code TEXT,
  work_mode TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (work_mode IN ('REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN')),
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME'
    CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'UNKNOWN')),
  salary_min NUMERIC(15, 2),
  salary_max NUMERIC(15, 2),
  salary_currency CHAR(3),
  experience_min NUMERIC(4, 1),
  experience_max NUMERIC(4, 1),
  posted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  last_verified_open_at TIMESTAMPTZ,
  apply_url TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'CLOSED', 'STALE')),
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_external_id
  ON jobs (source_id, external_id)
  WHERE external_id IS NOT NULL;

-- 9. job_evaluations
CREATE TABLE IF NOT EXISTS job_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  profile_version INTEGER NOT NULL,
  evaluation_version TEXT NOT NULL DEFAULT '1.0',
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  decision TEXT NOT NULL CHECK (decision IN ('QUALIFIED', 'REVIEW', 'REJECTED')),
  score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  hard_filter_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL DEFAULT 'deterministic-v1',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_job_eval_version UNIQUE (job_id, profile_id, profile_version, evaluation_version)
);

-- 10. contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT NOT NULL,
  email TEXT,
  email_status TEXT NOT NULL DEFAULT 'NOT_FOUND'
    CHECK (email_status IN ('VERIFIED', 'PUBLICLY_LISTED', 'INFERRED', 'NOT_FOUND')),
  email_source_url TEXT,
  linkedin_url TEXT,
  other_profile_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. outreach_drafts
CREATE TABLE IF NOT EXISTS outreach_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  personalization_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'SENT', 'DISCARDED', 'FAILED')),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. applications
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'SAVED'
    CHECK (status IN ('SAVED', 'READY_TO_APPLY', 'APPLIED', 'SHORTLISTED', 'INTERVIEWING', 'REJECTED', 'GHOSTED', 'WITHDRAWN', 'OFFER', 'CLOSED')),
  applied_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  application_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_application_profile_job UNIQUE (profile_id, job_id)
);

-- 13. application_events
CREATE TABLE IF NOT EXISTS application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- 14. agent_runs
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT UNIQUE NOT NULL,
  agent_name TEXT NOT NULL,
  task_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  idempotency_key TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  reference_type TEXT,
  reference_id UUID,
  delivery_channel TEXT NOT NULL DEFAULT 'IN_APP',
  delivery_status TEXT NOT NULL DEFAULT 'DELIVERED',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Recommended Indexes (Section 5.2)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_first_seen_at ON jobs(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_hiring_priority ON companies(hiring_priority DESC);
CREATE INDEX IF NOT EXISTS idx_funding_rounds_announcement_date ON funding_rounds(announcement_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_sources_next_check_at ON job_sources(next_check_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created_at ON agent_runs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_applications_profile_status ON applications(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_profile_norm ON candidate_skills(profile_id, normalized_skill);
CREATE INDEX IF NOT EXISTS idx_job_evaluations_profile_decision_score ON job_evaluations(profile_id, decision, score DESC);
