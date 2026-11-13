// Shared UI formatting & tone helpers used across all feature views.

export type BannerTone = 'success' | 'error' | 'info';

export interface Banner {
  tone: BannerTone;
  text: string;
}

/** Relative time like "2h ago" / "just now" / "5d ago". Falls back to date. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}

/** Tailwind text classes for an evaluation decision. */
export function decisionTone(decision: string | null | undefined): string {
  switch (decision) {
    case 'QUALIFIED':
      return 'text-emerald-400';
    case 'REVIEW':
      return 'text-amber-400';
    case 'REJECTED':
      return 'text-rose-400';
    default:
      return 'text-slate-400';
  }
}

/** Tailwind classes for an application lifecycle status pill. */
export function statusTone(status: string | null | undefined): string {
  switch (status) {
    case 'OFFER':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    case 'INTERVIEWING':
    case 'SHORTLISTED':
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    case 'APPLIED':
      return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
    case 'READY_TO_APPLY':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'SAVED':
      return 'text-slate-300 bg-slate-500/10 border-slate-500/30';
    case 'REJECTED':
    case 'WITHDRAWN':
      return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    case 'GHOSTED':
    case 'CLOSED':
      return 'text-slate-500 bg-slate-500/10 border-slate-500/30';
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  }
}

/** Salary display with strict null preservation for undisclosed ranges. */
export function formatSalary(job: {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency?: string | null;
}): string {
  if (job.salary_min === null && job.salary_max === null) {
    return 'Undisclosed (Null preserved)';
  }
  const curr = job.salary_currency || 'INR';
  const min = job.salary_min ? Number(job.salary_min).toLocaleString() : '0';
  const max = job.salary_max ? Number(job.salary_max).toLocaleString() : min;
  return `${curr} ${min} – ${max}`;
}

/** Compact money formatting for funding amounts: 1.45M / 120K. */
export function formatMoneyCompact(amount: number, currency: string = 'USD'): string {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  return `${symbol}${amount.toLocaleString()}`;
}

/** Extract a readable message from a failed fetch Response. */
export async function extractApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    return json?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

/** Resolves the career page URL for a company with fallback to website/careers. */
export function getCareerPageUrl(company: {
  website?: string | null;
  metadata?: { career_page?: string | null; [key: string]: any } | null;
  career_page?: string | null;
} | null | undefined): string | null {
  if (!company) return null;
  if (company.career_page && typeof company.career_page === 'string') {
    return company.career_page;
  }
  if (company.metadata?.career_page && typeof company.metadata.career_page === 'string') {
    return company.metadata.career_page;
  }
  if (company.website) {
    return `${company.website.replace(/\/$/, '')}/careers`;
  }
  return null;
}
