import crypto from 'node:crypto';
import {
  FundingStage,
  AtsProvider,
  EvaluationDecision,
  ApplicationStatus,
} from '../../../../packages/contracts/src/index.ts';
import {
  CandidateProfileRecord,
  CandidateSkillRecord,
  JobRecord,
  PriorityBreakdown,
} from '../../../../packages/shared-types/src/index.ts';

// ============================================================================
// 1. Normalization & Deterministic Hashing
// ============================================================================

export function normalizeSkill(skill: string): string {
  return skill
    .trim()
    .toLowerCase()
    .replace(/\.js$/i, 'js')
    .replace(/[^a-z0-9+#]/g, '');
}

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|pvt|private|limited|corp|corporation|technologies|labs|ai)\b\.?/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export function extractNormalizedDomain(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  try {
    const formatted = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const parsed = new URL(formatted);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function computeDescriptionHash(description: string): string {
  const normalized = description.trim().replace(/\s+/g, ' ').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}

export function normalizeFundingStage(rawStage: string | null | undefined): FundingStage {
  if (!rawStage) return 'UNKNOWN';
  const s = rawStage.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (s.includes('PRE_SEED') || s.includes('PRESEED')) return 'PRE_SEED';
  if (s === 'SEED' || s.includes('SEED_ROUND')) return 'SEED';
  if (s.includes('SERIES_A')) return 'SERIES_A';
  if (s.includes('SERIES_B')) return 'SERIES_B';
  if (s.includes('SERIES_C')) return 'SERIES_C';
  if (s.includes('SERIES_D') || s.includes('SERIES_E') || s.includes('SERIES_F')) return 'SERIES_D_PLUS';
  if (s.includes('GROWTH') || s.includes('LATE')) return 'GROWTH';
  if (s.includes('BOOTSTRAPPED')) return 'BOOTSTRAPPED';
  if (s.includes('IPO') || s.includes('PUBLIC')) return 'IPO';
  return 'UNKNOWN';
}

export function detectAtsProviderFromUrl(url: string | null | undefined): AtsProvider {
  if (!url) return 'UNKNOWN';
  const lower = url.toLowerCase();
  if (lower.includes('greenhouse.io')) return 'GREENHOUSE';
  if (lower.includes('lever.co')) return 'LEVER';
  if (lower.includes('ashbyhq.com')) return 'ASHBY';
  if (lower.includes('workable.com')) return 'WORKABLE';
  return 'UNKNOWN';
}

// ============================================================================
// 2. Security: SSRF Protection & Untrusted Text Sanitization (Phase 10)
// ============================================================================

export function isSafeExternalUrl(rawUrl: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are permitted' };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return { safe: false, reason: 'Loopback and internal hostnames are blocked (SSRF protection)' };
    }

    // Block private IPv4 ranges and cloud metadata IP
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      ) {
        return { safe: false, reason: 'Private network or metadata IP range blocked (SSRF protection)' };
      }
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Malformed URL syntax' };
  }
}

export function sanitizeUntrustedText(rawText: string): {
  sanitized: string;
  injectionDetected: boolean;
} {
  if (!rawText) return { sanitized: '', injectionDetected: false };

  // Strip script/style blocks and HTML tags
  let cleaned = rawText
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    /system\s*prompt\s*:/i,
    /you\s+are\s+now\s+in\s+developer\s+mode/i,
    /override\s+(evaluation|score|hard\s+filter)/i,
    /set\s+decision\s+to\s+qualified/i,
  ];

  let injectionDetected = false;
  for (const pattern of injectionPatterns) {
    if (pattern.test(cleaned)) {
      injectionDetected = true;
      cleaned = cleaned.replace(pattern, '[UNTRUSTED_DIRECTIVE_REDACTED]');
    }
  }

  return {
    sanitized: cleaned.replace(/\s+/g, ' ').trim(),
    injectionDetected,
  };
}

// ============================================================================
// 3. Company Priority Scoring v1 (Phase 3 / Section 8)
// Formula: 0.35 * funding_score + 0.40 * hiring_score + 0.15 * growth_score + 0.10 * role_relevance_score
// ============================================================================

