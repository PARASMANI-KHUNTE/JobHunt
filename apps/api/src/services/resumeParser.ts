/**
 * Deterministic resume parser (no LLM dependency).
 * Extracts structured candidate data from raw resume text:
 * full name, headline, years of experience, skills (taxonomy-matched),
 * work experience entries, education, and a derived summary.
 *
 * Principle alignment: "Deterministic Core" — parsing/normalization never
 * relies on an LLM; all extraction is regex + curated taxonomy based.
 */

import { normalizeSkill } from './coreEngine.ts';

export interface ParsedWorkExperience {
  company: string | null;
  title: string | null;
  start: string | null;
  end: string | null;
  current: boolean;
  duration_years: number;
}

export interface ParsedEducation {
  degree: string;
  institution: string | null;
  year: string | null;
}

export interface ParsedSkill {
  skill_name: string;
  normalized_skill: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  frequency: number;
}

export interface ParsedResume {
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  experience_years: number;
  experience_years_source: 'stated' | 'computed' | 'default';
  skills: ParsedSkill[];
  work_experience: ParsedWorkExperience[];
  education: ParsedEducation[];
  summary: string;
}

// ============================================================================
// Skill taxonomy: canonical name + matching regex (case-insensitive).
// Ordered roughly so more specific multi-word terms are matched cleanly.
// ============================================================================

