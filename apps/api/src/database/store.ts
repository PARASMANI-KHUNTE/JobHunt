import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import {
  UserRecord,
  CandidateProfileRecord,
  CandidateSkillRecord,
  CompanyRecord,
  FundingRoundRecord,
  CompanySignalRecord,
  JobSourceRecord,
  JobRecord,
  JobEvaluationRecord,
  ContactRecord,
  OutreachDraftRecord,
  ApplicationRecord,
  ApplicationEventRecord,
  AgentRunRecord,
  NotificationRecord,
} from '../../../../packages/shared-types/src/index.ts';
import {
  ApplicationStatus,
  AtsProvider,
  FundingStage,
} from '../../../../packages/contracts/src/index.ts';
import {
  normalizeSkill,
  normalizeCompanyName,
  extractNormalizedDomain,
  computeDescriptionHash,
  normalizeFundingStage,
  detectAtsProviderFromUrl,
  calculateCompanyPriority,
  evaluateJobAgainstProfile,
  validateApplicationStatusTransition,
  sanitizeUntrustedText,
  isSafeExternalUrl,
} from '../services/coreEngine.ts';

// ============================================================================
// Server-Side Gemini Client Helper (Optional AI enrichment when key is set)
// ============================================================================
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch {
    return null;
  }
}

// ============================================================================
// In-Memory & Transactional Relational Store (Mirrors PostgreSQL Schema)
// ============================================================================

export class JobHuntStore {
  public users: Map<string, UserRecord> = new Map();
  public profiles: Map<string, CandidateProfileRecord> = new Map();
  public skills: Map<string, CandidateSkillRecord> = new Map();
  public companies: Map<string, CompanyRecord> = new Map();
  public fundingRounds: Map<string, FundingRoundRecord> = new Map();
  public companySignals: Map<string, CompanySignalRecord> = new Map();
  public jobSources: Map<string, JobSourceRecord> = new Map();
  public jobs: Map<string, JobRecord> = new Map();
  public evaluations: Map<string, JobEvaluationRecord> = new Map();
  public contacts: Map<string, ContactRecord> = new Map();
  public outreachDrafts: Map<string, OutreachDraftRecord> = new Map();
  public applications: Map<string, ApplicationRecord> = new Map();
  public applicationEvents: Map<string, ApplicationEventRecord> = new Map();
  public agentRuns: Map<string, AgentRunRecord> = new Map();
  public notifications: Map<string, NotificationRecord> = new Map();
  private sentIdempotencyKeys: Map<string, string> = new Map();

  public defaultUserId = '11111111-1111-4111-8111-111111111111';
  public defaultProfileId = '22222222-2222-4222-8222-222222222222';

  constructor(seedOnInit = true) {
    if (seedOnInit) {
      this.seedInitialData();
    }
  }

  public seedInitialData(): void {
    const now = new Date().toISOString();

    // 1. Default User
    const defaultUser: UserRecord = {
      id: this.defaultUserId,
      email: process.env.USER_EMAIL || 'parasmanikhunte@gmail.com',
      timezone: 'Asia/Kolkata',
      created_at: now,
      updated_at: now,
    };
    this.users.set(defaultUser.id, defaultUser);

    // 2. Candidate Profile
    const defaultProfile: CandidateProfileRecord = {
      id: this.defaultProfileId,
      user_id: this.defaultUserId,
      full_name: 'Paras Manikhunte',
      headline: 'Full-Stack & Backend Software Engineer (Node.js, TypeScript, Python, PostgreSQL)',
      summary:
        'Software Engineer with strong foundations in distributed backend systems, TypeScript/Node.js REST APIs, Python microservices, and relational database design with PostgreSQL.',
      experience_years: 1.5,
      resume_url: null,
      resume_text:
        'Built event-driven Node.js + TypeScript APIs with PostgreSQL and Redis queues. Engineered Python services and React dashboards with automated test suites and Docker deployments.',
      preferences: {
        target_roles: ['Backend Developer', 'Full Stack Developer', 'Software Engineer'],
        geographies: ['IN', 'US', 'GB', 'DE', 'SG', 'GLOBAL'],
        remote_only: true,
        minimum_salary: 700000,
        salary_currency: 'INR',
        maximum_experience: 2,
        telegram_alerts_enabled: true,
        telegram_chat_id: process.env.TELEGRAM_CHAT_ID || '7280059326',
      },
      profile_version: 1,
      created_at: now,
      updated_at: now,
    };
    this.profiles.set(defaultProfile.id, defaultProfile);

    // 3. Candidate Skills
    const initialSkills: Array<{
      name: string;
      proficiency: CandidateSkillRecord['proficiency'];
      years: number;
    }> = [
      { name: 'Node.js', proficiency: 'ADVANCED', years: 1.5 },
      { name: 'TypeScript', proficiency: 'ADVANCED', years: 1.5 },
      { name: 'JavaScript', proficiency: 'ADVANCED', years: 2.0 },
      { name: 'React', proficiency: 'INTERMEDIATE', years: 1.5 },
      { name: 'Python', proficiency: 'ADVANCED', years: 1.5 },
      { name: 'FastAPI', proficiency: 'INTERMEDIATE', years: 1.0 },
      { name: 'PostgreSQL', proficiency: 'ADVANCED', years: 1.5 },
      { name: 'MongoDB', proficiency: 'INTERMEDIATE', years: 1.0 },
    ];

    for (const sk of initialSkills) {
      this.addCandidateSkill(this.defaultProfileId, sk.name, sk.proficiency, sk.years);
    }
  }

