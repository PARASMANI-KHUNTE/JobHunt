import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { dbStore } from '../database/store.ts';
import { isSafeExternalUrl, getCompanyCareerPage, getCareerPageUrl } from '../services/coreEngine.ts';
import { buildMailClientLinks } from '../services/mailer.ts';
import { probeLiveCompanyAts } from '../services/atsLiveAdapter.ts';
import { ApplicationStatus, AtsProvider } from '../../../../packages/contracts/src/index.ts';

export const v1Router = Router();

// Helper for standard API error responses (Section 6.7)
function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown[] = []
) {
  return res.status(status).json({
    error: {
      code,
      message,
      details,
    },
  });
}

// ============================================================================
// 6.1 Authentication and Candidate Profile
// NOTE: These auth endpoints are development-only stubs with no real credential
// verification. In production, integrate an identity provider (e.g. NextAuth,
// Auth0, Supabase Auth, or password hashing with bcrypt/argon2 + signed JWTs).
// TODO: Implement full user registration, password verification, and JWT signing.
// ============================================================================

v1Router.post('/auth/login', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const profile = dbStore.getProfile();
  const sessionToken = `session_${crypto.randomBytes(24).toString('hex')}`;
  res.json({
    data: {
      user: {
        id: dbStore.defaultUserId,
        email,
        timezone: profile?.preferences ? 'UTC' : 'UTC',
      },
      profile,
      token: sessionToken,
    },
  });
});

v1Router.post('/auth/register', (req: Request, res: Response) => {
  // TODO: Persist registered user into database store with hashed password
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const sessionToken = `session_${crypto.randomBytes(24).toString('hex')}`;
  res.status(201).json({
    data: {
      id: dbStore.defaultUserId,
      email,
      timezone: 'UTC',
      token: sessionToken,
    },
  });
});

v1Router.post('/auth/logout', (_req: Request, res: Response) => {
  res.json({ data: { logged_out: true } });
});

v1Router.get('/profile', (_req: Request, res: Response) => {
  try {
    const profile = dbStore.getProfile();
    const skills = dbStore.getSkills(profile.id);
    res.json({ data: { ...profile, skills } });
  } catch (err: any) {
    sendError(res, 404, 'NOT_FOUND', err.message);
  }
});

v1Router.put('/profile', (req: Request, res: Response) => {
  try {
    const {
      full_name,
      headline,
      summary,
      experience_years,
      resume_url,
      resume_text,
      preferences,
      work_experience,
      education,
    } = req.body || {};

    if (full_name !== undefined && (!full_name || String(full_name).trim().length === 0)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Candidate full_name cannot be empty');
    }

    if (
      experience_years !== undefined &&
      (Number.isNaN(Number(experience_years)) || Number(experience_years) < 0)
    ) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'experience_years must be a non-negative number');
    }

    if (work_experience !== undefined && !Array.isArray(work_experience)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'work_experience must be an array');
    }
    if (education !== undefined && !Array.isArray(education)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'education must be an array');
    }

    const updates: Parameters<typeof dbStore.updateProfile>[1] = {
      ...(full_name !== undefined ? { full_name: String(full_name).trim() } : {}),
      ...(headline !== undefined ? { headline: String(headline).trim() } : {}),
      ...(summary !== undefined ? { summary: String(summary).trim() } : {}),
      ...(experience_years !== undefined ? { experience_years: Number(experience_years) } : {}),
      ...(resume_url !== undefined ? { resume_url } : {}),
      ...(resume_text !== undefined ? { resume_text: String(resume_text) } : {}),
      ...(preferences !== undefined ? { preferences } : {}),
      ...(work_experience !== undefined ? { work_experience } : {}),
      ...(education !== undefined ? { education } : {}),
    };

    // No recognized fields -> do not bump profile_version or re-evaluate.
    if (Object.keys(updates).length === 0) {
      const current = dbStore.getProfile(dbStore.defaultUserId);
      return res.json({ data: { ...current, skills: dbStore.getSkills(current.id) } });
    }

    const updated = dbStore.updateProfile(dbStore.defaultUserId, updates);

    // Re-evaluate active jobs when profile version increments (Section 4 Validation rule)
    for (const job of dbStore.jobs.values()) {
      if (job.status === 'ACTIVE') {
        dbStore.evaluateAndPersistJob(job.id, updated.id);
      }
    }

    const skills = dbStore.getSkills(updated.id);
    res.json({ data: { ...updated, skills } });
  } catch (err: any) {
    sendError(res, 400, 'VALIDATION_ERROR', err.message);
  }
});

v1Router.post('/profile/resume', (req: Request, res: Response) => {
  const { resume_url, resume_text } = req.body || {};
  if (!resume_text && !resume_url) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Provide resume_text or resume_url');
  }
  const updated = dbStore.updateProfile(dbStore.defaultUserId, {
    ...(resume_url ? { resume_url } : {}),
    ...(resume_text ? { resume_text } : {}),
  });
  res.status(201).json({ data: updated });
});

// ============================================================================
// Resume Import: deterministic parse + reviewed apply
// ============================================================================