const SKILL_TAXONOMY: Array<{ name: string; re: RegExp }> = [
  // Languages
  { name: 'TypeScript', re: /\btypescript\b/i },
  { name: 'JavaScript', re: /\bjavascript\b|\bjava\s?script\b/i },
  { name: 'Python', re: /\bpython(?!ic)\b/i },
  { name: 'Java', re: /\bjava\b(?!script)/i },
  { name: 'C++', re: /\bc\+\+\b/i },
  { name: 'C#', re: /\bc#\b|\bc\s*sharp\b/i },
  { name: 'Go', re: /\bgolang\b|\bgo\s?(?:lang|programming)\b/i },
  { name: 'Rust', re: /\brust\b(?!y)/i },
  { name: 'Ruby', re: /\bruby\b(?!on)/i },
  { name: 'PHP', re: /\bphp\b/i },
  { name: 'Kotlin', re: /\bkotlin\b/i },
  { name: 'Swift', re: /\bswift\b/i },
  { name: 'Scala', re: /\bscala\b/i },
  { name: 'SQL', re: /\bsql\b/i },
  { name: 'Bash', re: /\bbash\b|\bshell scripting\b|\bzsh\b/i },
  { name: 'HTML', re: /\bhtml5?\b/i },
  { name: 'CSS', re: /\bcss3?\b/i },
  { name: 'Solidity', re: /\bsolidity\b/i },

  // Frontend
  { name: 'React', re: /\breact(?:\.?js)?\b/i },
  { name: 'Next.js', re: /\bnext\.?js\b/i },
  { name: 'Vue.js', re: /\bvue(?:\.?js)?\b/i },
  { name: 'Angular', re: /\bangular(?:js)?\b/i },
  { name: 'Svelte', re: /\bsvelte\b/i },
  { name: 'Redux', re: /\bredux\b/i },
  { name: 'Tailwind CSS', re: /\btailwind(?:\s?css)?\b/i },
  { name: 'GraphQL', re: /\bgraphql\b/i },
  { name: 'REST APIs', re: /\brest(?:ful)?\s?(?:apis?|services?)?\b/i },
  { name: 'Sass', re: /\bsa(?:ss|scs)s\b/i },
  { name: 'Webpack', re: /\bwebpack\b/i },
  { name: 'Vite', re: /\bvite\b/i },
  { name: 'React Native', re: /\breact\s?native\b/i },
  { name: 'Flutter', re: /\bflutter\b/i },

  // Backend
  { name: 'Node.js', re: /\bnode(?:\.?js)?\b/i },
  { name: 'Express', re: /\bexpress(?:\.?js)?\b(?!ion)/i },
  { name: 'NestJS', re: /\bnest(?:\.?js)?\b/i },
  { name: 'Django', re: /\bdjango\b/i },
  { name: 'Flask', re: /\bflask\b/i },
  { name: 'FastAPI', re: /\bfastapi\b/i },
  { name: 'Spring Boot', re: /\bspring(?:\s?boot)?\b/i },
  { name: 'Laravel', re: /\blaravel\b/i },
  { name: 'Rails', re: /\brails\b|\bruby\s?on\s?rails\b/i },
  { name: '.NET', re: /\b\.?net\b(?:\score)?/i },
  { name: 'Microservices', re: /\bmicroservices?\b/i },

  // Databases & Data
  { name: 'PostgreSQL', re: /\bpostgres(?:ql|gres)?\b/i },
  { name: 'MySQL', re: /\bmysql\b|\bmariadb\b/i },
  { name: 'SQLite', re: /\bsqlite\b/i },
  { name: 'MongoDB', re: /\bmongo(?:db)?\b/i },
  { name: 'Redis', re: /\bredis\b/i },
  { name: 'Elasticsearch', re: /\belasticsearch\b/i },
  { name: 'Cassandra', re: /\bcassandra\b/i },
  { name: 'DynamoDB', re: /\bdynamodb\b/i },
  { name: 'Snowflake', re: /\bsnowflake\b/i },
  { name: 'BigQuery', re: /\bbigquery\b/i },
  { name: 'Kafka', re: /\bkafka\b/i },
  { name: 'RabbitMQ', re: /\brabbitmq\b/i },
  { name: 'Celery', re: /\bcelery\b/i },
  { name: 'Airflow', re: /\bairflow\b/i },
  { name: 'Spark', re: /\bapache?\s?spark\b|\bspark\b/i },
  { name: 'Hadoop', re: /\bhadoop\b/i },
  { name: 'dbt', re: /\bdbt\b/i },
  { name: 'Data Engineering', re: /\bdata\s?engineering\b|\betl\b|\bdata\s?pipelines?\b/i },

  // AI / ML
  { name: 'TensorFlow', re: /\btensorflow\b/i },
  { name: 'PyTorch', re: /\bpytorch\b/i },
  { name: 'Keras', re: /\bkeras\b/i },
  { name: 'scikit-learn', re: /\bscikit[-\s]?learn\b|\bsklearn\b/i },
  { name: 'Pandas', re: /\bpandas\b/i },
  { name: 'NumPy', re: /\bnumpy\b/i },
  { name: 'OpenCV', re: /\bopencv\b/i },
  { name: 'Hugging Face', re: /\bhugging\s?face\b/i },
  { name: 'LangChain', re: /\blangchain\b|\blanggraph\b/i },
  { name: 'LLMs', re: /\bllms?\b|\blarge\s?language\s?models?\b/i },
  { name: 'RAG', re: /\brag\b|\bretrieval\s?augmented\b/i },
  { name: 'NLP', re: /\bnlp\b|\bnatural\s?language\s?processing\b/i },
  { name: 'Computer Vision', re: /\bcomputer\s?vision\b/i },
  { name: 'Machine Learning', re: /\bmachine\s?learning\b/i },
  { name: 'Deep Learning', re: /\bdeep\s?learning\b|\bneural\s?networks?\b/i },
  { name: 'Prompt Engineering', re: /\bprompt\s?engineering\b/i },

  // Cloud & DevOps
  { name: 'AWS', re: /\baws\b|\bamazon\s?web\s?services\b/i },
  { name: 'Azure', re: /\bazure\b/i },
  { name: 'GCP', re: /\bgcp\b|\bgoogle\s?cloud\b/i },
  { name: 'Docker', re: /\bdocker\b/i },
  { name: 'Kubernetes', re: /\bkubernetes\b|\bk8s\b/i },
  { name: 'Terraform', re: /\bterraform\b/i },
  { name: 'Ansible', re: /\bansible\b/i },
  { name: 'Jenkins', re: /\bjenkins\b/i },
  { name: 'GitHub Actions', re: /\bgithub\s?(?:actions|workflows?)\b/i },
  { name: 'GitLab CI', re: /\bgitlab(?:\s?ci)?\b/i },
  { name: 'CI/CD', re: /\bci\s?\/?\s?cd\b|\bcontinuous\s?(?:integration|delivery|deployment)\b/i },
  { name: 'Linux', re: /\blinux\b|\bubuntu\b/i },
  { name: 'Nginx', re: /\bnginx\b/i },
  { name: 'Helm', re: /\bhelm\b/i },
  { name: 'Prometheus', re: /\bprometheus\b/i },
  { name: 'Grafana', re: /\bgrafana\b/i },
  { name: 'Datadog', re: /\bdatadog\b/i },
  { name: 'Cloudflare', re: /\bcloudflare\b/i },
  { name: 'Vercel', re: /\bvercel\b/i },
  { name: 'Serverless', re: /\bserverless\b|\blambda\b/i },

  // Tools & Practices
  { name: 'Git', re: /\bgit\b(?!hub|lab)/i },
  { name: 'GitHub', re: /\bgithub\b/i },
  { name: 'Jira', re: /\bjira\b/i },
  { name: 'Confluence', re: /\bconfluence\b/i },
  { name: 'Figma', re: /\bfigma\b/i },
  { name: 'Postman', re: /\bpostman\b/i },
  { name: 'Swagger', re: /\bswagger\b|\bopenapi\b/i },
  { name: 'Selenium', re: /\bselenium\b/i },
  { name: 'Cypress', re: /\bcypress\b/i },
  { name: 'Playwright', re: /\bplaywright\b/i },
  { name: 'Jest', re: /\bjest\b/i },
  { name: 'pytest', re: /\bpytest\b/i },
  { name: 'JUnit', re: /\bjunit\b/i },
  { name: 'Test Automation', re: /\btest\s?automation\b|\bunit\s?tests?\b|\bautomated\s?tests?\b/i },
  { name: 'Agile', re: /\bagile\b|\bscrum\b|\bkanban\b/i },
  { name: 'TDD', re: /\btdd\b|\btest\s?driven\b/i },
  { name: 'System Design', re: /\bsystem\s?design\b|\bdistributed\s?systems?\b/i },
  { name: 'Firebase', re: /\bfirebase\b/i },
  { name: 'Supabase', re: /\bsupabase\b/i },
  { name: 'Stripe', re: /\bstripe\b/i },
  { name: 'OAuth', re: /\boauth\b|\bjwt\b|\bjson\s?web\s?tokens?\b/i },
  { name: 'WebSockets', re: /\bweb\s?sockets?\b/i },
  { name: 'gRPC', re: /\bgrpc\b/i },
  { name: 'Android', re: /\bandroid\b/i },
  { name: 'iOS', re: /\bios\b(?!d)/i },
  { name: 'Unity', re: /\bunity\b/i },
];

const ROLE_KEYWORDS =
  /(engineer|developer|programmer|architect|manager|designer|analyst|scientist|consultant|administrator|intern|trainee|lead|head|director|specialist|associate|founder|co-?founder|cto|ceo|cto|vp\b|president|researcher|devops|sre|qa\b|full[-\s]?stack|backend|back[-\s]?end|frontend|front[-\s]?end)/i;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function countWords(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

/** Detects the candidate's name from the header block of the resume. */
export function extractName(lines: string[]): string | null {
  const noise =
    /(@|\bresume\b|\bcurriculum\b|\bc\.?v\.?\b|linkedin|github|https?:\/\/|\d{5,}|\+\d{2})/i;
  const nameRe =
    /^([A-Z][a-zA-Z'’\-]+(?: [A-Z]\.?)?(?: [A-Z][a-zA-Z'’\-]+){0,2}|[A-Z][a-zA-Z'’\-]+(?: [A-Z][a-zA-Z'’\-]+)?)$/;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line || noise.test(line)) continue;
    if (countWords(line) < 2 || countWords(line) > 4) continue;
    if (ROLE_KEYWORDS.test(line)) continue; // headline, not name
    if (nameRe.test(line)) return line;
  }
  // Fallback: first short clean line
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i].trim();
    if (line && line.length <= 40 && !noise.test(line) && !/\d/.test(line)) return line;
  }
  return null;
}