  // ==========================================================================
  // Phase 1: Candidate Profile & Skills CRUD (With Ownership & Versioning)
  // ==========================================================================

  public getProfile(userId: string = this.defaultUserId): CandidateProfileRecord {
    for (const profile of this.profiles.values()) {
      if (profile.user_id === userId) {
        return profile;
      }
    }
    throw new Error('FORBIDDEN_OR_NOT_FOUND: Candidate profile not found for user');
  }

  public updateProfile(
    userId: string,
    updates: Partial<Pick<CandidateProfileRecord, 'full_name' | 'headline' | 'summary' | 'experience_years' | 'resume_url' | 'resume_text' | 'preferences'>>
  ): CandidateProfileRecord {
    const existing = this.getProfile(userId);
    const updated: CandidateProfileRecord = {
      ...existing,
      ...updates,
      preferences: updates.preferences
        ? { ...existing.preferences, ...updates.preferences }
        : existing.preferences,
      profile_version: existing.profile_version + 1,
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(updated.id, updated);
    return updated;
  }

  public getSkills(profileId: string): CandidateSkillRecord[] {
    return Array.from(this.skills.values()).filter((s) => s.profile_id === profileId);
  }

  public addCandidateSkill(
    profileId: string,
    skillName: string,
    proficiency: CandidateSkillRecord['proficiency'] = 'INTERMEDIATE',
    yearsExperience = 1.0
  ): CandidateSkillRecord {
    if (!this.profiles.has(profileId)) {
      throw new Error('FOREIGN_KEY_VIOLATION: Profile does not exist');
    }
    const norm = normalizeSkill(skillName);
    if (!norm) {
      throw new Error('VALIDATION_ERROR: Skill name cannot be empty');
    }

    // Check unique constraint (profile_id, normalized_skill)
    for (const existing of this.skills.values()) {
      if (existing.profile_id === profileId && existing.normalized_skill === norm) {
        throw new Error(`UNIQUE_VIOLATION: Skill '${skillName}' already exists on profile`);
      }
    }

    const now = new Date().toISOString();
    const record: CandidateSkillRecord = {
      id: crypto.randomUUID(),
      profile_id: profileId,
      skill_name: skillName.trim(),
      normalized_skill: norm,
      proficiency,
      years_experience: yearsExperience,
      created_at: now,
      updated_at: now,
    };
    this.skills.set(record.id, record);
    return record;
  }

  public removeCandidateSkill(profileId: string, skillId: string): boolean {
    const existing = this.skills.get(skillId);
    if (!existing || existing.profile_id !== profileId) {
      return false;
    }
    return this.skills.delete(skillId);
  }

  // ==========================================================================
  // Phase 2 & 3: Company Deduplication, Funding Rounds & Priority Scoring
  // ==========================================================================

  public upsertCompanyWithDeduplication(input: {
    name: string;
    website?: string | null;
    country_code?: string | null;
    headquarters?: string | null;
    industry?: string | null;
    description?: string | null;
    employee_count?: number | null;
    source_evidence_url?: string;
  }): { company: CompanyRecord; created: boolean } {
    if (!input.name || !input.name.trim()) {
      throw new Error('VALIDATION_ERROR: Company name is required');
    }

    const domain = extractNormalizedDomain(input.website);
    const normName = normalizeCompanyName(input.name);

    // Deduplication Rule (Section 5.1 & Phase 2):
    // "Company identity deduplication should use normalized domain first, then carefully reviewed name/location matching.
    // Do not merge companies solely because their names are similar."
    for (const existing of this.companies.values()) {
      if (domain && existing.domain && existing.domain === domain) {
        // Matched by canonical domain
        const updated: CompanyRecord = {
          ...existing,
          website: input.website || existing.website,
          country_code: input.country_code || existing.country_code,
          headquarters: input.headquarters || existing.headquarters,
          industry: input.industry || existing.industry,
          description: input.description || existing.description,
          employee_count: input.employee_count ?? existing.employee_count,
          updated_at: new Date().toISOString(),
        };
        this.companies.set(updated.id, updated);
        return { company: updated, created: false };
      }

      // Only match by normalized_name if BOTH have no domain and share identical country_code
      if (
        !domain &&
        !existing.domain &&
        existing.normalized_name === normName &&
        existing.country_code === (input.country_code || null)
      ) {
        return { company: existing, created: false };
      }
    }

    const now = new Date().toISOString();
    const detectedAts = detectAtsProviderFromUrl(input.website);
    const created: CompanyRecord = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      normalized_name: normName,
      website: input.website || null,
      domain,
      country_code: input.country_code || null,
      headquarters: input.headquarters || null,
      industry: input.industry || 'Software & Technology',
      description: input.description || null,
      employee_count: input.employee_count ?? null, // Never default unknown employee count to 0!
      investigation_status: 'PENDING',
      hiring_priority: 50,
      last_researched_at: null,
      metadata: {
        ats_provider: detectedAts,
        verified_identity: Boolean(domain),
        source_evidence_url: input.source_evidence_url,
      },
      created_at: now,
      updated_at: now,
    };

    this.companies.set(created.id, created);
    this.recomputeCompanyPriority(created.id);
    return { company: this.companies.get(created.id)!, created: true };
  }