const MAX_RESUME_TEXT_CHARS = 80_000;
const MAX_RESUME_BASE64_CHARS = 10_000_000; // ~7.5MB raw PDF

v1Router.post('/profile/resume/parse', async (req: Request, res: Response) => {
  try {
    const { text, filename, content_base64 } = req.body || {};
    let resumeText = '';

    if (text && typeof text === 'string' && text.trim()) {
      resumeText = String(text);
    } else if (content_base64 && typeof content_base64 === 'string') {
      if (content_base64.length > MAX_RESUME_BASE64_CHARS) {
        return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Resume file exceeds 7.5MB');
      }
      const name = String(filename || '').toLowerCase();
      if (name.endsWith('.pdf') || !name) {
        let buffer: Buffer;
        try {
          buffer = Buffer.from(String(content_base64), 'base64');
        } catch {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid base64 resume payload');
        }
        if (buffer.length < 100) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Resume file is empty or corrupted');
        }
        const { extractPdfText } = await import('../services/pdfExtractor.ts');
        resumeText = await extractPdfText(buffer);
      } else if (name.endsWith('.txt') || name.endsWith('.md')) {
        try {
          resumeText = Buffer.from(String(content_base64), 'base64').toString('utf8');
        } catch {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid base64 resume payload');
        }
      } else {
        return sendError(
          res,
          415,
          'UNSUPPORTED_FORMAT',
          'Unsupported resume format. Use PDF, TXT, or MD — or paste the resume text directly.'
        );
      }
    } else {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Provide resume text or a base64 file payload');
    }

    resumeText = resumeText.slice(0, MAX_RESUME_TEXT_CHARS);
    if (!resumeText.trim()) {
      return sendError(res, 422, 'EMPTY_RESUME', 'No readable text found in the provided resume');
    }

    const { parseResumeText } = await import('../services/resumeParser.ts');
    const parsed = parseResumeText(resumeText);

    res.json({
      data: {
        parsed,
        resume_text: resumeText,
        filename: filename || null,
      },
    });
  } catch (err: any) {
    const message = String(err?.message || 'Resume parsing failed');
    sendError(res, 422, 'RESUME_PARSE_ERROR', message);
  }
});

v1Router.post('/profile/resume/apply', (req: Request, res: Response) => {
  try {
    const {
      full_name,
      headline,
      summary,
      experience_years,
      resume_text,
      work_experience,
      education,
      skills,
    } = req.body || {};

    if (!resume_text || !String(resume_text).trim()) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'resume_text is required to import a resume');
    }
    if (skills !== undefined && !Array.isArray(skills)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'skills must be an array');
    }
    if (experience_years !== undefined && (Number.isNaN(Number(experience_years)) || Number(experience_years) < 0)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'experience_years must be a non-negative number');
    }

    const result = dbStore.applyResumeProfile({
      full_name,
      headline,
      summary,
      experience_years: experience_years !== undefined ? Number(experience_years) : undefined,
      resume_text: String(resume_text).slice(0, MAX_RESUME_TEXT_CHARS),
      work_experience: Array.isArray(work_experience) ? work_experience : undefined,
      education: Array.isArray(education) ? education : undefined,
      skills: Array.isArray(skills)
        ? skills.map((s: any) => ({
            skill_name: String(s?.skill_name || '').trim(),
            proficiency: s?.proficiency,
            years_experience: s?.years_experience,
          }))
        : [],
    });

    res.json({
      data: {
        profile: { ...result.profile, skills: result.skills },
        skills_added: result.skills_added,
        skills_skipped: result.skills_skipped,
      },
      meta: { profile_version: result.profile.profile_version },
    });
  } catch (err: any) {
    sendError(res, 400, 'RESUME_APPLY_ERROR', err.message);
  }
});

v1Router.get('/profile/skills', (_req: Request, res: Response) => {
  const skills = dbStore.getSkills(dbStore.defaultProfileId);
  res.json({ data: skills });
});

v1Router.post('/profile/skills', (req: Request, res: Response) => {
  try {
    const { skill_name, proficiency, years_experience } = req.body || {};
    if (!skill_name || !String(skill_name).trim()) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'skill_name is required');
    }
    const created = dbStore.addCandidateSkill(
      dbStore.defaultProfileId,
      String(skill_name),
      proficiency || 'INTERMEDIATE',
      years_experience !== undefined ? Number(years_experience) : 1.0
    );
    // Increment profile version & re-evaluate jobs
    const profile = dbStore.bumpProfileVersion(dbStore.defaultProfileId);
    for (const job of dbStore.jobs.values()) {
      if (job.status === 'ACTIVE') {
        dbStore.evaluateAndPersistJob(job.id, profile.id);
      }
    }
    res.status(201).json({ data: created });
  } catch (err: any) {
    const status = err.message.includes('UNIQUE_VIOLATION') ? 409 : 400;
    sendError(res, status, 'SKILL_ERROR', err.message);
  }
});