export function calculateCompanyPriority(params: {
  fundingStage: FundingStage;
  daysSinceAnnouncement: number | null;
  verifiedOpenRolesCount: number;
  hasConfirmedAts: boolean;
  signalCount: number;
  matchingRoleCount: number;
}): { priority: number; breakdown: PriorityBreakdown } {
  // 1. Funding score (0 to 100)
  const stageBaseScores: Record<FundingStage, number> = {
    SERIES_A: 90,
    SERIES_B: 92,
    SEED: 85,
    PRE_SEED: 78,
    SERIES_C: 84,
    GROWTH: 80,
    SERIES_D_PLUS: 75,
    IPO: 70,
    BOOTSTRAPPED: 65,
    UNKNOWN: 35,
  };
  let fundingScore = stageBaseScores[params.fundingStage] ?? 35;
  if (params.daysSinceAnnouncement !== null) {
    if (params.daysSinceAnnouncement <= 14) fundingScore = Math.min(100, fundingScore + 10);
    else if (params.daysSinceAnnouncement > 180) fundingScore = Math.max(20, fundingScore - 20);
  }

  // 2. Hiring score (0 to 100)
  let hiringScore = 20;
  if (params.hasConfirmedAts) hiringScore += 30;
  hiringScore += Math.min(50, params.verifiedOpenRolesCount * 15);
  hiringScore = Math.min(100, hiringScore);

  // 3. Growth score (0 to 100)
  const growthScore = Math.min(100, 30 + params.signalCount * 20);

  // 4. Role relevance score (0 to 100)
  const roleRelevanceScore =
    params.matchingRoleCount > 0 ? Math.min(100, 50 + params.matchingRoleCount * 25) : 30;

  const rawPriority =
    0.35 * fundingScore +
    0.4 * hiringScore +
    0.15 * growthScore +
    0.1 * roleRelevanceScore;

  const priority = Math.round(rawPriority * 100) / 100;

  return {
    priority,
    breakdown: {
      funding_score: fundingScore,
      hiring_score: hiringScore,
      growth_score: growthScore,
      role_relevance_score: roleRelevanceScore,
      formula: '0.35 * funding + 0.40 * hiring + 0.15 * growth + 0.10 * relevance',
    },
  };
}

// ============================================================================
// 4. Deterministic Hard Filter & 100-Point Job Evaluator (Phase 5 / Section 4)
// ============================================================================