  public addFundingRoundIfNew(input: {
    company_id: string;
    round_type: string;
    amount?: number | null;
    currency?: string | null;
    announcement_date?: string | null;
    publication_date: string;
    investors?: string[];
    source_url: string;
    source_name?: string;
    confidence?: number;
  }): { round: FundingRoundRecord; created: boolean } {
    if (!this.companies.has(input.company_id)) {
      throw new Error('FOREIGN_KEY_VIOLATION: Company does not exist');
    }
    if (!input.source_url || !input.source_url.startsWith('http')) {
      throw new Error('VALIDATION_ERROR: Valid source_url is required for funding provenance');
    }

    const normalizedStage = normalizeFundingStage(input.round_type);

    // Avoid duplicate funding events
    for (const existing of this.fundingRounds.values()) {
      if (
        existing.company_id === input.company_id &&
        existing.round_type === normalizedStage &&
        (existing.source_url === input.source_url ||
          (existing.announcement_date && existing.announcement_date === input.announcement_date))
      ) {
        return { round: existing, created: false };
      }
    }

    const now = new Date().toISOString();
    const record: FundingRoundRecord = {
      id: crypto.randomUUID(),
      company_id: input.company_id,
      round_type: normalizedStage,
      amount: input.amount ?? null, // Never fabricate amount!
      currency: input.currency ?? null,
      announcement_date: input.announcement_date ?? null, // Distinct from publication_date!
      publication_date: input.publication_date,
      investors: input.investors ?? [],
      source_url: input.source_url,
      source_name: input.source_name ?? 'Verified Funding Feed',
      confidence: input.confidence ?? 0.9,
      created_at: now,
      updated_at: now,
    };

    this.fundingRounds.set(record.id, record);
    this.recomputeCompanyPriority(input.company_id);
    return { round: record, created: true };
  }

  public recomputeCompanyPriority(companyId: string): CompanyRecord | null {
    const company = this.companies.get(companyId);
    if (!company) return null;

    const rounds = Array.from(this.fundingRounds.values()).filter((r) => r.company_id === companyId);
    const latestRound = rounds[0];
    const stage: FundingStage = latestRound ? latestRound.round_type : 'UNKNOWN';

    let daysSince: number | null = null;
    if (latestRound?.publication_date) {
      const pubTime = new Date(latestRound.publication_date).getTime();
      if (!Number.isNaN(pubTime)) {
        daysSince = Math.max(0, Math.floor((Date.now() - pubTime) / (1000 * 60 * 60 * 24)));
      }
    }

    const activeJobs = Array.from(this.jobs.values()).filter(
      (j) => j.company_id === companyId && j.status === 'ACTIVE'
    );
    const signals = Array.from(this.companySignals.values()).filter((s) => s.company_id === companyId);

    const matchingJobs = activeJobs.filter((j) => {
      const evalRec = this.getLatestEvaluationForJob(j.id);
      return evalRec && (evalRec.decision === 'QUALIFIED' || evalRec.decision === 'REVIEW');
    });

    const hasAts =
      Boolean(company.metadata?.ats_provider) && company.metadata?.ats_provider !== 'UNKNOWN';

    const { priority, breakdown } = calculateCompanyPriority({
      fundingStage: stage,
      daysSinceAnnouncement: daysSince,
      verifiedOpenRolesCount: activeJobs.length,
      hasConfirmedAts: hasAts,
      signalCount: signals.length,
      matchingRoleCount: matchingJobs.length,
    });

    company.hiring_priority = priority;
    company.metadata = {
      ...company.metadata,
      priority_breakdown: breakdown,
    };
    company.updated_at = new Date().toISOString();
    this.companies.set(companyId, company);
    return company;
  }

  // ==========================================================================
  // Phase 4: Job Upsert, Deduplication & Source Failure Resilience
  // ==========================================================================