v1Router.delete('/profile/skills/:id', (req: Request, res: Response) => {
  const deleted = dbStore.removeCandidateSkill(dbStore.defaultProfileId, req.params.id);
  if (!deleted) {
    return sendError(res, 404, 'NOT_FOUND', 'Skill not found on profile');
  }
  const profile = dbStore.bumpProfileVersion(dbStore.defaultProfileId);
  for (const job of dbStore.jobs.values()) {
    if (job.status === 'ACTIVE') {
      dbStore.evaluateAndPersistJob(job.id, profile.id);
    }
  }
  res.json({ data: { deleted: true } });
});

v1Router.put('/profile/preferences', (req: Request, res: Response) => {
  try {
    const updated = dbStore.updateProfile(dbStore.defaultUserId, {
      preferences: req.body || {},
    });
    for (const job of dbStore.jobs.values()) {
      if (job.status === 'ACTIVE') {
        dbStore.evaluateAndPersistJob(job.id, updated.id);
      }
    }
    res.json({ data: updated });
  } catch (err: any) {
    sendError(res, 400, 'VALIDATION_ERROR', err.message);
  }
});

// ============================================================================
// 6.2 Companies and Funding
// ============================================================================

v1Router.get('/companies', (req: Request, res: Response) => {
  const search = String(req.query.search || '').toLowerCase().trim();
  const stageFilter = String(req.query.stage || '').toUpperCase().trim();

  let list = Array.from(dbStore.companies.values()).map((c) => {
    const funding = dbStore.getFundingRoundsForCompany(c.id);
    const signals = Array.from(dbStore.companySignals.values()).filter((s) => s.company_id === c.id);
    const openJobsCount = Array.from(dbStore.jobs.values()).filter(
      (j) => j.company_id === c.id && j.status === 'ACTIVE'
    ).length;
    const sources = Array.from(dbStore.jobSources.values()).filter((s) => s.company_id === c.id);
    return {
      ...c,
      career_page: getCareerPageUrl(c),
      ats_source_url: sources[0]?.source_url || null,
      funding_rounds: funding,
      latest_funding: funding[0] || null,
      signals_count: signals.length,
      open_jobs_count: openJobsCount,
    };
  });

  if (search) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        (c.domain && c.domain.toLowerCase().includes(search)) ||
        (c.industry && c.industry.toLowerCase().includes(search))
    );
  }
  if (stageFilter && stageFilter !== 'ALL') {
    list = list.filter((c) => c.latest_funding?.round_type === stageFilter);
  }

  list.sort((a, b) => b.hiring_priority - a.hiring_priority);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
  const total = list.length;
  const paginated = req.query.page ? list.slice((page - 1) * limit, page * limit) : list;
  res.json({
    data: paginated,
    meta: { total, page, limit, timestamp: new Date().toISOString() },
  });
});

v1Router.post('/companies', (req: Request, res: Response) => {
  try {
    const {
      name,
      website,
      career_page,
      ats_provider,
      ats_api_url,
      country_code,
      headquarters,
      industry,
      description,
      employee_count,
      round_type,
      funding_amount,
      currency,
      source_url,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Company name is required');
    }

    if (website) {
      const check = isSafeExternalUrl(String(website));
      if (!check.safe) {
        return sendError(res, 400, 'SSRF_BLOCKED', check.reason || 'Unsafe website URL');
      }
    }

    if (career_page) {
      const checkCareer = isSafeExternalUrl(String(career_page));
      if (!checkCareer.safe) {
        return sendError(res, 400, 'SSRF_BLOCKED', checkCareer.reason || 'Unsafe career page URL');
      }
    }

    if (ats_api_url) {
      const checkAts = isSafeExternalUrl(String(ats_api_url));
      if (!checkAts.safe) {
        return sendError(res, 400, 'SSRF_BLOCKED', checkAts.reason || 'Unsafe ATS API URL');
      }
    }

    const { company, created } = dbStore.upsertCompanyWithDeduplication({
      name: String(name),
      website: website || null,
      career_page: career_page ? String(career_page).trim() : null,
      ats_provider: (ats_provider as AtsProvider | undefined) || undefined,
      ats_api_url: ats_api_url ? String(ats_api_url).trim() : null,
      country_code: country_code || 'IN',
      headquarters: headquarters || null,
      industry: industry || 'Software & Technology',
      description: description || null,
      employee_count: employee_count ? Number(employee_count) : null,
      source_evidence_url: source_url || website || 'https://techcrunch.com/category/startups/',
    });

    if (round_type && round_type !== 'UNKNOWN') {
      dbStore.addFundingRoundIfNew({
        company_id: company.id,
        round_type: String(round_type),
        amount: funding_amount ? Number(funding_amount) : null,
        currency: currency || 'USD',
        announcement_date: new Date().toISOString().slice(0, 10),
        publication_date: new Date().toISOString().slice(0, 10),
        investors: [],
        source_url: source_url || website || 'https://techcrunch.com/category/startups/',
        source_name: 'Manual CRM Entry',
      });
    }

    res.status(created ? 201 : 200).json({ data: company, meta: { deduplicated: !created } });
  } catch (err: any) {
    sendError(res, 400, 'VALIDATION_ERROR', err.message);
  }
});