/** Detects the current professional headline (role/title line near the top). */
export function extractHeadline(lines: string[]): string | null {
  for (let i = 0; i < Math.min(lines.length, 14); i++) {
    const line = lines[i].trim();
    if (!line || countWords(line) > 10) continue;
    if (/@|https?:\/\/|\d{5,}/i.test(line)) continue;
    if (/\b(experience|education|skills|projects?|summary)\b/i.test(line)) continue;
    if (ROLE_KEYWORDS.test(line)) return line.replace(/^[-•*|]+\s*/, '').trim();
  }
  return null;
}

export function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
  return m ? m[0] : null;
}

export function extractPhone(text: string): string | null {
  // Runs of 9-13 digits allowing spaces/dots/dashes, with optional country code.
  const m = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){9,13}\d/);
  if (!m) return null;
  const candidate = m[0].trim();
  const digitCount = candidate.replace(/\D/g, '').length;
  return digitCount >= 10 && digitCount <= 13 ? candidate : null;
}

// ============================================================================
// Skills extraction (frequency-based, taxonomy matching)
// ============================================================================

export function extractSkills(text: string): ParsedSkill[] {
  const found: ParsedSkill[] = [];
  for (const { name, re } of SKILL_TAXONOMY) {
    const matches = text.match(new RegExp(re.source, 'gi'));
    if (matches && matches.length > 0) {
      const frequency = matches.length;
      const proficiency =
        frequency >= 4 ? 'EXPERT' : frequency >= 2 ? 'ADVANCED' : 'INTERMEDIATE';
      found.push({
        skill_name: name,
        normalized_skill: normalizeSkill(name),
        proficiency,
        frequency,
      });
    }
  }
  // Skills seen earlier in the resume (skills section) are more meaningful —
  // order by frequency then by first appearance position for stable output.
  const firstIndex = (s: ParsedSkill) => {
    const m = text.match(new RegExp(SKILL_TAXONOMY.find((t) => t.name === s.skill_name)!.re.source, 'i'));
    return m ? (m.index ?? 9999) : 9999;
  };
  return found
    .sort((a, b) => b.frequency - a.frequency || firstIndex(a) - firstIndex(b))
    .slice(0, 24);
}