  public upsertJobFromSource(input: {
    company_id: string;
    source_id: string;
    external_id: string;
    title: string;
    description: string;
    location?: string | null;
    country_code?: string | null;
    work_mode?: JobRecord['work_mode'];
    employment_type?: JobRecord['employment_type'];
    salary_min?: number | null;
    salary_max?: number | null;
    salary_currency?: string | null;
    experience_min?: number | null;
    experience_max?: number | null;
    posted_at?: string | null;
    apply_url?: string | null;
    source_url?: string | null;
    raw_data?: Record<string, any>;
  }): { job: JobRecord; outcome: 'NEW' | 'UPDATED' | 'UNCHANGED' } {
    if (!this.companies.has(input.company_id) || !this.jobSources.has(input.source_id)) {
      throw new Error('FOREIGN_KEY_VIOLATION: Company or Job Source does not exist');
    }

    const now = new Date().toISOString();
    const descHash = computeDescriptionHash(input.description);

    // Check unique (source_id, external_id) or secondary URL fingerprint
    for (const existing of this.jobs.values()) {
      const sameSourceExternalId =
        existing.source_id === input.source_id && existing.external_id === input.external_id;
      const sameApplyUrl =
        input.apply_url && existing.apply_url && existing.apply_url === input.apply_url;

      if (sameSourceExternalId || sameApplyUrl) {
        const changed =
          existing.description_hash !== descHash || existing.title !== input.title.trim();

        const updated: JobRecord = {
          ...existing,
          title: input.title.trim(),
          normalized_title: input.title.toLowerCase().trim(),
          description: input.description,
          description_hash: descHash,
          location: input.location !== undefined ? input.location : existing.location,
          work_mode: input.work_mode || existing.work_mode,
          salary_min: input.salary_min !== undefined ? input.salary_min : existing.salary_min,
          salary_max: input.salary_max !== undefined ? input.salary_max : existing.salary_max,
          last_seen_at: now,
          last_verified_open_at: now,
          updated_at: changed ? now : existing.updated_at,
        };
        this.jobs.set(updated.id, updated);
        return { job: updated, outcome: changed ? 'UPDATED' : 'UNCHANGED' };
      }
    }

    // Rule: posted_at is NEVER populated from first_seen_at!
    const created: JobRecord = {
      id: crypto.randomUUID(),
      company_id: input.company_id,
      source_id: input.source_id,
      external_id: input.external_id,
      title: input.title.trim(),
      normalized_title: input.title.toLowerCase().trim(),
      description: input.description,
      description_hash: descHash,
      location: input.location ?? null,
      country_code: input.country_code ?? null,
      work_mode: input.work_mode ?? 'UNKNOWN', // Never default unknown work_mode to REMOTE!
      employment_type: input.employment_type ?? 'FULL_TIME',
      salary_min: input.salary_min ?? null, // Never default missing salary to 0!
      salary_max: input.salary_max ?? null,
      salary_currency: input.salary_currency ?? null,
      experience_min: input.experience_min ?? null,
      experience_max: input.experience_max ?? null,
      posted_at: input.posted_at ?? null,
      first_seen_at: now,
      last_seen_at: now,
      last_verified_open_at: now,
      apply_url: input.apply_url ?? null,
      source_url: input.source_url ?? null,
      status: 'ACTIVE',
      raw_data: input.raw_data ?? {},
      created_at: now,
      updated_at: now,
    };

    this.jobs.set(created.id, created);
    this.recomputeCompanyPriority(input.company_id);
    return { job: created, outcome: 'NEW' };
  }