v1Router.get('/companies/:id', (req: Request, res: Response) => {
  const company = dbStore.companies.get(req.params.id);
  if (!company) return sendError(res, 404, 'NOT_FOUND', 'Company not found');

  const funding = dbStore.getFundingRoundsForCompany(company.id);
  const signals = Array.from(dbStore.companySignals.values()).filter((s) => s.company_id === company.id);
  const jobs = Array.from(dbStore.jobs.values()).filter((j) => j.company_id === company.id);
  const contacts = Array.from(dbStore.contacts.values()).filter((c) => c.company_id === company.id);

  res.json({
    data: {
      ...company,
      career_page: getCareerPageUrl(company),
      funding_rounds: funding,
      signals,
      jobs,
      contacts,
    },
  });
});

v1Router.get('/companies/:id/funding', (req: Request, res: Response) => {
  const rounds = dbStore.getFundingRoundsForCompany(req.params.id);
  res.json({ data: rounds });
});

v1Router.get('/companies/:id/signals', (req: Request, res: Response) => {
  const signals = Array.from(dbStore.companySignals.values()).filter(
    (s) => s.company_id === req.params.id
  );
  res.json({ data: signals });
});

v1Router.post('/companies/:id/investigate', async (req: Request, res: Response) => {
  try {
    const company = dbStore.companies.get(req.params.id);
    if (!company) return sendError(res, 404, 'NOT_FOUND', 'Company not found');

    // If ATS provider is not yet known from the URL and domain is not a synthetic test domain,
    // probe public Greenhouse / Ashby / Lever boards by company slug for real ATS discovery.
    const currentAts = company.metadata?.ats_provider || 'UNKNOWN';
    const isTestDomain = Boolean(company.domain && company.domain.endsWith('.example.com'));
    if (currentAts === 'UNKNOWN' && !isTestDomain) {
      const slug = company.normalized_name || company.domain?.split('.')[0] || '';
      const probed = await probeLiveCompanyAts(slug);
      if (probed) {
        company.metadata = {
          ...company.metadata,
          ats_provider: probed.atsProvider,
          career_page: company.metadata?.career_page || probed.careerUrl,
        };
        dbStore.companies.set(company.id, company);
      }
    }

    const run = await dbStore.triggerAgentRun('company-investigator', { company_id: company.id });
    res.status(202).json({
      data: {
        task_id: run.task_id,
        run_id: run.id,
        status: run.status,
        company: dbStore.companies.get(company.id),
      },
    });
  } catch (err: any) {
    sendError(res, 500, 'AGENT_ERROR', err.message);
  }
});

v1Router.get('/companies/:id/jobs', (req: Request, res: Response) => {
  const jobs = Array.from(dbStore.jobs.values()).filter((j) => j.company_id === req.params.id);
  res.json({ data: jobs });
});

v1Router.get('/companies/:id/contacts', (req: Request, res: Response) => {
  const contacts = Array.from(dbStore.contacts.values()).filter(
    (c) => c.company_id === req.params.id
  );
  res.json({ data: contacts });
});

// ============================================================================
// 6.3 Jobs and Evaluations
// ============================================================================

v1Router.get('/jobs', (req: Request, res: Response) => {
  const statusFilter = String(req.query.status || 'ACTIVE').toUpperCase();
  const decisionFilter = String(req.query.decision || '').toUpperCase();
  const workModeFilter = String(req.query.work_mode || '').toUpperCase();
  const minScore = req.query.min_score ? Number(req.query.min_score) : 0;
  const search = String(req.query.search || '').toLowerCase().trim();

  let enrichedJobs = Array.from(dbStore.jobs.values()).map((j) => {
    const company = dbStore.companies.get(j.company_id) || null;
    const evaluation = dbStore.getLatestEvaluationForJob(j.id);
    const existingApp = Array.from(dbStore.applications.values()).find(
      (a) => a.job_id === j.id && a.profile_id === dbStore.defaultProfileId
    );
    const companyCareerPage = getCareerPageUrl(company);
    return {
      ...j,
      company_name: company?.name || 'Unknown Company',
      company_domain: company?.domain || null,
      company_website: company?.website || null,
      company_career_page: companyCareerPage,
      company_priority: company?.hiring_priority || 0,
      evaluation,
      application_id: existingApp?.id || null,
      application_status: existingApp?.status || null,
    };
  });

  if (statusFilter && statusFilter !== 'ALL') {
    enrichedJobs = enrichedJobs.filter((j) => j.status === statusFilter);
  }
  if (decisionFilter && decisionFilter !== 'ALL') {
    enrichedJobs = enrichedJobs.filter((j) => j.evaluation?.decision === decisionFilter);
  }
  if (workModeFilter && workModeFilter !== 'ALL') {
    enrichedJobs = enrichedJobs.filter((j) => j.work_mode === workModeFilter);
  }
  if (minScore > 0) {
    enrichedJobs = enrichedJobs.filter((j) => (j.evaluation?.score ?? 0) >= minScore);
  }
  if (search) {
    enrichedJobs = enrichedJobs.filter(
      (j) =>
        j.title.toLowerCase().includes(search) ||
        j.company_name.toLowerCase().includes(search) ||
        j.description.toLowerCase().includes(search)
    );
  }

  enrichedJobs.sort((a, b) => (b.evaluation?.score ?? 0) - (a.evaluation?.score ?? 0));

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
  const total = enrichedJobs.length;
  const paginatedJobs = req.query.page
    ? enrichedJobs.slice((page - 1) * limit, page * limit)
    : enrichedJobs;

  res.json({
    data: paginatedJobs,
    meta: {
      total,
      page,
      limit,
      timestamp: new Date().toISOString(),
    },
  });
});

