import { isSafeExternalUrl, sanitizeUntrustedText } from './coreEngine.ts';

export interface LiveFetchedJob {
  external_id: string;
  title: string;
  description: string;
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
  apply_url: string | null;
  source_url: string;
  raw_data: Record<string, any>;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function inferWorkMode(locationText: string, descriptionText: string, isRemoteFlag?: boolean): 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN' {
  if (isRemoteFlag === true) return 'REMOTE';
  const combined = `${locationText} ${descriptionText.slice(0, 400)}`.toLowerCase();
  if (combined.includes('remote') || combined.includes('anywhere') || combined.includes('distributed')) {
    return 'REMOTE';
  }
  if (combined.includes('hybrid')) {
    return 'HYBRID';
  }
  if (locationText && locationText.trim().length > 0) {
    return 'ONSITE';
  }
  return 'UNKNOWN';
}

function inferCountryCode(locationText: string): string | null {
  const loc = (locationText || '').toLowerCase();
  if (loc.includes('india') || loc.includes('bengaluru') || loc.includes('bangalore') || loc.includes('mumbai') || loc.includes('gurgaon') || loc.includes('hyderabad')) {
    return 'IN';
  }
  if (loc.includes('united states') || loc.includes('san francisco') || loc.includes('new york') || loc.includes('seattle') || /\bus\b/.test(loc)) {
    return 'US';
  }
  if (loc.includes('united kingdom') || loc.includes('london') || /\buk\b/.test(loc)) {
    return 'GB';
  }
  if (loc.includes('germany') || loc.includes('berlin') || loc.includes('munich')) {
    return 'DE';
  }
  if (loc.includes('singapore')) {
    return 'SG';
  }
  if (loc.includes('remote') || loc.includes('global') || loc.includes('anywhere')) {
    return 'GLOBAL';
  }
  return null;
}

function inferExperienceRange(description: string, title: string): { min: number | null; max: number | null } {
  const titleLower = title.toLowerCase();
  const match = description.match(/(\d+)\s*(?:\+|to|-|–)\s*(\d+)?\s*years?\s+of\s+experience/i);
  if (match) {
    const min = Number(match[1]);
    const max = match[2] ? Number(match[2]) : min + 2;
    return { min, max };
  }
  if (titleLower.includes('staff') || titleLower.includes('principal') || titleLower.includes('lead')) {
    return { min: 6, max: 10 };
  }
  if (titleLower.includes('senior') || titleLower.includes('sr.')) {
    return { min: 4, max: 7 };
  }
  if (titleLower.includes('junior') || titleLower.includes('associate') || titleLower.includes(' i ') || titleLower.endsWith(' i')) {
    return { min: 0, max: 2 };
  }
  return { min: 1, max: 2 };
}

/**
 * Fetches and normalizes live job postings from authorized public Greenhouse, Ashby, or Lever endpoints.
 */