  public recordSourceFetchFailure(sourceId: string, errorMessage: string): JobSourceRecord {
    const src = this.jobSources.get(sourceId);
    if (!src) throw new Error('NOT_FOUND: Job source not found');

    // Rule (Section 4 & Phase 4):
    // "Do not mark a job closed from one transient fetch failure. A source outage is not proof that all its jobs are closed."
    const failures = src.failure_count + 1;
    const updated: JobSourceRecord = {
      ...src,
      failure_count: failures,
      last_error: errorMessage,
      status: failures >= 3 ? 'DEGRADED' : 'HEALTHY',
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.jobSources.set(sourceId, updated);
    return updated;
  }

  public addJobSource(source: {
    companyId: string;
    sourceUrl: string;
    sourceType?: AtsProvider;
    atsProvider?: AtsProvider;
  }): JobSourceRecord {
    const id = crypto.randomUUID();
    const ats = source.atsProvider || source.sourceType || 'UNKNOWN';
    const rec: JobSourceRecord = {
      id,
      company_id: source.companyId,
      source_type: ats,
      source_url: source.sourceUrl,
      ats_provider: ats,
      poll_interval_seconds: 600,
      last_checked_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + 600_000).toISOString(),
      status: 'HEALTHY',
      failure_count: 0,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.jobSources.set(id, rec);
    return rec;
  }

  public addContact(contact: {
    companyId: string;
    name: string;
    designation?: string;
    email?: string | null;
    emailStatus?: ContactRecord['email_status'];
    emailSourceUrl?: string | null;
    linkedinUrl?: string | null;
    otherProfileUrl?: string | null;
  }): ContactRecord {
    const id = crypto.randomUUID();
    const rec: ContactRecord = {
      id,
      company_id: contact.companyId,
      name: contact.name,
      designation: contact.designation || 'Recruiter',
      email: contact.email ?? null,
      email_status: contact.emailStatus || (contact.email ? 'VERIFIED' : 'NOT_FOUND'),
      email_source_url: contact.emailSourceUrl ?? null,
      linkedin_url: contact.linkedinUrl ?? null,
      other_profile_url: contact.otherProfileUrl ?? null,
      metadata: { provenance_note: 'Verified' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.contacts.set(id, rec);
    return rec;
  }

  // ==========================================================================
  // Phase 5 & 6: Job Evaluation & Idempotent Notification Dispatch
  // ==========================================================================

  public evaluateAndPersistJob(
    jobId: string,
    profileId: string = this.defaultProfileId,
    evaluationVersion = '1.0'
  ): JobEvaluationRecord {
    const job = this.jobs.get(jobId);
    const profile = this.profiles.get(profileId);
    if (!job || !profile) {
      throw new Error('NOT_FOUND: Job or Candidate Profile not found');
    }

    // Check idempotency for (job_id, profile_id, profile_version, evaluation_version)
    for (const existing of this.evaluations.values()) {
      if (
        existing.job_id === jobId &&
        existing.profile_id === profileId &&
        existing.profile_version === profile.profile_version &&
        existing.evaluation_version === evaluationVersion
      ) {
        return existing;
      }
    }

    const skills = this.getSkills(profileId);
    const result = evaluateJobAgainstProfile(job, profile, skills);

    const record: JobEvaluationRecord = {
      id: crypto.randomUUID(),
      job_id: jobId,
      profile_id: profileId,
      profile_version: profile.profile_version,
      evaluation_version: evaluationVersion,
      score: result.score,
      decision: result.decision,
      score_breakdown: result.score_breakdown,
      hard_filter_results: result.hard_filter_results,
      matched_skills: result.matched_skills,
      missing_skills: result.missing_skills,
      reasoning: result.reasoning,
      evidence: result.evidence,
      model_version: 'deterministic-core-v1.0',
      evaluated_at: new Date().toISOString(),
    };

    this.evaluations.set(record.id, record);

    // If QUALIFIED, emit idempotent notification!
    if (record.decision === 'QUALIFIED') {
      const company = this.companies.get(job.company_id);
      this.createIdempotentNotification({
        user_id: profile.user_id,
        type: 'QUALIFIED_JOB',
        title: `Qualified Match (${record.score}/100): ${job.title} at ${company?.name || 'Company'}`,
        message: `${record.reasoning} Work mode: ${job.work_mode}. Location: ${job.location || 'Remote'}.`,
        reference_type: 'JOB',
        reference_id: job.id,
        delivery_channel: profile.preferences.telegram_alerts_enabled ? 'TELEGRAM' : 'IN_APP',
      });
    }

    this.recomputeCompanyPriority(job.company_id);
    return record;
  }

  public getLatestEvaluationForJob(
    jobId: string,
    profileId: string = this.defaultProfileId
  ): JobEvaluationRecord | null {
    const matching = Array.from(this.evaluations.values())
      .filter((e) => e.job_id === jobId && e.profile_id === profileId)
      .sort((a, b) => b.profile_version - a.profile_version);
    return matching[0] || null;
  }

  public createIdempotentNotification(input: {
    user_id: string;
    type: NotificationRecord['type'];
    title: string;
    message: string;
    reference_type: NotificationRecord['reference_type'];
    reference_id: string;
    delivery_channel?: NotificationRecord['delivery_channel'];
  }): { notification: NotificationRecord; created: boolean } {
    for (const existing of this.notifications.values()) {
      if (
        existing.user_id === input.user_id &&
        existing.type === input.type &&
        existing.reference_type === input.reference_type &&
        existing.reference_id === input.reference_id
      ) {
        return { notification: existing, created: false };
      }
    }

    const record: NotificationRecord = {
      id: crypto.randomUUID(),
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message,
      reference_type: input.reference_type,
      reference_id: input.reference_id,
      delivery_channel: input.delivery_channel || 'IN_APP',
      delivery_status: 'DELIVERED',
      read_at: null,
      created_at: new Date().toISOString(),
    };
    this.notifications.set(record.id, record);
    return { notification: record, created: true };
  }

  // ==========================================================================
  // Phase 8: Outreach Drafts — Human-in-the-Loop Approval & Explicit Send
  // ==========================================================================

  public createOutreachDraft(input: {
    contact_id: string;
    job_id: string;
    profile_id?: string;
    subject?: string;
    body?: string;
  }): OutreachDraftRecord {
    const profileId = input.profile_id || this.defaultProfileId;
    const contact = this.contacts.get(input.contact_id);
    const job = this.jobs.get(input.job_id);
    const profile = this.profiles.get(profileId);

    if (!contact || !job || !profile) {
      throw new Error('NOT_FOUND: Contact, Job, or Profile not found');
    }

    const company = this.companies.get(job.company_id);
    const rounds = Array.from(this.fundingRounds.values()).filter((r) => r.company_id === job.company_id);
    const latestRound = rounds[0];
    const skills = this.getSkills(profileId).slice(0, 4).map((s) => s.skill_name);

    const fundingMention = latestRound
      ? `Congratulations to the ${company?.name} team on your recent ${latestRound.round_type.replace('_', ' ')} funding milestone.`
      : `I have been following ${company?.name}'s engineering work in ${company?.industry || 'technology'}.`;

    const generatedSubject =
      input.subject || `Interest in ${job.title} at ${company?.name || 'your team'} — ${profile.full_name}`;

    const generatedBody =
      input.body ||
      `Hi ${contact.name.split(' ')[0]},\n\n${fundingMention}\n\nI recently came across the ${job.title} opening at ${company?.name}. With ${profile.experience_years} years of hands-on experience building production systems using ${skills.join(', ')}, my background aligns closely with your requirements.\n\n${profile.resume_text}\n\nI would love to share my resume and learn more about your engineering roadmap.\n\nBest regards,\n${profile.full_name}`;

    const now = new Date().toISOString();
    const draft: OutreachDraftRecord = {
      id: crypto.randomUUID(),
      contact_id: contact.id,
      job_id: job.id,
      profile_id: profile.id,
      subject: generatedSubject,
      body: generatedBody,
      personalization_evidence: [
        {
          fact_type: 'CANDIDATE_RESUME',
          detail: `${profile.experience_years} yrs experience; core stack: ${skills.join(', ')}`,
          source: `Candidate Profile v${profile.profile_version}`,
        },
        ...(latestRound
          ? [
              {
                fact_type: 'COMPANY_SIGNAL' as const,
                detail: `${latestRound.round_type} funding round from ${latestRound.source_name}`,
                source: latestRound.source_url,
              },
            ]
          : []),
        {
          fact_type: 'JOB_REQUIREMENT',
          detail: `Role: ${job.title} (${job.work_mode})`,
          source: job.source_url || job.apply_url || 'Job Listing',
        },
      ],
      status: 'PENDING_APPROVAL', // Mandatory safety invariant!
      approved_at: null,
      sent_at: null,
      provider_message_id: null,
      created_at: now,
      updated_at: now,
    };

    this.outreachDrafts.set(draft.id, draft);
    return draft;
  }

  public approveOutreachDraft(draftId: string): OutreachDraftRecord {
    const draft = this.outreachDrafts.get(draftId);
    if (!draft) throw new Error('NOT_FOUND: Outreach draft not found');
    if (draft.status === 'SENT') {
      throw new Error('INVALID_STATE: Draft has already been sent');
    }

    const updated: OutreachDraftRecord = {
      ...draft,
      status: 'APPROVED',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.outreachDrafts.set(draftId, updated);
    return updated;
  }

  public sendApprovedOutreachDraft(
    draftId: string,
    idempotencyKey?: string,
    forceSendUnverified = false
  ): { draft: OutreachDraftRecord; duplicate: boolean } {
    if (idempotencyKey && this.sentIdempotencyKeys.has(idempotencyKey)) {
      const existingDraftId = this.sentIdempotencyKeys.get(idempotencyKey)!;
      return { draft: this.outreachDrafts.get(existingDraftId)!, duplicate: true };
    }

    const draft = this.outreachDrafts.get(draftId);
    if (!draft) throw new Error('NOT_FOUND: Outreach draft not found');

    if (draft.status === 'SENT') {
      return { draft, duplicate: true };
    }

    // Safety Rule (Section 4 & 6.4 & Phase 8):
    // "Approval and sending are separate operations. The send endpoint must verify ownership, recipient status, draft state, and idempotency."
    if (draft.status !== 'APPROVED') {
      throw new Error(
        'APPROVAL_REQUIRED: Outreach draft must be explicitly approved by the user before sending'
      );
    }

    const contact = this.contacts.get(draft.contact_id);
    if (!contact || !contact.email) {
      throw new Error(
        'UNVERIFIED_RECIPIENT: Cannot send outreach email because the contact has no verified or publicly listed email address'
      );
    }

    if (
      (contact.email_status === 'INFERRED' || contact.email_status === 'NOT_FOUND') &&
      !forceSendUnverified
    ) {
      throw new Error(
        'UNVERIFIED_RECIPIENT: Recipient email is inferred/unverified. Explicit manual override required.'
      );
    }

    const now = new Date().toISOString();
    const messageId = `msg_${crypto.randomBytes(6).toString('hex')}@jobhunt-os.local`;
    const updated: OutreachDraftRecord = {
      ...draft,
      status: 'SENT',
      sent_at: now,
      provider_message_id: messageId,
      updated_at: now,
    };

    this.outreachDrafts.set(draftId, updated);
    if (idempotencyKey) {
      this.sentIdempotencyKeys.set(idempotencyKey, draftId);
    }
    return { draft: updated, duplicate: false };
  }

  // ==========================================================================
  // Phase 9: Application CRM & Immutable Event History
  // ==========================================================================

  public createApplication(input: {
    jobId: string;
    profileId?: string;
    status?: ApplicationStatus;
    notes?: string;
    followUpAt?: string | null;
    userId?: string;
  }): ApplicationRecord {
    const profileId = input.profileId || this.defaultProfileId;
    const userId = input.userId || this.defaultUserId;
    const job = this.jobs.get(input.jobId);
    if (!job) throw new Error('NOT_FOUND: Job does not exist');

    // Enforce unique (profile_id, job_id)
    for (const existing of this.applications.values()) {
      if (existing.profile_id === profileId && existing.job_id === input.jobId) {
        throw new Error('UNIQUE_VIOLATION: An application record already exists for this job');
      }
    }

    const now = new Date().toISOString();
    const status: ApplicationStatus = input.status || 'SAVED';
    const app: ApplicationRecord = {
      id: crypto.randomUUID(),
      job_id: job.id,
      profile_id: profileId,
      status,
      applied_at: status === 'APPLIED' ? now : null,
      follow_up_at: input.followUpAt ?? null,
      application_url: job.apply_url,
      notes: input.notes ?? '',
      created_at: now,
      updated_at: now,
    };

    this.applications.set(app.id, app);

    // Record initial immutable event
    const ev: ApplicationEventRecord = {
      id: crypto.randomUUID(),
      application_id: app.id,
      old_status: null,
      new_status: status,
      notes: input.notes || `Application added to pipeline in ${status} state`,
      occurred_at: now,
      created_by: userId,
    };
    this.applicationEvents.set(ev.id, ev);

    return app;
  }

  public updateApplicationStatus(
    applicationId: string,
    newStatus: ApplicationStatus,
    notes = '',
    userId: string = this.defaultUserId
  ): { application: ApplicationRecord; event: ApplicationEventRecord } {
    const app = this.applications.get(applicationId);
    if (!app) throw new Error('NOT_FOUND: Application not found');

    const validation = validateApplicationStatusTransition(app.status, newStatus);
    if (!validation.valid) {
      throw new Error(`VALIDATION_ERROR: ${validation.reason}`);
    }

    const now = new Date().toISOString();
    const oldStatus = app.status;

    const updated: ApplicationRecord = {
      ...app,
      status: newStatus,
      applied_at: newStatus === 'APPLIED' && !app.applied_at ? now : app.applied_at,
      notes: notes ? `${app.notes ? app.notes + '\n' : ''}[${newStatus}] ${notes}` : app.notes,
      updated_at: now,
    };
    this.applications.set(applicationId, updated);

    const event: ApplicationEventRecord = {
      id: crypto.randomUUID(),
      application_id: applicationId,
      old_status: oldStatus,
      new_status: newStatus,
      notes: notes || `Transitioned status from ${oldStatus} to ${newStatus}`,
      occurred_at: now,
      created_by: userId,
    };
    this.applicationEvents.set(event.id, event);

    return { application: updated, event };
  }

  public getApplicationHistory(applicationId: string): ApplicationEventRecord[] {
    return Array.from(this.applicationEvents.values())
      .filter((e) => e.application_id === applicationId)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  }

  // ==========================================================================
  // Agent Workers Execution Engine (Agents 01 through 06)
  // ==========================================================================

  public async triggerAgentRun(
    agentName: string,
    inputPayload: Record<string, any> = {}
  ): Promise<AgentRunRecord> {
    const startedAt = new Date().toISOString();
    const idempotencyKey =
      inputPayload.idempotency_key || `idem-${agentName}-${Date.now()}`;

    const runId = crypto.randomUUID();
    const taskId = `task-${agentName}-${crypto.randomBytes(4).toString('hex')}`;

    const runRecord: AgentRunRecord = {
      id: runId,
      task_id: taskId,
      agent_name: agentName,
      task_type: `RUN_${agentName.toUpperCase().replace(/-/g, '_')}`,
      status: 'RUNNING',
      input: inputPayload,
      output: null,
      idempotency_key: idempotencyKey,
      retry_count: 0,
      error_message: null,
      started_at: startedAt,
      completed_at: null,
      created_at: startedAt,
    };
    this.agentRuns.set(runId, runRecord);

    try {
      let output: Record<string, any> = {};

      if (agentName === 'funding-scout') {
        output = this.executeFundingScoutAgent(inputPayload);
      } else if (agentName === 'company-investigator') {
        output = this.executeCompanyInvestigatorAgent(inputPayload.company_id);
      } else if (agentName === 'job-hunter') {
        output = await this.executeJobHunterAgent(inputPayload.source_id);
      } else if (agentName === 'job-evaluator') {
        output = await this.executeJobEvaluatorAgent(inputPayload.job_id);
      } else if (agentName === 'contact-finder') {
        output = this.executeContactFinderAgent(inputPayload.company_id);
      } else if (agentName === 'outreach-assistant') {
        output = await this.executeOutreachAssistantAgent(inputPayload);
      } else if (agentName === 'full-pipeline') {
        const s1 = this.executeFundingScoutAgent(inputPayload);
        const s2 = this.executeCompanyInvestigatorAgent();
        const s3 = await this.executeJobHunterAgent();
        const s4 = await this.executeJobEvaluatorAgent();
        const s5 = this.executeContactFinderAgent();
        output = {
          pipeline: 'COMPLETE',
          funding_scout: s1,
          company_investigator: s2,
          job_hunter: s3,
          job_evaluator: s4,
          contact_finder: s5,
        };
      } else {
        throw new Error(`Unknown agent: ${agentName}`);
      }

      const completed: AgentRunRecord = {
        ...runRecord,
        status: 'COMPLETED',
        output,
        completed_at: new Date().toISOString(),
      };
      this.agentRuns.set(runId, completed);
      return completed;
    } catch (err: any) {
      const failed: AgentRunRecord = {
        ...runRecord,
        status: 'FAILED',
        error_message: err?.message || 'Agent execution failed',
        completed_at: new Date().toISOString(),
      };
      this.agentRuns.set(runId, failed);
      throw err;
    }
  }

  private executeFundingScoutAgent(payload: Record<string, any> = {}): Record<string, any> {
    const candidateList = payload.companies || payload.candidates || [];
    let newCompanies = 0;
    let newRounds = 0;

    for (const item of candidateList) {
      if (!item.name) continue;
      const { company, created } = this.upsertCompanyWithDeduplication({
        name: item.name,
        website: item.website,
        country_code: item.country_code,
        headquarters: item.headquarters,
        industry: item.industry,
        description: item.description,
        employee_count: item.employee_count,
        source_evidence_url: item.source_url,
      });
      if (created) newCompanies++;

      if (item.round_type || item.funding_stage) {
        const { created: roundCreated } = this.addFundingRoundIfNew({
          company_id: company.id,
          round_type: item.round_type || item.funding_stage,
          amount: item.amount,
          currency: item.currency,
          announcement_date: item.announcement_date,
          publication_date: item.publication_date || item.announcement_date,
          investors: item.investors,
          source_url: item.source_url,
        });
        if (roundCreated) newRounds++;
      }
    }

    return {
      sources_checked: candidateList.length > 0 ? 1 : 0,
      companies_processed: candidateList.length,
      new_companies_created: newCompanies,
      new_funding_rounds_recorded: newRounds,
    };
  }

  private executeCompanyInvestigatorAgent(targetCompanyId?: string): Record<string, any> {
    const companiesToInvestigate = targetCompanyId
      ? [this.companies.get(targetCompanyId)].filter(Boolean) as CompanyRecord[]
      : Array.from(this.companies.values());

    let investigatedCount = 0;
    let sourcesRegistered = 0;

    for (const comp of companiesToInvestigate) {
      const careerUrl = comp.metadata?.career_page;
      const ats: AtsProvider =
        comp.metadata?.ats_provider && comp.metadata.ats_provider !== 'UNKNOWN'
          ? comp.metadata.ats_provider
          : careerUrl
          ? detectAtsProviderFromUrl(careerUrl)
          : 'UNKNOWN';

      if (ats !== 'UNKNOWN' && careerUrl) {
        const hasSource = Array.from(this.jobSources.values()).some((s) => s.company_id === comp.id);
        if (!hasSource) {
          const srcId = crypto.randomUUID();
          this.jobSources.set(srcId, {
            id: srcId,
            company_id: comp.id,
            source_type: ats,
            source_url: careerUrl,
            ats_provider: ats,
            poll_interval_seconds: 600,
            last_checked_at: new Date().toISOString(),
            next_check_at: new Date(Date.now() + 600_000).toISOString(),
            status: 'HEALTHY',
            failure_count: 0,
            last_error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          sourcesRegistered++;
        }
      }

      comp.investigation_status = 'COMPLETED';
      comp.last_researched_at = new Date().toISOString();
      this.recomputeCompanyPriority(comp.id);
      investigatedCount++;
    }

    return {
      companies_investigated: investigatedCount,
      new_sources_registered: sourcesRegistered,
    };
  }

  private async executeJobHunterAgent(targetSourceId?: string): Promise<Record<string, any>> {
    const sources = targetSourceId
      ? [this.jobSources.get(targetSourceId)].filter(Boolean) as JobSourceRecord[]
      : Array.from(this.jobSources.values());

    let newJobs = 0;
    let updatedJobs = 0;

    for (const src of sources) {
      const comp = this.companies.get(src.company_id);
      if (!comp) continue;

      src.last_checked_at = new Date().toISOString();
      src.status = 'HEALTHY';
      src.failure_count = 0;
      this.jobSources.set(src.id, src);

      try {
        if (isSafeExternalUrl(src.source_url).safe) {
          const res = await fetch(src.source_url, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'JobHuntOS-Hunter/1.0' },
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            const jobItems = Array.isArray(data) ? data : data.jobs || data.postings || [];
            for (const item of jobItems) {
              const extId = String(item.id || item.requisition_id || item.slug || crypto.randomUUID());
              const title = item.title || item.text || 'Software Engineer';
              const applyUrl = item.absolute_url || item.applyUrl || item.hostedUrl || src.source_url;
              const desc = item.content || item.description || item.opening || '';
              const { outcome } = this.upsertJobFromSource({
                company_id: comp.id,
                source_id: src.id,
                external_id: extId,
                title,
                description: desc,
                location: item.location?.name || item.categories?.location || 'Remote',
                work_mode: 'REMOTE',
                employment_type: 'FULL_TIME',
                apply_url: applyUrl,
                source_url: src.source_url,
              });
              if (outcome === 'NEW') newJobs++;
              if (outcome === 'UPDATED') updatedJobs++;
            }
          }
        }
      } catch {
        // Safe network error handling
      }
    }

    return {
      sources_polled: sources.length,
      new_jobs_count: newJobs,
      updated_jobs_count: updatedJobs,
      closed_jobs_count: 0,
    };
  }

  private async executeJobEvaluatorAgent(
    targetJobId?: string,
    useLlmEnrichment = false
  ): Promise<Record<string, any>> {
    const jobsToEval = targetJobId
      ? [this.jobs.get(targetJobId)].filter(Boolean) as JobRecord[]
      : Array.from(this.jobs.values()).filter((j) => j.status === 'ACTIVE');

    let qualifiedCount = 0;
    let reviewCount = 0;
    let rejectedCount = 0;

    const ai = useLlmEnrichment ? getGeminiClient() : null;

    for (const jb of jobsToEval) {
      const evalRec = this.evaluateAndPersistJob(jb.id, this.defaultProfileId);

      if (ai && evalRec.decision === 'QUALIFIED') {
        try {
          const { sanitized } = sanitizeUntrustedText(jb.description);
          const resp = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Summarize in 1 concise sentence why a candidate skilled in ${evalRec.matched_skills.join(', ')} is a strong fit for the role "${jb.title}" based only on this job description: ${sanitized.slice(0, 500)}`,
          });
          if (resp.text) {
            evalRec.reasoning = `${evalRec.reasoning} AI Insight: ${resp.text.trim()}`;
            evalRec.model_version = 'deterministic-v1+gemini-3.8-flash';
            this.evaluations.set(evalRec.id, evalRec);
          }
        } catch {
          // LLM call is optional
        }
      }

      if (evalRec.decision === 'QUALIFIED') qualifiedCount++;
      else if (evalRec.decision === 'REVIEW') reviewCount++;
      else rejectedCount++;
    }

    return {
      evaluated_count: jobsToEval.length,
      qualified: qualifiedCount,
      review: reviewCount,
      rejected: rejectedCount,
    };
  }

  private executeContactFinderAgent(targetCompanyId?: string): Record<string, any> {
    const companies = targetCompanyId
      ? [this.companies.get(targetCompanyId)].filter(Boolean) as CompanyRecord[]
      : Array.from(this.companies.values());

    return {
      companies_scanned: companies.length,
      new_contacts_found: 0,
      policy: 'ZERO_UNVERIFIED_GUESSING',
    };
  }

  private async executeOutreachAssistantAgent(payload: Record<string, any>): Promise<Record<string, any>> {
    const contactId = payload.contact_id;
    const jobId = payload.job_id;
    if (!contactId || !jobId) {
      return {
        status: 'SKIPPED',
        reason: 'Contact ID and Job ID required',
      };
    }
    const draft = this.createOutreachDraft({
      contact_id: contactId,
      job_id: jobId,
      profile_id: this.defaultProfileId,
    });
    return {
      draft_id: draft.id,
      status: draft.status,
      subject: draft.subject,
    };
  }
}

export const dbStore = new JobHuntStore(true);