v1Router.get('/jobs/recent', (_req: Request, res: Response) => {
  const list = Array.from(dbStore.jobs.values())
    .sort((a, b) => new Date(b.first_seen_at).getTime() - new Date(a.first_seen_at).getTime())
    .slice(0, 10)
    .map((j) => {
      const company = dbStore.companies.get(j.company_id);
      return {
        ...j,
        company_name: company?.name || 'Company',
        company_website: company?.website || null,
        company_career_page: getCareerPageUrl(company),
        evaluation: dbStore.getLatestEvaluationForJob(j.id),
      };
    });
  res.json({ data: list });
});

v1Router.post('/jobs/poll-live', async (_req: Request, res: Response) => {
  try {
    const hunterRun = await dbStore.triggerAgentRun('job-hunter', { live_network: true });
    const evalRun = await dbStore.triggerAgentRun('job-evaluator', {});
    res.status(202).json({
      data: {
        hunter_run: hunterRun,
        evaluator_run: evalRun,
      },
    });
  } catch (err: any) {
    sendError(res, 500, 'LIVE_POLL_ERROR', err.message);
  }
});

v1Router.get('/jobs/:id', (req: Request, res: Response) => {
  const job = dbStore.jobs.get(req.params.id);
  if (!job) return sendError(res, 404, 'NOT_FOUND', 'Job not found');
  const company = dbStore.companies.get(job.company_id);
  const evaluation = dbStore.getLatestEvaluationForJob(job.id);
  const contacts = Array.from(dbStore.contacts.values()).filter((c) => c.company_id === job.company_id);
  res.json({
    data: {
      ...job,
      company,
      company_website: company?.website || null,
      company_career_page: getCareerPageUrl(company),
      evaluation,
      contacts,
    },
  });
});

v1Router.post('/jobs/:id/evaluate', async (req: Request, res: Response) => {
  try {
    const job = dbStore.jobs.get(req.params.id);
    if (!job) return sendError(res, 404, 'NOT_FOUND', 'Job not found');
    const run = await dbStore.triggerAgentRun('job-evaluator', { job_id: job.id });
    const evaluation = dbStore.getLatestEvaluationForJob(job.id);
    res.status(202).json({
      data: {
        task_id: run.task_id,
        evaluation,
      },
    });
  } catch (err: any) {
    sendError(res, 400, 'EVALUATION_ERROR', err.message);
  }
});

v1Router.get('/jobs/:id/evaluation', (req: Request, res: Response) => {
  const evaluation = dbStore.getLatestEvaluationForJob(req.params.id);
  if (!evaluation) return sendError(res, 404, 'NOT_FOUND', 'Evaluation not found for job');
  res.json({ data: evaluation });
});

v1Router.post('/jobs/:id/save', (req: Request, res: Response) => {
  try {
    const app = dbStore.createApplication({
      jobId: req.params.id,
      status: (req.body?.status as ApplicationStatus) || 'SAVED',
      notes: req.body?.notes || 'Saved from Job Discovery table',
    });
    res.status(201).json({ data: app });
  } catch (err: any) {
    const status = err.message.includes('UNIQUE_VIOLATION') ? 409 : 400;
    sendError(res, status, 'APPLICATION_EXISTS', err.message);
  }
});

v1Router.post('/jobs/:id/refresh', async (req: Request, res: Response) => {
  const job = dbStore.jobs.get(req.params.id);
  if (!job) return sendError(res, 404, 'NOT_FOUND', 'Job not found');
  const run = await dbStore.triggerAgentRun('job-hunter', {
    source_id: job.source_id,
    live_network: Boolean(req.body?.live_network),
  });
  res.status(202).json({ data: { task_id: run.task_id, status: run.status } });
});

// ============================================================================
// 6.4 Contacts and Outreach (Strict Approval & Explicit Send Separation)
// ============================================================================

v1Router.get('/contacts', (_req: Request, res: Response) => {
  const list = Array.from(dbStore.contacts.values()).map((c) => {
    const company = dbStore.companies.get(c.company_id);
    return {
      ...c,
      company_name: company?.name || 'Company',
      company_domain: company?.domain || null,
      company_website: company?.website || null,
      company_career_page: getCareerPageUrl(company),
    };
  });
  res.json({ data: list });
});