export async function fetchLiveJobsFromAts(
  atsProvider: string,
  sourceUrl: string,
  maxJobs = 8
): Promise<{ jobs: LiveFetchedJob[]; live: boolean; error?: string; allExternalIds?: string[] }> {
  const urlCheck = isSafeExternalUrl(sourceUrl);
  if (!urlCheck.safe) {
    return { jobs: [], live: false, error: urlCheck.reason };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    if (atsProvider === 'GREENHOUSE' || sourceUrl.includes('greenhouse.io')) {
      const fetchUrl = sourceUrl.includes('content=true')
        ? sourceUrl
        : `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}content=true`;

      const res = await fetch(fetchUrl, { signal: controller.signal });
      if (!res.ok) {
        return { jobs: [], live: false, error: `Greenhouse HTTP ${res.status}` };
      }
      const data = (await res.json()) as any;
      const rawJobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];

      // Prioritize software/backend/fullstack engineering roles
      const engJobs = rawJobs.filter((j) =>
        /engineer|developer|software|backend|full\s*stack|platform|data|cloud|api/i.test(String(j.title || ''))
      );
      const selected = (engJobs.length > 0 ? engJobs : rawJobs).slice(0, maxJobs);

      const normalized: LiveFetchedJob[] = selected.map((j) => {
        const decodedHtml = decodeHtmlEntities(String(j.content || j.title || ''));
        const { sanitized } = sanitizeUntrustedText(decodedHtml);
        const locName = String(j.location?.name || 'Unspecified');
        const exp = inferExperienceRange(sanitized, String(j.title || ''));

        return {
          external_id: `gh-${j.id}`,
          title: String(j.title || 'Software Engineer').trim(),
          description: sanitized.slice(0, 1200) || `${j.title} at ${j.company_name || 'Company'}`,
          location: locName,
          country_code: inferCountryCode(locName),
          work_mode: inferWorkMode(locName, sanitized),
          employment_type: 'FULL_TIME',
          salary_min: null, // Never fabricate salary when ATS does not disclose structured band
          salary_max: null,
          salary_currency: null,
          experience_min: exp.min,
          experience_max: exp.max,
          posted_at: j.first_published || j.updated_at || null,
          apply_url: j.absolute_url || null,
          source_url: sourceUrl,
          raw_data: {
            requisition_id: j.requisition_id || null,
            internal_job_id: j.internal_job_id || null,
            live_source: 'GREENHOUSE_PUBLIC_API',
          },
        };
      });

      return {
        jobs: normalized,
        live: true,
        // Every external id currently on the board (not just the selected page),
        // so callers can safely detect postings that have been taken down.
        allExternalIds: rawJobs.map((j) => `gh-${j.id}`),
      };
    }

    if (atsProvider === 'ASHBY' || sourceUrl.includes('ashbyhq.com')) {
      const res = await fetch(sourceUrl, { signal: controller.signal });
      if (!res.ok) {
        return { jobs: [], live: false, error: `Ashby HTTP ${res.status}` };
      }
      const data = (await res.json()) as any;
      const rawJobs: any[] = Array.isArray(data?.jobs) ? data.jobs : [];

      const engJobs = rawJobs.filter((j) =>
        /engineer|developer|software|backend|full\s*stack|platform|product|infra/i.test(String(j.title || ''))
      );
      const selected = (engJobs.length > 0 ? engJobs : rawJobs).slice(0, maxJobs);

      const normalized: LiveFetchedJob[] = selected.map((j) => {
        const rawDesc = String(j.descriptionPlain || j.descriptionHtml || j.title || '');
        const { sanitized } = sanitizeUntrustedText(rawDesc);
        const locName = String(j.location || 'Remote');
        const exp = inferExperienceRange(sanitized, String(j.title || ''));

        return {
          external_id: `ashby-${j.id}`,
          title: String(j.title || 'Software Engineer').trim(),
          description: sanitized.slice(0, 1200) || String(j.title),
          location: locName,
          country_code: inferCountryCode(locName),
          work_mode: inferWorkMode(locName, sanitized, Boolean(j.isRemote)),
          employment_type: 'FULL_TIME',
          salary_min: null,
          salary_max: null,
          salary_currency: null,
          experience_min: exp.min,
          experience_max: exp.max,
          posted_at: j.publishedAt || null,
          apply_url: j.jobUrl || j.applyUrl || null,
          source_url: sourceUrl,
          raw_data: {
            department: j.department || null,
            team: j.team || null,
            workplaceType: j.workplaceType || null,
            live_source: 'ASHBY_PUBLIC_API',
          },
        };
      });

      return {
        jobs: normalized,
        live: true,
        allExternalIds: rawJobs.map((j) => `ashby-${j.id}`),
      };
    }

    if (atsProvider === 'LEVER' || sourceUrl.includes('lever.co')) {
      const res = await fetch(sourceUrl, { signal: controller.signal });
      if (!res.ok) {
        return { jobs: [], live: false, error: `Lever HTTP ${res.status}` };
      }
      const data = (await res.json()) as any;
      const rawJobs: any[] = Array.isArray(data) ? data : [];
      const selected = rawJobs.slice(0, maxJobs);

      const normalized: LiveFetchedJob[] = selected.map((j) => {
        const rawDesc = String(j.descriptionPlain || j.description || j.text || '');
        const { sanitized } = sanitizeUntrustedText(rawDesc);
        const locName = String(j.categories?.location || 'Remote');
        const exp = inferExperienceRange(sanitized, String(j.text || ''));

        return {
          external_id: `lever-${j.id}`,
          title: String(j.text || 'Software Engineer').trim(),
          description: sanitized.slice(0, 1200) || String(j.text),
          location: locName,
          country_code: inferCountryCode(locName),
          work_mode: inferWorkMode(locName, sanitized, j.workplaceType === 'remote'),
          employment_type: 'FULL_TIME',
          salary_min: j.salaryRange?.min ?? null,
          salary_max: j.salaryRange?.max ?? null,
          salary_currency: j.salaryRange?.currency ?? null,
          experience_min: exp.min,
          experience_max: exp.max,
          posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
          apply_url: j.hostedUrl || j.applyUrl || null,
          source_url: sourceUrl,
          raw_data: {
            commitment: j.categories?.commitment || null,
            live_source: 'LEVER_PUBLIC_API',
          },
        };
      });

      return {
        jobs: normalized,
        live: true,
        allExternalIds: rawJobs.map((j) => `lever-${j.id}`),
      };
    }

    return { jobs: [], live: false, error: 'Unsupported ATS provider for live polling' };
  } catch (err: any) {
    return { jobs: [], live: false, error: err?.message || 'Network fetch error' };
  } finally {
    clearTimeout(timeout);
  }
}