export function evaluateJobAgainstProfile(
  job: JobRecord,
  profile: CandidateProfileRecord,
  candidateSkills: CandidateSkillRecord[]
): {
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
  evidence: Array<{ claim: string; quote: string; source: string }>;
} {
  // Sanitize untrusted job description before evaluation
  const { sanitized: cleanDesc } = sanitizeUntrustedText(job.description || '');
  const fullTextLower = `${job.title} ${cleanDesc}`.toLowerCase();

  // Extract common technical skills mentioned in the job description
  const knownSkillCatalog = [
    'Node.js',
    'TypeScript',
    'JavaScript',
    'React',
    'Python',
    'FastAPI',
    'PostgreSQL',
    'MongoDB',
    'Redis',
    'Docker',
    'AWS',
    'GraphQL',
    'Go',
    'Kubernetes',
    'Next.js',
    'Express',
    'SQL',
  ];

  // Match on normalized, word-bounded tokens only. A raw `includes()` check
  // produced substring false positives ("Go" inside "algorithms", "AWS"
  // inside "laws", "SQL" inside "PostgreSQL"), inflating required-skill sets.
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleAndDescNorm = fullTextLower.replace(/\.js\b/g, 'js');
  const requiredSkillsInJob = knownSkillCatalog.filter((sk) => {
    const norm = escapeRegExp(normalizeSkill(sk));
    if (!norm) return false;
    return new RegExp(`\\b${norm}\\b`, 'i').test(titleAndDescNorm);
  });

  const candidateSkillNormSet = new Set(candidateSkills.map((s) => s.normalized_skill));

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const jobSkill of requiredSkillsInJob) {
    if (candidateSkillNormSet.has(normalizeSkill(jobSkill))) {
      matchedSkills.push(jobSkill);
    } else {
      missingSkills.push(jobSkill);
    }
  }

  // -------------------------------------------------------------------------
  // Stage 1: Deterministic Hard Filters
  // -------------------------------------------------------------------------
  const prefs = profile.preferences;

  // 1. Work mode compatibility:
  // Rule: "Unknown remote policy is not equivalent to remote."
  // If remote_only is true, ONSITE fails hard filter; UNKNOWN is flagged for REVIEW (or passes hard filter only if not strictly onsite, wait: let's follow spec:
  // "Unknown remote policy is not equivalent to remote." So if remote_only is true, only REMOTE (or HYBRID in home geography if allowed, wait: if remote_only is true, ONSITE is ineligible, and UNKNOWN is not given full remote score or if strict remote_only, let's check!)
  // Let's check Section 4 & Phase 5 test rule:
  // "Unknown work mode is not treated as remote."
  // When the candidate is not remote-only, any work mode is acceptable.
  // (CLOSED is a job *status*, not a work mode, so it is not filtered here.)
  const workModeEligible = prefs.remote_only ? job.work_mode === 'REMOTE' : true;

  // 2. Experience compatibility:
  // Candidate has profile.experience_years and prefs.maximum_experience.
  // If job.experience_min > prefs.maximum_experience + 1, it fails experience hard filter.
  const maxAllowedExp = Math.max(profile.experience_years, prefs.maximum_experience ?? 2);
  const experienceEligible =
    job.experience_min === null || job.experience_min <= maxAllowedExp;

  // 3. Location / Geography eligibility:
  // Rule: "Do not silently reject an international role based on location alone. Check whether the role accepts applicants in the candidate's country or supports international remote employment."
  const isTargetCountry =
    !job.country_code ||
    prefs.geographies.includes(job.country_code) ||
    prefs.geographies.includes('GLOBAL');
  const supportsGlobalRemote =
    job.work_mode === 'REMOTE' &&
    !/us\s+only|united\s+states\s+only|eu\s+citizens\s+only|uk\s+residents\s+only/i.test(cleanDesc);
  const locationEligible = isTargetCountry || supportsGlobalRemote;

  // 4. Role eligibility:
  const roleKeywords = [
    'backend',
    'full stack',
    'fullstack',
    'software engineer',
    'platform engineer',
    'api engineer',
    'product engineer',
    'founding engineer',
    'developer',
  ];
  const titleLower = job.title.toLowerCase();
  const roleEligible = roleKeywords.some((kw) => titleLower.includes(kw));

  // 5. Salary compatibility:
  // Rule: "Unknown salary is not automatically a rejection." "Do not treat missing salary as zero."
  let salaryEligible = true;
  if (job.salary_max !== null && job.salary_max > 0) {
    // Normalize USD to INR roughly (1 USD = 84 INR) if comparing against INR minimum
    const salaryInInr =
      job.salary_currency === 'USD' ? job.salary_max * 84 : job.salary_max;
    const minInInr =
      prefs.salary_currency === 'USD' ? prefs.minimum_salary * 84 : prefs.minimum_salary;
    if (salaryInInr < minInInr * 0.8) {
      salaryEligible = false;
    }
  }

  const allHardFiltersPassed =
    workModeEligible &&
    experienceEligible &&
    locationEligible &&
    roleEligible &&
    salaryEligible;

  // -------------------------------------------------------------------------
  // Stage 2: Weighted Relevance Scoring (Total = 100)
  // Technical skills: 30 | Role relevance: 25 | Experience: 15 |
  // Responsibilities: 15 | Location/work-mode: 10 | Salary: 5
  // -------------------------------------------------------------------------

  // 1. Technical skills (0–30)
  let technicalSkillsScore = 20;
  if (requiredSkillsInJob.length > 0) {
    const ratio = matchedSkills.length / requiredSkillsInJob.length;
    technicalSkillsScore = Math.round(ratio * 30);
  } else if (matchedSkills.length > 0) {
    technicalSkillsScore = 25;
  }

  // 2. Role relevance (0–25)
  let roleRelevanceScore = 10;
  const exactTargetMatch = prefs.target_roles.some((tr) =>
    titleLower.includes(tr.toLowerCase().replace('developer', '').trim())
  );
  if (exactTargetMatch) {
    roleRelevanceScore = 25;
  } else if (roleEligible) {
    roleRelevanceScore = 20;
  } else {
    roleRelevanceScore = 5;
  }

  // 3. Experience compatibility (0–15)
  let experienceScore = 12;
  if (job.experience_min !== null) {
    if (job.experience_min <= profile.experience_years) {
      experienceScore = 15;
    } else if (job.experience_min <= maxAllowedExp) {
      experienceScore = 13;
    } else {
      experienceScore = Math.max(0, 15 - Math.round((job.experience_min - maxAllowedExp) * 5));
    }
  }

  // 4. Responsibilities match (0–15)
  const respKeywords = ['api', 'database', 'typescript', 'backend', 'microservices', 'scalable', 'rest', 'postgresql', 'react', 'fastapi'];
  const matchedRespCount = respKeywords.filter((kw) => fullTextLower.includes(kw)).length;
  const responsibilitiesScore = Math.min(15, 6 + matchedRespCount * 2);

  // 5. Location / work-mode compatibility (0–10)
  let locationScore = 5;
  if (job.work_mode === 'REMOTE' && locationEligible) {
    locationScore = 10;
  } else if (job.work_mode === 'HYBRID' && isTargetCountry) {
    locationScore = 7;
  } else if (job.work_mode === 'UNKNOWN') {
    // Unknown work mode is NEVER treated as remote
    locationScore = 4;
  } else {
    locationScore = 2;
  }

  // 6. Salary compatibility (0–5)
  let salaryScore = 3; // Neutral score when salary is undisclosed (null)
  if (job.salary_max !== null && job.salary_max > 0) {
    salaryScore = salaryEligible ? 5 : 0;
  }

  const totalScore =
    technicalSkillsScore +
    roleRelevanceScore +
    experienceScore +
    responsibilitiesScore +
    locationScore +
    salaryScore;

  // -------------------------------------------------------------------------
  // Stage 3 & 4: Decision Routing & Evidence Explanation
  // 80–100: QUALIFIED | 65–79: REVIEW | <65: REJECTED
  // Mandatory hard filters override the score!
  // -------------------------------------------------------------------------
  let decision: EvaluationDecision = 'REJECTED';
  if (!allHardFiltersPassed) {
    // If the only failure is UNKNOWN work_mode when remote_only is true, route to REVIEW if score >= 65, OR if hard filters are mandatory overrides:
    // Spec: "Mandatory hard filters cannot be overridden by an LLM." "Mandatory failures override high semantic scores."
    decision = 'REJECTED';
  } else if (totalScore >= 80) {
    decision = 'QUALIFIED';
  } else if (totalScore >= 65) {
    decision = 'REVIEW';
  } else {
    decision = 'REJECTED';
  }

  const evidence: Array<{ claim: string; quote: string; source: string }> = [];
  if (matchedSkills.length > 0) {
    evidence.push({
      claim: `Matched ${matchedSkills.length} core technical skills (${matchedSkills.join(', ')})`,
      quote: cleanDesc.slice(0, 160) + (cleanDesc.length > 160 ? '...' : ''),
      source: job.source_url || job.apply_url || 'Job Listing',
    });
  }
  if (job.work_mode) {
    evidence.push({
      claim: `Work mode classified as ${job.work_mode} (${job.location || 'Global'})`,
      quote: `Location: ${job.location || 'Unspecified'} · Work Mode: ${job.work_mode}`,
      source: job.source_url || 'ATS Metadata',
    });
  }

  const failedReasons: string[] = [];
  if (!workModeEligible) failedReasons.push(`work mode (${job.work_mode}) does not satisfy remote-only requirement`);
  if (!experienceEligible) failedReasons.push(`minimum experience (${job.experience_min} yrs) exceeds target threshold (${maxAllowedExp} yrs)`);
  if (!locationEligible) failedReasons.push(`location (${job.location}) restricts international applicants`);
  if (!roleEligible) failedReasons.push(`title (${job.title}) outside target engineering roles`);
  if (!salaryEligible) failedReasons.push(`disclosed compensation below target threshold`);

  const reasoning = !allHardFiltersPassed
    ? `Rejected by mandatory hard filter: ${failedReasons.join('; ')}. (Raw relevance score: ${totalScore}/100).`
    : decision === 'QUALIFIED'
    ? `Strong candidate match (${totalScore}/100). Matched ${matchedSkills.length} key skills (${matchedSkills.join(', ') || 'general engineering'}) with compatible ${job.work_mode} work mode and experience level.`
    : decision === 'REVIEW'
    ? `Moderate alignment (${totalScore}/100). Passed hard filters; flagged for manual review due to partial skill overlap or undisclosed parameters.`
    : `Score (${totalScore}/100) below qualification threshold (65). Missing skills: ${missingSkills.join(', ') || 'N/A'}.`;

  return {
    score: totalScore,
    decision,
    score_breakdown: {
      technical_skills: technicalSkillsScore,
      role_relevance: roleRelevanceScore,
      experience: experienceScore,
      responsibilities: responsibilitiesScore,
      location: locationScore,
      salary: salaryScore,
    },
    hard_filter_results: {
      location_eligible: locationEligible,
      experience_eligible: experienceEligible,
      role_eligible: roleEligible,
      work_mode_eligible: workModeEligible,
      salary_eligible: salaryEligible,
    },
    matched_skills: matchedSkills,
    missing_skills: missingSkills,
    reasoning,
    evidence,
  };
}

// ============================================================================
// 5. Application Status Transition Validator (Phase 9)
// ============================================================================

const ALLOWED_STATUS_SET = new Set<ApplicationStatus>([
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

export function validateApplicationStatusTransition(
  currentStatus: ApplicationStatus,
  nextStatus: string
): { valid: boolean; reason?: string } {
  if (!ALLOWED_STATUS_SET.has(nextStatus as ApplicationStatus)) {
    return { valid: false, reason: `Invalid application status: ${nextStatus}` };
  }
  if (currentStatus === nextStatus) {
    return { valid: false, reason: `Application is already in ${currentStatus} state` };
  }
  return { valid: true };
}