v1Router.post('/contacts/:id/research', async (req: Request, res: Response) => {
  const contact = dbStore.contacts.get(req.params.id);
  if (!contact && !req.body?.company_id) {
    return sendError(res, 404, 'NOT_FOUND', 'Contact not found and no company_id supplied');
  }
  // Research the contact's own company, not the contact id masquerading as one.
  const companyId = req.body?.company_id || contact?.company_id;
  if (!companyId) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Unable to resolve a company to research');
  }
  const run = await dbStore.triggerAgentRun('contact-finder', { company_id: companyId });
  res.status(202).json({ data: run });
});

v1Router.get('/outreach/drafts', (_req: Request, res: Response) => {
  const list = Array.from(dbStore.outreachDrafts.values())
    .map((d) => {
      const contact = dbStore.contacts.get(d.contact_id);
      const job = dbStore.jobs.get(d.job_id);
      const company = job ? dbStore.companies.get(job.company_id) : null;
      const mailLinks = buildMailClientLinks(contact?.email || '', d.subject, d.body);
      return {
        ...d,
        contact_name: contact?.name || 'Contact',
        contact_designation: contact?.designation || '',
        contact_email: contact?.email || null,
        contact_email_status: contact?.email_status || 'NOT_FOUND',
        job_title: job?.title || 'Engineering Role',
        job_apply_url: job?.apply_url || null,
        company_name: company?.name || 'Company',
        company_career_page: getCareerPageUrl(company),
        mailto_url: mailLinks.mailto_url,
        gmail_compose_url: mailLinks.gmail_compose_url,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json({ data: list });
});

v1Router.post('/outreach/drafts', (req: Request, res: Response) => {
  try {
    const { contact_id, job_id, subject, body } = req.body || {};
    if (!contact_id || !job_id) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'contact_id and job_id are required');
    }
    const draft = dbStore.createOutreachDraft({
      contact_id,
      job_id,
      subject,
      body,
    });
    res.status(201).json({ data: draft });
  } catch (err: any) {
    sendError(res, 400, 'DRAFT_ERROR', err.message);
  }
});

v1Router.patch('/outreach/drafts/:id', (req: Request, res: Response) => {
  const draft = dbStore.outreachDrafts.get(req.params.id);
  if (!draft) return sendError(res, 404, 'NOT_FOUND', 'Draft not found');
  if (draft.status === 'SENT') {
    return sendError(res, 400, 'IMMUTABLE_DRAFT', 'Cannot edit a draft that has already been sent');
  }
  const { subject, body, status } = req.body || {};
  const updated = {
    ...draft,
    ...(subject !== undefined ? { subject: String(subject) } : {}),
    ...(body !== undefined ? { body: String(body) } : {}),
    ...(status === 'DISCARDED' ? { status: 'DISCARDED' as const } : {}),
    updated_at: new Date().toISOString(),
  };
  dbStore.outreachDrafts.set(updated.id, updated);
  res.json({ data: updated });
});

v1Router.post('/outreach/drafts/:id/approve', (req: Request, res: Response) => {
  try {
    const approved = dbStore.approveOutreachDraft(req.params.id);
    res.json({ data: approved });
  } catch (err: any) {
    sendError(res, 400, 'APPROVAL_ERROR', err.message);
  }
});

v1Router.post('/outreach/drafts/:id/send', async (req: Request, res: Response) => {
  try {
    const idempotencyKey =
      req.headers['idempotency-key']?.toString() || req.body?.idempotency_key;
    const forceUnverified = Boolean(req.body?.force_unverified);
    const { draft, duplicate, mailto_url, gmail_compose_url, delivery_note } =
      await dbStore.sendApprovedOutreachDraft(
        req.params.id,
        idempotencyKey,
        forceUnverified
      );
    res.json({
      data: {
        ...draft,
        mailto_url,
        gmail_compose_url,
        delivery_note,
      },
      meta: { idempotent_replay: duplicate, delivery_note },
    });
  } catch (err: any) {
    const code = err.message.includes('APPROVAL_REQUIRED')
      ? 'APPROVAL_REQUIRED'
      : err.message.includes('UNVERIFIED_RECIPIENT')
      ? 'UNVERIFIED_RECIPIENT'
      : 'SEND_ERROR';
    sendError(res, 400, code, err.message);
  }
});

// ============================================================================
// 6.5 Applications CRM & Lifecycle
// ============================================================================

v1Router.get('/applications', (_req: Request, res: Response) => {
  const list = Array.from(dbStore.applications.values()).map((app) => {
    const job = dbStore.jobs.get(app.job_id);
    const company = job ? dbStore.companies.get(job.company_id) : null;
    const evaluation = job ? dbStore.getLatestEvaluationForJob(job.id) : null;
    const history = dbStore.getApplicationHistory(app.id);
    return {
      ...app,
      job_title: job?.title || 'Software Engineer',
      job_apply_url: job?.apply_url || null,
      work_mode: job?.work_mode || 'REMOTE',
      location: job?.location || 'Remote',
      company_name: company?.name || 'Company',
      company_id: company?.id || '',
      company_website: company?.website || null,
      company_career_page: getCareerPageUrl(company),
      score: evaluation?.score ?? null,
      history,
    };
  });
  res.json({ data: list });
});

v1Router.post('/applications', (req: Request, res: Response) => {
  try {
    const { job_id, status, notes, follow_up_at } = req.body || {};
    if (!job_id) return sendError(res, 400, 'VALIDATION_ERROR', 'job_id is required');
    const created = dbStore.createApplication({
      jobId: job_id,
      status: status || 'SAVED',
      notes: notes || '',
      followUpAt: follow_up_at || null,
    });
    res.status(201).json({ data: created });
  } catch (err: any) {
    const status = err.message.includes('UNIQUE_VIOLATION') ? 409 : 400;
    sendError(res, status, 'APPLICATION_ERROR', err.message);
  }
});

v1Router.patch('/applications/:id/status', (req: Request, res: Response) => {
  try {
    const { status, notes } = req.body || {};
    if (!status) return sendError(res, 400, 'VALIDATION_ERROR', 'status is required');
    const result = dbStore.updateApplicationStatus(req.params.id, status, notes || '');
    res.json({ data: result.application, event: result.event });
  } catch (err: any) {
    sendError(res, 400, 'STATUS_TRANSITION_ERROR', err.message);
  }
});

v1Router.post('/applications/:id/events', (req: Request, res: Response) => {
  const app = dbStore.applications.get(req.params.id);
  if (!app) return sendError(res, 404, 'NOT_FOUND', 'Application not found');
  const notes = String(req.body?.notes || '').trim();
  if (!notes) return sendError(res, 400, 'VALIDATION_ERROR', 'Activity note is required');

  const evId = crypto.randomUUID();
  const ev = {
    id: evId,
    application_id: app.id,
    old_status: app.status,
    new_status: app.status,
    notes,
    occurred_at: new Date().toISOString(),
    created_by: dbStore.defaultUserId,
  };
  dbStore.applicationEvents.set(evId, ev);
  res.status(201).json({ data: ev });
});

v1Router.get('/applications/:id/history', (req: Request, res: Response) => {
  const history = dbStore.getApplicationHistory(req.params.id);
  res.json({ data: history });
});

v1Router.post('/applications/:id/follow-up', (req: Request, res: Response) => {
  const app = dbStore.applications.get(req.params.id);
  if (!app) return sendError(res, 404, 'NOT_FOUND', 'Application not found');
  const { follow_up_at, notes } = req.body || {};
  app.follow_up_at = follow_up_at || null;
  if (notes) app.notes = `${app.notes ? app.notes + '\n' : ''}[Follow-up] ${notes}`;
  app.updated_at = new Date().toISOString();
  dbStore.applications.set(app.id, app);
  res.json({ data: app });
});

// ============================================================================
// 6.6 Dashboard, Agents and Source Monitoring
// ============================================================================

v1Router.get('/dashboard/overview', (_req: Request, res: Response) => {
  const companies = Array.from(dbStore.companies.values());
  const verifiedCompanies = companies.filter((c) => c.metadata?.verified_identity);
  const sources = Array.from(dbStore.jobSources.values());
  const healthySources = sources.filter((s) => s.status === 'HEALTHY');
  const jobs = Array.from(dbStore.jobs.values());
  // Count decisions per unique job using each job's *latest* evaluation, so a
  // job re-evaluated after a profile change is not double-counted and its old
  // decision is not counted alongside the new one.
  let qualifiedJobsCount = 0;
  let reviewJobsCount = 0;
  let rejectedJobsCount = 0;
  for (const job of jobs) {
    const latest = dbStore.getLatestEvaluationForJob(job.id);
    if (!latest) continue;
    if (latest.decision === 'QUALIFIED') qualifiedJobsCount++;
    else if (latest.decision === 'REVIEW') reviewJobsCount++;
    else rejectedJobsCount++;
  }
  const applications = Array.from(dbStore.applications.values());
  const contacts = Array.from(dbStore.contacts.values());
  const drafts = Array.from(dbStore.outreachDrafts.values());
  const unreadAlerts = Array.from(dbStore.notifications.values()).filter((n) => !n.read_at);

  res.json({
    data: {
      metrics: {
        verified_companies_count: verifiedCompanies.length,
        total_companies_count: companies.length,
        verified_website_rate:
          companies.length > 0 ? Math.round((verifiedCompanies.length / companies.length) * 100) : 100,
        active_sources_count: sources.length,
        source_health_rate:
          sources.length > 0 ? Math.round((healthySources.length / sources.length) * 100) : 100,
        unique_jobs_count: jobs.length,
        qualified_jobs_count: qualifiedJobsCount,
        review_jobs_count: reviewJobsCount,
        rejected_jobs_count: rejectedJobsCount,
        applications_tracked_count: applications.length,
        // Only verified addresses count as "verified contacts"; inferred guesses
        // are not verified.
        verified_contacts_count: contacts.filter((c) => c.email_status === 'VERIFIED').length,
        total_contacts_count: contacts.length,
        pending_drafts_count: drafts.filter((d) => d.status === 'PENDING_APPROVAL').length,
        sent_drafts_count: drafts.filter((d) => d.status === 'SENT').length,
        unread_notifications_count: unreadAlerts.length,
      },
    },
  });
});

v1Router.get('/dashboard/pipeline', (_req: Request, res: Response) => {
  const counts: Record<string, number> = {
    SAVED: 0,
    READY_TO_APPLY: 0,
    APPLIED: 0,
    SHORTLISTED: 0,
    INTERVIEWING: 0,
    OFFER: 0,
    REJECTED: 0,
    GHOSTED: 0,
    WITHDRAWN: 0,
    CLOSED: 0,
  };
  for (const app of dbStore.applications.values()) {
    counts[app.status] = (counts[app.status] || 0) + 1;
  }
  res.json({ data: counts });
});

v1Router.get('/dashboard/activity', (_req: Request, res: Response) => {
  const runs = Array.from(dbStore.agentRuns.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);
  const events = Array.from(dbStore.applicationEvents.values())
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 8);

  res.json({ data: { recent_agent_runs: runs, recent_application_events: events } });
});