// ============================================================================
// Work experience extraction (title/company + date ranges)
// ============================================================================

const DATE_RANGE_RE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?((?:19|20)\d{2}|present|current|till\s*date|now)/i;

function monthTokenToIndex(token: string | undefined): number | null {
  if (!token) return null;
  const clean = token.trim().toLowerCase().replace(/\./g, '');
  for (const key of Object.keys(MONTHS)) {
    if (clean.startsWith(key.slice(0, 3))) return MONTHS[key];
  }
  return null;
}

function computeDurationYears(start: string, end: string): number {
  const now = new Date();
  const sm = start.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?((?:19|20)\d{2})/i);
  if (!sm) return 0;
  const startMonth = monthTokenToIndex(sm[1]) ?? 0;
  const startYear = Number(sm[2]);
  let endYear: number;
  let endMonth: number;
  if (/present|current|now|till/i.test(end)) {
    endYear = now.getFullYear();
    endMonth = now.getMonth();
  } else {
    const em = end.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?((?:19|20)\d{2})/i);
    if (!em) return 0;
    endYear = Number(em[2]);
    endMonth = monthTokenToIndex(em[1]) ?? 11;
  }
  const months = Math.max(0, (endYear - startYear) * 12 + (endMonth - startMonth));
  return Math.round((months / 12) * 10) / 10;
}

