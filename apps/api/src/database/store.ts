import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import {
  UserRecord,
  CandidateProfileRecord,
  CandidateSkillRecord,
  ResumeWorkExperienceRecord,
  ResumeEducationRecord,
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
  getCompanyCareerPage,
} from '../services/coreEngine.ts';
import { fetchLiveJobsFromAts } from '../services/atsLiveAdapter.ts';
import {
  buildMailClientLinks,
  dispatchApprovedEmail,
  dispatchTelegramNotification,
} from '../services/mailer.ts';

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

  constructor(_seedOnInit = false) {
    this.ensureBootstrapData();
  }

  private ensureBootstrapData(): void {
    const now = new Date().toISOString();
    if (!this.users.has(this.defaultUserId)) {
      this.users.set(this.defaultUserId, {
        id: this.defaultUserId,
        email: '',
        timezone: 'UTC',
        created_at: now,
        updated_at: now,
      });
    }
    if (!this.profiles.has(this.defaultProfileId)) {
      this.profiles.set(this.defaultProfileId, {
        id: this.defaultProfileId,
        user_id: this.defaultUserId,
        full_name: '',
        headline: '',
        summary: '',
        experience_years: 0,
        resume_url: null,
        resume_text: '',
        preferences: {
          target_roles: [],
          geographies: [],
          remote_only: false,
          minimum_salary: 0,
          salary_currency: 'USD',
          maximum_experience: 99,
          telegram_alerts_enabled: false,
          telegram_chat_id: '',
        },
        profile_version: 1,
        created_at: now,
        updated_at: now,
      });
    }
  }

  public seedInitialData(): void {
    // No mock/seed data. Bootstrap only.
    this.ensureBootstrapData();
  }
 // ==========================================================================
  // Phase 1: Candidate Profile & Skills CRUD
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
    updates: Partial<Pick<CandidateProfileRecord, 'full_name' | 'headline' | 'summary' | 'experience_years' | 'resume_url' | 'resume_text' | 'preferences' | 'work_experience' | 'education'>>,
    options: { forceBumpVersion?: boolean } = {}
  ): CandidateProfileRecord {
    const existing = this.getProfile(userId);

    const mergedPreferences = updates.preferences
      ? { ...existing.preferences, ...updates.preferences }
      : existing.preferences;

    let hasChanges = Boolean(options.forceBumpVersion);
    if (!hasChanges) {
      if (updates.full_name !== undefined && updates.full_name !== existing.full_name) hasChanges = true;
      if (updates.headline !== undefined && updates.headline !== existing.headline) hasChanges = true;
      if (updates.summary !== undefined && updates.summary !== existing.summary) hasChanges = true;
      if (updates.experience_years !== undefined && updates.experience_years !== existing.experience_years) hasChanges = true;
      if (updates.resume_url !== undefined && updates.resume_url !== existing.resume_url) hasChanges = true;
      if (updates.resume_text !== undefined && updates.resume_text !== existing.resume_text) hasChanges = true;
      if (updates.work_experience !== undefined && JSON.stringify(updates.work_experience) !== JSON.stringify(existing.work_experience)) hasChanges = true;
      if (updates.education !== undefined && JSON.stringify(updates.education) !== JSON.stringify(existing.education)) hasChanges = true;
      if (updates.preferences !== undefined && JSON.stringify(mergedPreferences) !== JSON.stringify(existing.preferences)) hasChanges = true;
    }

    if (!hasChanges) {
      return existing;
    }

    const updated: CandidateProfileRecord = {
      ...existing,
      ...updates,
      preferences: mergedPreferences,
      profile_version: existing.profile_version + 1,
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(updated.id, updated);
    return updated;
  }

  public bumpProfileVersion(profileId: string = this.defaultProfileId): CandidateProfileRecord {
    const profile = this.profiles.get(profileId) || this.getProfile(this.defaultUserId);
    const updated: CandidateProfileRecord = {
      ...profile,
      profile_version: profile.profile_version + 1,
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
  // Resume Import: apply reviewed parser output to the candidate profile.
  // Single profile_version increment, then one re-evaluation sweep.
  // ==========================================================================

  public applyResumeProfile(payload: {
    full_name?: string;
    headline?: string;
    summary?: string;
    experience_years?: number;
    resume_text?: string;
    work_experience?: ResumeWorkExperienceRecord[];
    education?: ResumeEducationRecord[];
    skills?: Array<{
      skill_name: string;
      proficiency?: CandidateSkillRecord['proficiency'];
      years_experience?: number;
    }>;
  }): {
    profile: CandidateProfileRecord;
    skills: CandidateSkillRecord[];
    skills_added: number;
    skills_skipped: number;
  } {
    const existing = this.getProfile(this.defaultUserId);

    const updated = this.updateProfile(this.defaultUserId, {
      ...(payload.full_name !== undefined && String(payload.full_name).trim()
        ? { full_name: String(payload.full_name).trim() }
        : {}),
      ...(payload.headline !== undefined ? { headline: String(payload.headline).trim() } : {}),
      ...(payload.summary !== undefined ? { summary: String(payload.summary) } : {}),
      ...(payload.experience_years !== undefined
        ? { experience_years: Math.max(0, Number(payload.experience_years) || 0) }
        : {}),
      ...(payload.resume_text !== undefined ? { resume_text: String(payload.resume_text) } : {}),
      ...(payload.work_experience !== undefined ? { work_experience: payload.work_experience } : {}),
      ...(payload.education !== undefined ? { education: payload.education } : {}),
    });
    void existing;

    let skillsAdded = 0;
    let skillsSkipped = 0;
    for (const skill of payload.skills || []) {
      try {
        this.addCandidateSkill(
          updated.id,
          String(skill.skill_name),
          skill.proficiency || 'INTERMEDIATE',
          skill.years_experience !== undefined ? Number(skill.years_experience) : 1.0
        );
        skillsAdded++;
      } catch (err: any) {
        if (String(err?.message || '').includes('UNIQUE_VIOLATION')) {
          skillsSkipped++;
          continue;
        }
        throw err;
      }
    }

    // One re-evaluation sweep after all skills are imported
    for (const job of this.jobs.values()) {
      if (job.status === 'ACTIVE') {
        this.evaluateAndPersistJob(job.id, updated.id);
      }
    }

    return {
      profile: updated,
      skills: this.getSkills(updated.id),
      skills_added: skillsAdded,
      skills_skipped: skillsSkipped,
    };
  }

  // ==========================================================================
  // Phase 2 & 3: Company Deduplication, Funding Rounds & Priority Scoring
  // ==========================================================================

  public upsertCompanyWithDeduplication(input: {
    name: string;
    website?: string | null;
    career_page?: string | null;
    ats_provider?: AtsProvider;
    ats_api_url?: string | null;
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

    for (const existing of this.companies.values()) {
      if (domain && existing.domain && existing.domain === domain) {
        const updated: CompanyRecord = {
          ...existing,
          website: input.website || existing.website,
          country_code: input.country_code || existing.country_code,
          headquarters: input.headquarters || existing.headquarters,
          industry: input.industry || existing.industry,
          description: input.description || existing.description,
          employee_count: input.employee_count ?? existing.employee_count,
          metadata: {
            ...existing.metadata,
            ...(input.career_page ? { career_page: input.career_page } : {}),
            ...(input.ats_provider ? { ats_provider: input.ats_provider } : {}),
          },
          updated_at: new Date().toISOString(),
        };
        this.companies.set(updated.id, updated);
        return { company: updated, created: false };
      }

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
    const detectedAts =
      input.ats_provider ||
      detectAtsProviderFromUrl(input.ats_api_url || input.career_page || input.website);
    const defaultCareerPage = input.career_page || getCompanyCareerPage(input);

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
      employee_count: input.employee_count ?? null,
      investigation_status: input.career_page ? 'COMPLETED' : 'PENDING',
      hiring_priority: 50,
      last_researched_at: input.career_page ? now : null,
      metadata: {
        career_page: defaultCareerPage,
        ats_provider: detectedAts,
        verified_identity: Boolean(domain),
        source_evidence_url: input.source_evidence_url || input.website || undefined,
      },
      created_at: now,
      updated_at: now,
    };

    this.companies.set(created.id, created);

    if (input.ats_api_url) {
      const srcId = crypto.randomUUID();
      this.jobSources.set(srcId, {
        id: srcId,
        company_id: created.id,
        source_type: detectedAts,
        source_url: input.ats_api_url,
        ats_provider: detectedAts,
        poll_interval_seconds: 600,
        last_checked_at: null,
        next_check_at: now,
        status: 'HEALTHY',
        failure_count: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      });
    }

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
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      announcement_date: input.announcement_date ?? null,
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

  public getFundingRoundsForCompany(companyId: string): FundingRoundRecord[] {
    return Array.from(this.fundingRounds.values())
      .filter((r) => r.company_id === companyId)
      .sort((a, b) => {
        const timeA = new Date(a.publication_date || a.announcement_date || 0).getTime();
        const timeB = new Date(b.publication_date || b.announcement_date || 0).getTime();
        return timeB - timeA;
      });
  }

  public recomputeCompanyPriority(companyId: string): CompanyRecord | null {
    const company = this.companies.get(companyId);
    if (!company) return null;

    const rounds = this.getFundingRoundsForCompany(companyId);
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

  private normalizeJobKeyUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url.trim());
      parsed.hash = '';
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gh_jid', 'lever-origin'];
      for (const p of trackingParams) parsed.searchParams.delete(p);
      const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.hostname.toLowerCase()}${pathname}${parsed.search ? `?${parsed.searchParams.toString()}` : ''}`;
    } catch {
      return url.trim().toLowerCase().replace(/\/+$/, '');
    }
  }

  private isLikelySameJobPosting(existing: JobRecord, input: { title: string; apply_url?: string | null; description_hash: string }): boolean {
    const normalizedInputTitle = input.title.toLowerCase().trim();
    const applyA = this.normalizeJobKeyUrl(existing.apply_url);
    const applyB = this.normalizeJobKeyUrl(input.apply_url ?? null);
    if (applyA && applyB && applyA === applyB) return true;

    // Fallback dedupe for seeded/manual jobs vs live ATS jobs where external IDs differ
    if (existing.normalized_title === normalizedInputTitle) {
      if (!applyA || !applyB) return true;
      if (existing.description_hash === input.description_hash) return true;
    }
    return false;
  }

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

    for (const existing of this.jobs.values()) {
      const sameSourceExternalId =
        existing.source_id === input.source_id && existing.external_id === input.external_id;

      if (sameSourceExternalId) {
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

    // Cross-source/cross-id dedupe: prevent duplicate postings for the same company
    // (e.g. seeded jobs vs live ATS jobs with different external IDs, or reposted links).
    for (const existing of this.jobs.values()) {
      if (existing.company_id !== input.company_id) continue;
      if (!this.isLikelySameJobPosting(existing, { title: input.title, apply_url: input.apply_url, description_hash: descHash })) {
        continue;
      }

      const incomingExternalId = input.external_id?.trim();
      const changed =
        existing.description_hash !== descHash ||
        existing.title !== input.title.trim() ||
        (!existing.external_id && Boolean(incomingExternalId)) ||
        (Boolean(input.apply_url) && !existing.apply_url);

      const updated: JobRecord = {
        ...existing,
        // Prefer keeping a stable record but enrich missing identifiers/fields.
        external_id: existing.external_id || incomingExternalId || existing.external_id,
        title: input.title.trim() || existing.title,
        normalized_title: (input.title || existing.title).toLowerCase().trim(),
        description: input.description || existing.description,
        description_hash: descHash || existing.description_hash,
        location: input.location !== undefined ? input.location : existing.location,
        country_code: input.country_code !== undefined ? input.country_code : existing.country_code,
        work_mode: input.work_mode && input.work_mode !== 'UNKNOWN' ? input.work_mode : existing.work_mode,
        employment_type: input.employment_type && input.employment_type !== 'UNKNOWN' ? input.employment_type : existing.employment_type,
        salary_min: input.salary_min !== undefined ? input.salary_min : existing.salary_min,
        salary_max: input.salary_max !== undefined ? input.salary_max : existing.salary_max,
        salary_currency: input.salary_currency !== undefined ? input.salary_currency : existing.salary_currency,
        experience_min: input.experience_min !== undefined ? input.experience_min : existing.experience_min,
        experience_max: input.experience_max !== undefined ? input.experience_max : existing.experience_max,
        posted_at: input.posted_at ?? existing.posted_at,
        apply_url: input.apply_url ?? existing.apply_url,
        source_url: input.source_url ?? existing.source_url,
        last_seen_at: now,
        last_verified_open_at: now,
        raw_data: { ...(existing.raw_data || {}), ...(input.raw_data || {}), deduped_from_external_id: incomingExternalId || null },
        updated_at: changed ? now : existing.updated_at,
      };
      this.jobs.set(updated.id, updated);
      return { job: updated, outcome: changed ? 'UPDATED' : 'UNCHANGED' };
    }

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
      work_mode: input.work_mode ?? 'UNKNOWN',
      employment_type: input.employment_type ?? 'FULL_TIME',
      salary_min: input.salary_min ?? null,
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

    if (record.decision === 'QUALIFIED') {
      const company = this.companies.get(job.company_id);
      const notifTitle = `Qualified Match (${record.score}/100): ${job.title} at ${company?.name || 'Company'}`;
      const notifMsg = `${record.reasoning} Work mode: ${job.work_mode}. Apply: ${job.apply_url || company?.metadata?.career_page || ''}`;
      const { created } = this.createIdempotentNotification({
        user_id: profile.user_id,
        type: 'QUALIFIED_JOB',
        title: notifTitle,
        message: notifMsg,
        reference_type: 'JOB',
        reference_id: job.id,
        delivery_channel: profile.preferences.telegram_alerts_enabled ? 'TELEGRAM' : 'IN_APP',
      });
      if (created && process.env.NODE_ENV !== 'test') {
        dispatchTelegramNotification(notifTitle, notifMsg).catch(() => {});
      }
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
    const rounds = this.getFundingRoundsForCompany(job.company_id);
    const latestRound = rounds[0];
    const skills = this.getSkills(profileId).slice(0, 4).map((s) => s.skill_name);

    const fundingMention = latestRound
      ? `Congratulations to the ${company?.name} team on your ${latestRound.round_type.replace('_', ' ')} milestone.`
      : `I have been following ${company?.name}'s engineering work in ${company?.industry || 'technology'}.`;

    const generatedSubject =
      input.subject || `Interest in ${job.title} at ${company?.name || 'your team'} — ${profile.full_name}`;

    const generatedBody =
      input.body ||
      `Hi ${contact.name.split(' ')[0]},\n\n${fundingMention}\n\nI recently came across the ${job.title} opening on your careers page (${company?.metadata?.career_page || job.apply_url}). With ${profile.experience_years} years of hands-on experience building production systems using ${skills.join(', ')}, my background aligns closely with your requirements.\n\n${profile.resume_text}\n\nI would love to share my resume and learn more about your engineering roadmap.\n\nBest regards,\n${profile.full_name}`;

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
                detail: `${latestRound.round_type} round from ${latestRound.source_name}`,
                source: latestRound.source_url,
              },
            ]
          : []),
        {
          fact_type: 'JOB_REQUIREMENT',
          detail: `Role: ${job.title} (${job.work_mode})`,
          source: job.apply_url || company?.metadata?.career_page || 'Job Listing',
        },
      ],
      status: 'PENDING_APPROVAL',
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
  ): {
    draft: OutreachDraftRecord;
    duplicate: boolean;
    mailto_url?: string;
    gmail_compose_url?: string;
    delivery_note?: string;
  } {
    if (idempotencyKey && this.sentIdempotencyKeys.has(idempotencyKey)) {
      const existingDraftId = this.sentIdempotencyKeys.get(idempotencyKey)!;
      const existingDraft = this.outreachDrafts.get(existingDraftId)!;
      const ct = this.contacts.get(existingDraft.contact_id);
      const links = ct?.email
        ? buildMailClientLinks(ct.email, existingDraft.subject, existingDraft.body)
        : { mailto_url: '', gmail_compose_url: '' };
      return {
        draft: existingDraft,
        duplicate: true,
        ...links,
      };
    }

    const draft = this.outreachDrafts.get(draftId);
    if (!draft) throw new Error('NOT_FOUND: Outreach draft not found');

    const contact = this.contacts.get(draft.contact_id);
    const links = contact?.email
      ? buildMailClientLinks(contact.email, draft.subject, draft.body)
      : { mailto_url: '', gmail_compose_url: '' };

    if (draft.status === 'SENT') {
      return { draft, duplicate: true, ...links };
    }

    if (draft.status !== 'APPROVED') {
      throw new Error(
        'APPROVAL_REQUIRED: Outreach draft must be explicitly approved by the user before sending'
      );
    }

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
    const messageId = `msg_${crypto.randomBytes(6).toString('hex')}@jobhunt-os.outbox`;
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

    // Background dispatch: trigger real provider dispatch asynchronously if configured
    if (process.env.NODE_ENV !== 'test') {
      void dispatchApprovedEmail({
        to: contact.email,
        subject: draft.subject,
        body: draft.body,
        idempotencyKey,
      })
        .then((res) => {
          updated.provider_message_id = res.provider_message_id;
          this.outreachDrafts.set(draftId, updated);
        })
        .catch((err) => {
          console.error('[Outreach Mailer Error]:', err.message);
        });
    }

    return {
      draft: updated,
      duplicate: false,
      ...links,
      delivery_note:
        process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY
          ? 'Dispatched via configured live email API provider.'
          : 'Recorded in CRM Outbox. You can also click "Open in Gmail" or "Open Mail App" to send directly from your email client.',
    };
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
  // Agent Workers Execution Engine (Agents 01 through 06 + Live ATS Polling)
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
        output = await this.executeJobHunterAgent(inputPayload.source_id, Boolean(inputPayload.live_network));
      } else if (agentName === 'job-evaluator') {
        output = await this.executeJobEvaluatorAgent(inputPayload.job_id);
      } else if (agentName === 'contact-finder') {
        output = this.executeContactFinderAgent(inputPayload.company_id);
      } else if (agentName === 'outreach-assistant') {
        output = await this.executeOutreachAssistantAgent(inputPayload);
      } else if (agentName === 'full-pipeline') {
        const s1 = this.executeFundingScoutAgent(inputPayload);
        const s2 = this.executeCompanyInvestigatorAgent();
        const s3 = await this.executeJobHunterAgent(undefined, Boolean(inputPayload.live_network));
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
    const inputCompanies = Array.isArray(payload.companies) ? payload.companies : [];
    const discoveredCatalog = inputCompanies
      .filter((item: any) => item && typeof item.name === 'string' && item.name.trim())
      .map((item: any) => ({
        name: String(item.name),
        website: item.website ?? null,
        career_page: item.career_page ?? null,
        ats_provider: (item.ats_provider as AtsProvider | undefined) ?? 'UNKNOWN',
        ats_api_url: item.ats_api_url ?? null,
        country_code: item.country_code ?? null,
        headquarters: item.headquarters ?? null,
        industry: item.industry ?? null,
        description: item.description ?? null,
        employee_count: typeof item.employee_count === 'number' ? item.employee_count : null,
        round_type: normalizeFundingStage(item.round_type || item.stage || 'UNKNOWN'),
        amount: typeof item.amount === 'number' ? item.amount : null,
        currency: item.currency ?? null,
        announcement_date: item.announcement_date ?? null,
        publication_date: item.publication_date ?? null,
        investors: Array.isArray(item.investors) ? item.investors : [],
        source_url: item.source_url ?? item.website ?? null,
      }));

    let newCompanies = 0;
    let newRounds = 0;

    for (const item of discoveredCatalog) {
      const { company, created } = this.upsertCompanyWithDeduplication({
        name: item.name,
        website: item.website,
        career_page: item.career_page || undefined,
        ats_provider: item.ats_provider,
        ats_api_url: item.ats_api_url,
        country_code: item.country_code,
        headquarters: item.headquarters,
        industry: item.industry,
        description: item.description,
        employee_count: item.employee_count,
        source_evidence_url: item.source_url || undefined,
      });
      if (created) newCompanies++;

      if (item.source_url || item.round_type !== 'UNKNOWN') {
        const { created: roundCreated } = this.addFundingRoundIfNew({
          company_id: company.id,
          round_type: item.round_type,
          amount: item.amount,
          currency: item.currency,
          announcement_date: item.announcement_date,
          publication_date: item.publication_date,
          investors: item.investors,
          source_url: item.source_url || company.website || company.metadata?.career_page || 'manual-input',
        });
        if (roundCreated) newRounds++;
      }
    }

    return {
      sources_checked: 0,
      companies_processed: discoveredCatalog.length,
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
      const slug = comp.normalized_name || 'company';
      const ats: AtsProvider =
        comp.metadata?.ats_provider && comp.metadata.ats_provider !== 'UNKNOWN'
          ? comp.metadata.ats_provider
          : 'GREENHOUSE';

      const careerUrl =
        getCompanyCareerPage(comp) || `https://boards.greenhouse.io/${slug}`;

      comp.investigation_status = 'COMPLETED';
      comp.last_researched_at = new Date().toISOString();
      comp.metadata = {
        ...comp.metadata,
        career_page: careerUrl,
        ats_provider: ats,
        verified_identity: true,
      };
      this.companies.set(comp.id, comp);

      const hasSource = Array.from(this.jobSources.values()).some((s) => s.company_id === comp.id);
      if (!hasSource) {
        const srcId = crypto.randomUUID();
        this.jobSources.set(srcId, {
          id: srcId,
          company_id: comp.id,
          source_type: ats,
          source_url:
            ats === 'GREENHOUSE'
              ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`
              : `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
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

      const hasSignal = Array.from(this.companySignals.values()).some(
        (sig) => sig.company_id === comp.id && sig.signal_type === 'ACTIVE_CAREER_PAGE'
      );
      if (!hasSignal) {
        const sigId = crypto.randomUUID();
        this.companySignals.set(sigId, {
          id: sigId,
          company_id: comp.id,
          signal_type: 'ACTIVE_CAREER_PAGE',
          signal_value: { ats, career_url: careerUrl },
          confidence: 0.95,
          source_url: careerUrl,
          observed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
      }

      this.recomputeCompanyPriority(comp.id);
      investigatedCount++;
    }

    return {
      companies_investigated: investigatedCount,
      new_sources_registered: sourcesRegistered,
    };
  }

  private async executeJobHunterAgent(
    targetSourceId?: string,
    useLiveNetwork = false
  ): Promise<Record<string, any>> {
    const sources = targetSourceId
      ? [this.jobSources.get(targetSourceId)].filter(Boolean) as JobSourceRecord[]
      : Array.from(this.jobSources.values());

    let newJobs = 0;
    let updatedJobs = 0;
    let liveFetchedCount = 0;

    for (const src of sources) {
      const comp = this.companies.get(src.company_id);
      if (!comp) continue;

      src.last_checked_at = new Date().toISOString();
      src.status = 'HEALTHY';
      src.failure_count = 0;
      this.jobSources.set(src.id, src);

      // Live polling only (no mock/fallback job injection)
      if (useLiveNetwork) {
        const liveResult = await fetchLiveJobsFromAts(src.ats_provider, src.source_url, 4);
        if (liveResult.live && liveResult.jobs.length > 0) {
          for (const lj of liveResult.jobs) {
            const { job, outcome } = this.upsertJobFromSource({
              company_id: comp.id,
              source_id: src.id,
              ...lj,
            });
            this.evaluateAndPersistJob(job.id, this.defaultProfileId);
            if (outcome === 'NEW') {
              newJobs++;
              liveFetchedCount++;
            } else if (outcome === 'UPDATED') {
              updatedJobs++;
            }
          }
        }
      }
    }

    return {
      sources_polled: sources.length,
      new_jobs_count: newJobs,
      updated_jobs_count: updatedJobs,
      live_network_jobs_fetched: liveFetchedCount,
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
          // Deterministic reasoning already saved
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

    let discoveredCount = 0;

    for (const comp of companies) {
      const existingForCompany = Array.from(this.contacts.values()).filter(
        (c) => c.company_id === comp.id
      );
      if (existingForCompany.length > 0) continue;

      const domain = comp.domain || 'company.com';
      const careerUrl = getCompanyCareerPage(comp) || `https://${domain}/careers`;
      const newContact: ContactRecord = {
        id: crypto.randomUUID(),
        company_id: comp.id,
        name: `${comp.name} Technical Recruiting`,
        designation: 'Technical Talent Acquisition',
        email: `careers@${domain}`,
        email_status: 'NOT_FOUND',
        email_source_url: careerUrl,
        linkedin_url: `https://www.linkedin.com/company/${comp.normalized_name}`,
        other_profile_url: null,
        metadata: {
          priority_rank: 1,
          role_category: 'Technical Recruiter',
          provenance_note: 'Synthesized generic contact — verify manually',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.contacts.set(newContact.id, newContact);
      discoveredCount++;
    }

    return {
      companies_scanned: companies.length,
      new_contacts_found: discoveredCount,
    };
  }

  private async executeOutreachAssistantAgent(payload: Record<string, any>): Promise<Record<string, any>> {
    const contactId = payload.contact_id || Array.from(this.contacts.keys())[0];
    const jobId = payload.job_id || Array.from(this.jobs.keys())[0];
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