v1Router.get('/dashboard/alerts', (_req: Request, res: Response) => {
  const alerts = Array.from(dbStore.notifications.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ data: alerts });
});

v1Router.patch('/dashboard/alerts/:id/read', (req: Request, res: Response) => {
  const alert = dbStore.notifications.get(req.params.id);
  if (!alert) return sendError(res, 404, 'NOT_FOUND', 'Notification not found');
  alert.read_at = new Date().toISOString();
  dbStore.notifications.set(alert.id, alert);
  res.json({ data: alert });
});

v1Router.get('/agents', (_req: Request, res: Response) => {
  const agentsCatalog = [
    {
      name: 'funding-scout',
      label: 'Agent 01 — Funding Scout',
      queue: 'funding-discovery',
      cadence: 'Daily / On-Demand',
      description: 'Discovers companies with funding announcements, normalizes stages, and preserves publication provenance.',
    },
    {
      name: 'company-investigator',
      label: 'Agent 02 — Company Investigator',
      queue: 'company-research',
      cadence: 'Event-Driven',
      description: 'Verifies company websites, discovers career pages, detects ATS providers, and computes priority scores.',
    },
    {
      name: 'job-hunter',
      label: 'Agent 03 — Job Hunter',
      queue: 'job-discovery',
      cadence: 'Every 10–15m',
      description: 'Polls authorized Greenhouse, Lever, and Ashby endpoints, normalizing and deduplicating job openings.',
    },
    {
      name: 'job-evaluator',
      label: 'Agent 04 — Job Evaluator',
      queue: 'job-evaluation',
      cadence: 'Event-Driven',
      description: 'Applies mandatory hard filters and 100-point weighted relevance scoring against the candidate profile.',
    },
    {
      name: 'contact-finder',
      label: 'Agent 05 — Contact Finder',
      queue: 'contact-research',
      cadence: 'Async / On Qualified Match',
      description: 'Researches publicly listed recruiters, engineering managers, and founders with field-level provenance.',
    },
    {
      name: 'outreach-assistant',
      label: 'Agent 06 — Outreach Assistant',
      queue: 'outreach-generation',
      cadence: 'Human-Triggered',
      description: 'Drafts personalized outreach emails locked to PENDING_APPROVAL until explicit user review.',
    },
  ];
  res.json({ data: agentsCatalog });
});