/** Splits "Senior Software Engineer | Acme Corp" / "Engineer at Acme" / "Acme — Engineer". */
function splitTitleCompany(prefix: string): { title: string | null; company: string | null } {
  const cleaned = prefix.replace(/^[-•*|]+\s*/, '').trim();
  if (!cleaned) return { title: null, company: null };

  const parts = cleaned
    .split(/\s*(?:\||•|—|–|,|:|\bat\b|\b@\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const a = parts[0];
    const b = parts.slice(1).join(' ');
    if (ROLE_KEYWORDS.test(a) && !ROLE_KEYWORDS.test(b)) return { title: a, company: b };
    if (ROLE_KEYWORDS.test(b) && !ROLE_KEYWORDS.test(a)) return { title: b, company: a };
    // Assume "Title, Company" ordering convention
    return { title: a, company: b };
  }
  if (ROLE_KEYWORDS.test(cleaned)) return { title: cleaned, company: null };
  return { title: null, company: cleaned };
}

export function extractWorkExperience(text: string): {
  entries: ParsedWorkExperience[];
  earliest_start: string | null;
} {
  const lines = text.split(/\r?\n/);
  const entries: ParsedWorkExperience[] = [];
  let earliestKey: number | null = null;
  let earliest_start: string | null = null;

  const dateKey = (startDate: string): number | null => {
    const m = startDate.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?((?:19|20)\d{2})/i);
    if (!m) return null;
    const month = monthTokenToIndex(m[1]) ?? 0;
    return Number(m[2]) * 12 + month;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length > 160) continue;
    const dm = line.match(DATE_RANGE_RE);
    if (!dm) continue;

    const startDate = `${dm[1] ? dm[1].trim() + ' ' : ''}${dm[2]}`.trim();
    const endDate = dm[4] ? `${dm[3] ? dm[3].trim() + ' ' : ''}${dm[4]}`.trim() : dm[2];
    const duration = computeDurationYears(startDate, dm[4] || dm[2]);

    // Prefix = everything before the date range
    const prefix = line.slice(0, dm.index ?? 0).replace(/[-–—|•,]\s*$/, '').trim();
    const suffix = line.slice((dm.index ?? 0) + dm[0].length).replace(/^[-–—|•,]\s*/, '').trim();
    const source = prefix.length >= 3 ? prefix : suffix;
    const { title, company } = splitTitleCompany(source);

    if (!title && !company) continue;
    // Skip education date lines
    if (/b\.?tech|bachelor|master|university|college|class\s*(x{1,3}i*|\d{2})/i.test(line)) continue;

    entries.push({
      company: company ? company.slice(0, 80) : null,
      title: title ? title.slice(0, 80) : null,
      start: startDate,
      end: /present|current|now|till/i.test(dm[4] || '') ? 'Present' : endDate,
      current: /present|current|now|till/i.test(dm[4] || ''),
      duration_years: duration,
    });

    const key = dateKey(startDate);
    if (key !== null && (earliestKey === null || key < earliestKey)) {
      earliestKey = key;
      earliest_start = startDate;
    }
  }

  return { entries: entries.slice(0, 12), earliest_start };
}

// ============================================================================
// Education extraction
// ============================================================================

const DEGREE_RE =
  /\b(b\.?tech|b\.?e\b|bachelor(?:'s)?|b\.?sc\b|b\.?com\b|master(?:'s)?|m\.?tech|m\.?s\b|m\.?sc\b|m\.?com\b|mba|mca|bca|ph\.?d|doctorate|diploma|high\s?school|senior\s?secondary|secondary\s?school)\b/i;
const INSTITUTION_RE =
  /\b(university|college|institute|academy|school|iit\b|nit\b|iiit\b|bits\b|iim\b)\b/i;
const YEAR_RE = /\b((?:19|20)\d{2})\b/;