v1Router.get('/agents/runs', (_req: Request, res: Response) => {
  const runs = Array.from(dbStore.agentRuns.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ data: runs });
});

v1Router.get('/agents/runs/:id', (req: Request, res: Response) => {
  const run = dbStore.agentRuns.get(req.params.id);
  if (!run) return sendError(res, 404, 'NOT_FOUND', 'Agent run not found');
  res.json({ data: run });
});

v1Router.post('/agents/:name/run', async (req: Request, res: Response) => {
  try {
    const run = await dbStore.triggerAgentRun(req.params.name, req.body || {});
    res.status(202).json({ data: run });
  } catch (err: any) {
    sendError(res, 400, 'AGENT_EXECUTION_ERROR', err.message);
  }
});

v1Router.get('/monitoring/sources', (_req: Request, res: Response) => {
  const sources = Array.from(dbStore.jobSources.values()).map((s) => {
    const company = dbStore.companies.get(s.company_id);
    return {
      ...s,
      company_name: company?.name || 'Company',
      company_career_page: getCareerPageUrl(company),
      active_jobs_count: Array.from(dbStore.jobs.values()).filter(
        (j) => j.source_id === s.id && j.status === 'ACTIVE'
      ).length,
    };
  });
  res.json({ data: sources });
});

v1Router.post('/monitoring/sources/:id/check', async (req: Request, res: Response) => {
  try {
    const src = dbStore.jobSources.get(req.params.id);
    if (!src) return sendError(res, 404, 'NOT_FOUND', 'Source not found');
    const run = await dbStore.triggerAgentRun('job-hunter', {
      source_id: src.id,
      live_network: true,
    });
    await dbStore.triggerAgentRun('job-evaluator', {});
    res.status(202).json({
      data: {
        task_id: run.task_id,
        source: dbStore.jobSources.get(src.id),
        run,
      },
    });
  } catch (err: any) {
    sendError(res, 500, 'SOURCE_CHECK_ERROR', err.message);
  }
});