export function extractEducation(text: string): ParsedEducation[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const entries: ParsedEducation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length > 160) continue;
    const dm = line.match(DEGREE_RE);
    if (!dm) continue;

    // Institution may be on the same line or the neighboring line
    let institution: string | null = null;
    if (INSTITUTION_RE.test(line)) institution = line;
    else {
      for (const j of [i - 1, i + 1, i - 2, i + 2]) {
        const n = lines[j];
        if (n && n.length <= 120 && INSTITUTION_RE.test(n)) {
          institution = n;
          break;
        }
      }
    }

    const ym = line.match(YEAR_RE);
    entries.push({
      degree: dm[0].replace(/\.\s?/g, (m) => m.trim()).toUpperCase().slice(0, 60),
      institution: institution ? institution.slice(0, 120) : null,
      year: ym ? ym[1] : null,
    });
    if (entries.length >= 6) break;
  }
  return entries;
}

// ============================================================================
// Experience years
// ============================================================================

export function extractExperienceYears(
  text: string,
  earliestStart: string | null
): { years: number; source: 'stated' | 'computed' | 'default' } {
  // 1) Direct phrase: "3+ years of experience"
  const phraseRe =
    /(\d{1,2})(?:\s*\+)?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:professional\s*)?(?:hands[-\s]on\s*)?(?:work(?:ing)?\s*)?experience/gi;
  let best = 0;
  for (const m of text.matchAll(phraseRe)) {
    const n = Number(m[1]);
    if (n > best && n <= 40) best = n;
  }
  if (best > 0) return { years: best, source: 'stated' };

  // 2) Computed from earliest dated entry
  if (earliestStart) {
    const ym = earliestStart.match(
      /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*)?((?:19|20)\d{2})/i
    );
    if (ym) {
      const month = monthTokenToIndex(ym[1]) ?? 0;
      const span =
        (Date.now() - new Date(Number(ym[2]), month, 1).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (span > 0.4) return { years: Math.round(span * 10) / 10, source: 'computed' };
    }
  }
  return { years: 0, source: 'default' };
}

// ============================================================================
// Summary derivation
// ============================================================================

function deriveSummary(parsed: {
  headline: string | null;
  experience_years: number;
  skills: ParsedSkill[];
  work_experience: ParsedWorkExperience[];
  education: ParsedEducation[];
}): string {
  const parts: string[] = [];
  const role = parsed.headline || 'Software professional';
  const years =
    parsed.experience_years > 0 ? `${parsed.experience_years} years of experience` : 'professional experience';
  parts.push(`${role} with ${years}.`);
  const topSkills = parsed.skills.slice(0, 6).map((s) => s.skill_name);
  if (topSkills.length > 0) parts.push(`Core stack: ${topSkills.join(', ')}.`);
  const current = parsed.work_experience.find((w) => w.current) || parsed.work_experience[0];
  if (current && (current.title || current.company)) {
    parts.push(
      `Most recently: ${current.title || 'engineer'}${current.company ? ` at ${current.company}` : ''}.`
    );
  }
  const latestEdu = parsed.education[0];
  if (latestEdu) {
    parts.push(
      `Education: ${latestEdu.degree}${latestEdu.institution ? ` — ${latestEdu.institution}` : ''}${latestEdu.year ? ` (${latestEdu.year})` : ''}.`
    );
  }
  return parts.join(' ');
}

// ============================================================================
// Public entrypoint
// ============================================================================

export function parseResumeText(rawText: string): ParsedResume {
  // Normalize: strip bullet artifacts, collapse excessive blank lines
  const text = rawText
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2022\u25cf\u25aa\u00b7]/g, '-')
    .slice(0, 80_000);

  const lines = text.split('\n');
  const full_name = extractName(lines);
  const headline = extractHeadline(lines);
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const skills = extractSkills(text);
  const { entries: work_experience, earliest_start } = extractWorkExperience(text);
  const education = extractEducation(text);
  const { years, source } = extractExperienceYears(text, earliest_start);

  const parsed: ParsedResume = {
    full_name,
    headline,
    email,
    phone,
    experience_years: years,
    experience_years_source: source,
    skills,
    work_experience,
    education,
    summary: '',
  };
  parsed.summary = deriveSummary(parsed);
  return parsed;
}
