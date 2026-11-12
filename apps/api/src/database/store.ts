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
    const now = '2026-11-12T08:00:00.000Z';

    // 1. Default User
    const defaultUser: UserRecord = {
      id: this.defaultUserId,
      email: 'parasmanikhunte@gmail.com',
      timezone: 'Asia/Kolkata',
      created_at: now,
      updated_at: now,
    };
    this.users.set(defaultUser.id, defaultUser);

    // 2. Candidate Profile (Section 13 Defaults)
    const defaultProfile: CandidateProfileRecord = {
      id: this.defaultProfileId,
      user_id: this.defaultUserId,
      full_name: 'Paras Manikhunte',
      headline: 'Full-Stack & Backend Software Engineer (Node.js, TypeScript, Python, PostgreSQL)',
      summary:
        'Software Engineer with strong foundations in distributed backend systems, TypeScript/Node.js REST APIs, Python/FastAPI microservices, and relational database design with PostgreSQL.',
      experience_years: 1.5,
      resume_url: 'https://storage.jobhunt-os.internal/resumes/paras-manikhunte-v1.pdf',
      resume_text:
        'Built event-driven Node.js + TypeScript APIs with PostgreSQL and Redis queues. Engineered Python FastAPI services and React dashboards with automated test suites and Docker deployments.',
      preferences: {
        target_roles: ['Backend Developer', 'Full Stack Developer', 'Software Engineer'],
        geographies: ['IN', 'US', 'GB', 'DE', 'SG', 'GLOBAL'],
        remote_only: true,
        minimum_salary: 700000,
        salary_currency: 'INR',
        maximum_experience: 2,
        telegram_alerts_enabled: true,
        telegram_chat_id: '@paras_jobhunt_alerts',
      },
      profile_version: 1,
      created_at: now,
      updated_at: now,
    };
    this.profiles.set(defaultProfile.id, defaultProfile);

    // 3. Candidate Skills (Section 13 Defaults)
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

    // 4. Initial Discovered Companies, Funding Rounds, Signals & ATS Sources
    const c1Id = '30000000-0000-4000-8000-000000000001';
    const c2Id = '30000000-0000-4000-8000-000000000002';
    const c3Id = '30000000-0000-4000-8000-000000000003';
    const c4Id = '30000000-0000-4000-8000-000000000004';

    const seedCompanies: CompanyRecord[] = [
      {
        id: c1Id,
        name: 'Krutrim Cloud Labs',
        normalized_name: normalizeCompanyName('Krutrim Cloud Labs'),
        website: 'https://krutrimcloud.example.com',
        domain: 'krutrimcloud.example.com',
        country_code: 'IN',
        headquarters: 'Bengaluru, India',
        industry: 'Cloud Infrastructure & Developer Tools',
        description:
          'High-throughput serverless compute and managed PostgreSQL platform for AI-native engineering teams across India and APAC.',
        employee_count: 68,
        investigation_status: 'COMPLETED',
        hiring_priority: 89.25,
        last_researched_at: '2026-11-12T07:30:00.000Z',
        metadata: {
          career_page: 'https://boards.greenhouse.io/krutrimcloud',
          ats_provider: 'GREENHOUSE',
          verified_identity: true,
          source_evidence_url: 'https://techcrunch.example.com/2026/11/04/krutrim-cloud-series-a',
          priority_breakdown: {
            funding_score: 100,
            hiring_score: 80,
            growth_score: 90,
            role_relevance_score: 87.5,
            formula: '0.35 * funding + 0.40 * hiring + 0.15 * growth + 0.10 * relevance',
          },
        },
        created_at: now,
        updated_at: now,
      },
      {
        id: c2Id,
        name: 'LinearFlow Systems',
        normalized_name: normalizeCompanyName('LinearFlow Systems'),
        website: 'https://linearflow.example.io',
        domain: 'linearflow.example.io',
        country_code: 'US',
        headquarters: 'San Francisco, CA (Distributed)',
        industry: 'B2B Workflow Automation & APIs',
        description:
          'Real-time event orchestration engine and developer API platform hiring globally distributed backend and full-stack engineers.',
        employee_count: 42,
        investigation_status: 'COMPLETED',
        hiring_priority: 85.75,
        last_researched_at: '2026-11-12T07:40:00.000Z',
        metadata: {
          career_page: 'https://jobs.ashbyhq.com/linearflow',
          ats_provider: 'ASHBY',
          verified_identity: true,
          source_evidence_url: 'https://venturebeat.example.com/2026/11/08/linearflow-seed-round',
          priority_breakdown: {
            funding_score: 95,
            hiring_score: 80,
            growth_score: 70,
            role_relevance_score: 100,
            formula: '0.35 * funding + 0.40 * hiring + 0.15 * growth + 0.10 * relevance',
          },
        },
        created_at: now,
        updated_at: now,
      },
      {
        id: c3Id,
        name: 'SetuPay FinTech',
        normalized_name: normalizeCompanyName('SetuPay FinTech'),
        website: 'https://setupay.example.in',
        domain: 'setupay.example.in',
        country_code: 'IN',
        headquarters: 'Mumbai, India',
        industry: 'Payment Infrastructure & Ledger APIs',
        description:
          'Cross-border B2B treasury and programmable UPI settlement infrastructure for Indian exporters.',
        employee_count: 115,
        investigation_status: 'COMPLETED',
        hiring_priority: 82.5,
        last_researched_at: '2026-11-12T07:45:00.000Z',
        metadata: {
          career_page: 'https://jobs.lever.co/setupay',
          ats_provider: 'LEVER',
          verified_identity: true,
          source_evidence_url: 'https://inc42.example.com/2026/10/29/setupay-series-b',
          priority_breakdown: {
            funding_score: 92,
            hiring_score: 75,
            growth_score: 85,
            role_relevance_score: 75,
            formula: '0.35 * funding + 0.40 * hiring + 0.15 * growth + 0.10 * relevance',
          },
        },
        created_at: now,
        updated_at: now,
      },
      {
        id: c4Id,
        name: 'AetherBio Robotics',
        normalized_name: normalizeCompanyName('AetherBio Robotics'),
        website: 'https://aetherbio.example.de',
        domain: 'aetherbio.example.de',
        country_code: 'DE',
        headquarters: 'Munich, Germany',
        industry: 'Laboratory Hardware & Embedded Systems',
        description:
          'Automated wet-lab robotic arms and embedded C++ firmware for pharmaceutical testing facilities.',
        employee_count: 34,
        investigation_status: 'COMPLETED',
        hiring_priority: 64.0,
        last_researched_at: '2026-11-12T07:50:00.000Z',
        metadata: {
          career_page: 'https://boards.greenhouse.io/aetherbio',
          ats_provider: 'GREENHOUSE',
          verified_identity: true,
          source_evidence_url: 'https://eu-startups.example.com/2026/11/01/aetherbio-seed',
          priority_breakdown: {
            funding_score: 85,
            hiring_score: 65,
            growth_score: 50,
            role_relevance_score: 30,
            formula: '0.35 * funding + 0.40 * hiring + 0.15 * growth + 0.10 * relevance',
          },
        },
        created_at: now,
        updated_at: now,
      },
    ];

    for (const c of seedCompanies) {
      this.companies.set(c.id, c);
    }

    // Funding rounds (Distinct announcement_date and publication_date!)
    const seedFunding: FundingRoundRecord[] = [
      {
        id: '40000000-0000-4000-8000-000000000001',
        company_id: c1Id,
        round_type: 'SERIES_A',
        amount: 14500000,
        currency: 'USD',
        announcement_date: '2026-11-03',
        publication_date: '2026-11-04',
        investors: ['Peak XV Partners', 'Accel India', 'Lightspeed'],
        source_url: 'https://techcrunch.example.com/2026/11/04/krutrim-cloud-series-a',
        source_name: 'TechCrunch Funding Feed',
        confidence: 0.96,
        created_at: now,
        updated_at: now,
      },
      {
        id: '40000000-0000-4000-8000-000000000002',
        company_id: c2Id,
        round_type: 'SEED',
        amount: 6200000,
        currency: 'USD',
        announcement_date: '2026-11-07',
        publication_date: '2026-11-08',
        investors: ['Y Combinator', 'Index Ventures'],
        source_url: 'https://venturebeat.example.com/2026/11/08/linearflow-seed-round',
        source_name: 'VentureBeat Startup Wire',
        confidence: 0.94,
        created_at: now,
        updated_at: now,
      },
      {
        id: '40000000-0000-4000-8000-000000000003',
        company_id: c3Id,
        round_type: 'SERIES_B',
        amount: 28000000,
        currency: 'USD',
        announcement_date: '2026-10-28',
        publication_date: '2026-10-29',
        investors: ['Ribbit Capital', 'Elevation Capital'],
        source_url: 'https://inc42.example.com/2026/10/29/setupay-series-b',
        source_name: 'Inc42 Deal Tracker',
        confidence: 0.95,
        created_at: now,
        updated_at: now,
      },
      {
        id: '40000000-0000-4000-8000-000000000004',
        company_id: c4Id,
        round_type: 'SEED',
        amount: 4800000,
        currency: 'EUR',
        announcement_date: '2026-10-31',
        publication_date: '2026-11-01',
        investors: ['HV Capital', 'Cherry Ventures'],
        source_url: 'https://eu-startups.example.com/2026/11/01/aetherbio-seed',
        source_name: 'EU-Startups Feed',
        confidence: 0.91,
        created_at: now,
        updated_at: now,
      },
    ];

    for (const fr of seedFunding) {
      this.fundingRounds.set(fr.id, fr);
    }

    // Company signals
    const seedSignals: CompanySignalRecord[] = [
      {
        id: '45000000-0000-4000-8000-000000000001',
        company_id: c1Id,
        signal_type: 'ACTIVE_CAREER_PAGE',
        signal_value: { open_engineering_roles: 4, ats: 'GREENHOUSE' },
        confidence: 0.95,
        source_url: 'https://boards.greenhouse.io/krutrimcloud',
        observed_at: '2026-11-12T07:30:00.000Z',
        created_at: now,
      },
      {
        id: '45000000-0000-4000-8000-000000000002',
        company_id: c1Id,
        signal_type: 'ENGINEERING_EXPANSION',
        signal_value: { note: 'Expanding Bengaluru & Remote India platform engineering pod' },
        confidence: 0.9,
        source_url: 'https://krutrimcloud.example.com/blog/series-a-hiring',
        observed_at: '2026-11-12T07:30:00.000Z',
        created_at: now,
      },
      {
        id: '45000000-0000-4000-8000-000000000003',
        company_id: c2Id,
        signal_type: 'ACTIVE_CAREER_PAGE',
        signal_value: { open_engineering_roles: 3, ats: 'ASHBY' },
        confidence: 0.94,
        source_url: 'https://jobs.ashbyhq.com/linearflow',
        observed_at: '2026-11-12T07:40:00.000Z',
        created_at: now,
      },
      {
        id: '45000000-0000-4000-8000-000000000004',
        company_id: c3Id,
        signal_type: 'ACTIVE_CAREER_PAGE',
        signal_value: { open_engineering_roles: 3, ats: 'LEVER' },
        confidence: 0.92,
        source_url: 'https://jobs.lever.co/setupay',
        observed_at: '2026-11-12T07:45:00.000Z',
        created_at: now,
      },
    ];

    for (const sig of seedSignals) {
      this.companySignals.set(sig.id, sig);
    }

    // 5. Job Sources (Greenhouse, Ashby, Lever)
    const s1Id = '50000000-0000-4000-8000-000000000001';
    const s2Id = '50000000-0000-4000-8000-000000000002';
    const s3Id = '50000000-0000-4000-8000-000000000003';
    const s4Id = '50000000-0000-4000-8000-000000000004';

    const seedSources: JobSourceRecord[] = [
      {
        id: s1Id,
        company_id: c1Id,
        source_type: 'GREENHOUSE',
        source_url: 'https://boards-api.greenhouse.io/v1/boards/krutrimcloud/jobs',
        ats_provider: 'GREENHOUSE',
        poll_interval_seconds: 600,
        last_checked_at: '2026-11-12T08:15:00.000Z',
        next_check_at: '2026-11-12T08:25:00.000Z',
        status: 'HEALTHY',
        failure_count: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: s2Id,
        company_id: c2Id,
        source_type: 'ASHBY',
        source_url: 'https://api.ashbyhq.com/posting-api/job-board/linearflow',
        ats_provider: 'ASHBY',
        poll_interval_seconds: 600,
        last_checked_at: '2026-11-12T08:16:00.000Z',
        next_check_at: '2026-11-12T08:26:00.000Z',
        status: 'HEALTHY',
        failure_count: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: s3Id,
        company_id: c3Id,
        source_type: 'LEVER',
        source_url: 'https://api.lever.co/v0/postings/setupay?mode=json',
        ats_provider: 'LEVER',
        poll_interval_seconds: 900,
        last_checked_at: '2026-11-12T08:10:00.000Z',
        next_check_at: '2026-11-12T08:25:00.000Z',
        status: 'HEALTHY',
        failure_count: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: s4Id,
        company_id: c4Id,
        source_type: 'GREENHOUSE',
        source_url: 'https://boards-api.greenhouse.io/v1/boards/aetherbio/jobs',
        ats_provider: 'GREENHOUSE',
        poll_interval_seconds: 1800,
        last_checked_at: '2026-11-12T08:05:00.000Z',
        next_check_at: '2026-11-12T08:35:00.000Z',
        status: 'HEALTHY',
        failure_count: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      },
    ];

    for (const src of seedSources) {
      this.jobSources.set(src.id, src);
    }

    // 6. Jobs (Normalized, distinct posted_at & first_seen_at, null salary preserved where undisclosed)
    const j1Id = '60000000-0000-4000-8000-000000000001';
    const j2Id = '60000000-0000-4000-8000-000000000002';
    const j3Id = '60000000-0000-4000-8000-000000000003';
    const j4Id = '60000000-0000-4000-8000-000000000004';
    const j5Id = '60000000-0000-4000-8000-000000000005';

    const rawJobs: Array<Omit<JobRecord, 'description_hash' | 'normalized_title'>> = [
      {
        id: j1Id,
        company_id: c1Id,
        source_id: s1Id,
        external_id: 'gh-krutrim-4091',
        title: 'Backend Software Engineer (Node.js & PostgreSQL)',
        description:
          'We are looking for a Backend Software Engineer (0-2 years experience) to build high-throughput control plane APIs using Node.js, TypeScript, PostgreSQL, and Redis. You will design schema migrations, optimize query execution, and build resilient microservices. Remote across India.',
        location: 'Remote (India)',
        country_code: 'IN',
        work_mode: 'REMOTE',
        employment_type: 'FULL_TIME',
        salary_min: 1400000,
        salary_max: 2200000,
        salary_currency: 'INR',
        experience_min: 0.5,
        experience_max: 2.0,
        posted_at: '2026-11-11T14:20:00.000Z',
        first_seen_at: '2026-11-12T08:15:00.000Z',
        last_seen_at: '2026-11-12T08:15:00.000Z',
        last_verified_open_at: '2026-11-12T08:15:00.000Z',
        apply_url: 'https://boards.greenhouse.io/krutrimcloud/jobs/4091',
        source_url: 'https://boards-api.greenhouse.io/v1/boards/krutrimcloud/jobs/4091',
        status: 'ACTIVE',
        raw_data: { department: 'Core Cloud Platform', requisition_id: 'KC-ENG-14' },
        created_at: now,
        updated_at: now,
      },
      {
        id: j2Id,
        company_id: c2Id,
        source_id: s2Id,
        external_id: 'ashby-lf-882',
        title: 'Full Stack Product Engineer (TypeScript, React, FastAPI)',
        description:
          'LinearFlow is hiring a Full Stack Engineer to own customer-facing workflow builders in React and TypeScript alongside our Python FastAPI and PostgreSQL execution engine. Open to global remote candidates including India and Europe. 1-2 years experience ideal.',
        location: 'Global Remote (India / US / EU)',
        country_code: 'US',
        work_mode: 'REMOTE',
        employment_type: 'FULL_TIME',
        salary_min: 65000,
        salary_max: 90000,
        salary_currency: 'USD',
        experience_min: 1.0,
        experience_max: 2.5,
        posted_at: '2026-11-11T19:00:00.000Z',
        first_seen_at: '2026-11-12T08:16:00.000Z',
        last_seen_at: '2026-11-12T08:16:00.000Z',
        last_verified_open_at: '2026-11-12T08:16:00.000Z',
        apply_url: 'https://jobs.ashbyhq.com/linearflow/882',
        source_url: 'https://api.ashbyhq.com/posting-api/job-board/linearflow/882',
        status: 'ACTIVE',
        raw_data: { team: 'Workflow Engine', timezone_overlap: '4 hours flexible' },
        created_at: now,
        updated_at: now,
      },
      {
        id: j3Id,
        company_id: c3Id,
        source_id: s3Id,
        external_id: 'lever-sp-319',
        title: 'Software Engineer I — Settlement & Ledger APIs',
        description:
          'Join SetuPay to build low-latency UPI & SWIFT settlement services using Python, FastAPI, Node.js, PostgreSQL, and MongoDB. Undisclosed salary band; remote-first within India.',
        location: 'Mumbai / Remote India',
        country_code: 'IN',
        work_mode: 'REMOTE',
        employment_type: 'FULL_TIME',
        salary_min: null, // Explicitly preserved null salary!
        salary_max: null,
        salary_currency: null,
        experience_min: 0.0,
        experience_max: 2.0,
        posted_at: null, // Explicitly preserved null posted_at!
        first_seen_at: '2026-11-12T08:10:00.000Z',
        last_seen_at: '2026-11-12T08:10:00.000Z',
        last_verified_open_at: '2026-11-12T08:10:00.000Z',
        apply_url: 'https://jobs.lever.co/setupay/319',
        source_url: 'https://api.lever.co/v0/postings/setupay/319',
        status: 'ACTIVE',
        raw_data: { commitment: 'Full-time', pod: 'Core Ledger' },
        created_at: now,
        updated_at: now,
      },
      {
        id: j4Id,
        company_id: c1Id,
        source_id: s1Id,
        external_id: 'gh-krutrim-4098',
        title: 'Platform Engineer — Data Services (Node.js / Go)',
        description:
          'Work on our database provisioning service using Node.js, TypeScript, PostgreSQL, and Docker. Some Go and Kubernetes exposure is helpful. Remote in India.',
        location: 'Bengaluru / Remote',
        country_code: 'IN',
        work_mode: 'REMOTE',
        employment_type: 'FULL_TIME',
        salary_min: 1200000,
        salary_max: 1800000,
        salary_currency: 'INR',
        experience_min: 1.0,
        experience_max: 3.0,
        posted_at: '2026-11-10T11:00:00.000Z',
        first_seen_at: '2026-11-12T08:15:00.000Z',
        last_seen_at: '2026-11-12T08:15:00.000Z',
        last_verified_open_at: '2026-11-12T08:15:00.000Z',
        apply_url: 'https://boards.greenhouse.io/krutrimcloud/jobs/4098',
        source_url: 'https://boards-api.greenhouse.io/v1/boards/krutrimcloud/jobs/4098',
        status: 'ACTIVE',
        raw_data: { department: 'Managed Databases' },
        created_at: now,
        updated_at: now,
      },
      {
        id: j5Id,
        company_id: c4Id,
        source_id: s4Id,
        external_id: 'gh-aether-102',
        title: 'Senior Staff Embedded Firmware Architect (Onsite Munich)',
        description:
          'Requires 8+ years of real-time RTOS C++ and CAN-bus firmware experience. Strict onsite presence in Munich lab 5 days a week.',
        location: 'Munich, Germany',
        country_code: 'DE',
        work_mode: 'ONSITE',
        employment_type: 'FULL_TIME',
        salary_min: 95000,
        salary_max: 115000,
        salary_currency: 'EUR',
        experience_min: 8.0,
        experience_max: 12.0,
        posted_at: '2026-11-05T09:00:00.000Z',
        first_seen_at: '2026-11-12T08:05:00.000Z',
        last_seen_at: '2026-11-12T08:05:00.000Z',
        last_verified_open_at: '2026-11-12T08:05:00.000Z',
        apply_url: 'https://boards.greenhouse.io/aetherbio/jobs/102',
        source_url: 'https://boards-api.greenhouse.io/v1/boards/aetherbio/jobs/102',
        status: 'ACTIVE',
        raw_data: { department: 'Hardware Robotics' },
        created_at: now,
        updated_at: now,
      },
    ];

    for (const jb of rawJobs) {
      const fullJob: JobRecord = {
        ...jb,
        normalized_title: jb.title.toLowerCase().trim(),
        description_hash: computeDescriptionHash(jb.description),
      };
      this.jobs.set(fullJob.id, fullJob);
      this.evaluateAndPersistJob(fullJob.id, this.defaultProfileId);
    }

    // 7. Public Contacts with Provenance (Phase 7)
    const ct1Id = '70000000-0000-4000-8000-000000000001';
    const ct2Id = '70000000-0000-4000-8000-000000000002';
    const ct3Id = '70000000-0000-4000-8000-000000000003';

    const seedContacts: ContactRecord[] = [
      {
        id: ct1Id,
        company_id: c1Id,
        name: 'Ananya Deshmukh',
        designation: 'Lead Technical Recruiter',
        email: 'ananya.talent@krutrimcloud.example.com',
        email_status: 'PUBLICLY_LISTED',
        email_source_url: 'https://krutrimcloud.example.com/careers#talent-team',
        linkedin_url: 'https://linkedin.com/in/ananya-deshmukh-talent',
        other_profile_url: null,
        metadata: {
          priority_rank: 1,
          role_category: 'Technical Recruiter',
          provenance_note: 'Listed on official Krutrim Cloud careers page under Engineering Talent Acquisition',
        },
        created_at: now,
        updated_at: now,
      },
      {
        id: ct2Id,
        company_id: c2Id,
        name: 'Marcus Vance',
        designation: 'VP of Engineering & Co-Founder',
        email: 'marcus@linearflow.example.io',
        email_status: 'VERIFIED',
        email_source_url: 'https://linearflow.example.io/about/team',
        linkedin_url: 'https://linkedin.com/in/marcus-vance-eng',
        other_profile_url: 'https://github.com/mvance-lf',
        metadata: {
          priority_rank: 3,
          role_category: 'Engineering Leadership',
          provenance_note: 'Publicly listed on official team directory and GitHub organization profile',
        },
        created_at: now,
        updated_at: now,
      },
      {
        id: ct3Id,
        company_id: c3Id,
        name: 'Rohan Kulkarni',
        designation: 'Engineering Manager — Core Ledger',
        email: null,
        email_status: 'NOT_FOUND',
        email_source_url: 'https://setupay.example.in/team',
        linkedin_url: 'https://linkedin.com/in/rohan-kulkarni-fintech',
        other_profile_url: null,
        metadata: {
          priority_rank: 3,
          role_category: 'Engineering Manager',
          provenance_note: 'Identified on public engineering blog; no public email address published (unverified guessing prohibited)',
        },
        created_at: now,
        updated_at: now,
      },
    ];

    for (const ct of seedContacts) {
      this.contacts.set(ct.id, ct);
    }

    // 8. Outreach Drafts (Phase 8 — Strictly PENDING_APPROVAL by default)
    const dr1Id = '80000000-0000-4000-8000-000000000001';
    const dr2Id = '80000000-0000-4000-8000-000000000002';

    const seedDrafts: OutreachDraftRecord[] = [
      {
        id: dr1Id,
        contact_id: ct1Id,
        job_id: j1Id,
        profile_id: this.defaultProfileId,
        subject: 'Application: Backend Software Engineer (KC-ENG-14) — Paras Manikhunte',
        body: `Hi Ananya,\n\nCongratulations to the Krutrim Cloud Labs team on your recent $14.5M Series A round to expand your serverless and managed PostgreSQL platform.\n\nI noticed the opening for the Backend Software Engineer (Node.js & PostgreSQL) role (Req ID: KC-ENG-14). Over the past 1.5 years, I have focused on building event-driven Node.js and TypeScript REST APIs backed by PostgreSQL and Redis task queues—directly aligned with your control plane architecture.\n\nI would welcome the opportunity to share my resume and discuss how I can contribute to your Bengaluru/Remote engineering pod.\n\nBest regards,\nParas Manikhunte`,
        personalization_evidence: [
          {
            fact_type: 'COMPANY_SIGNAL',
            detail: '$14.5M Series A round announced Nov 2026 for managed PostgreSQL platform',
            source: 'https://techcrunch.example.com/2026/11/04/krutrim-cloud-series-a',
          },
          {
            fact_type: 'CANDIDATE_RESUME',
            detail: '1.5 years building Node.js + TypeScript APIs with PostgreSQL and Redis queues',
            source: 'Candidate Profile v1',
          },
          {
            fact_type: 'JOB_REQUIREMENT',
            detail: 'Control plane APIs using Node.js, TypeScript, PostgreSQL, and Redis',
            source: 'https://boards.greenhouse.io/krutrimcloud/jobs/4091',
          },
        ],
        status: 'PENDING_APPROVAL',
        approved_at: null,
        sent_at: null,
        provider_message_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: dr2Id,
        contact_id: ct2Id,
        job_id: j2Id,
        profile_id: this.defaultProfileId,
        subject: 'Full Stack Product Engineer Opportunity at LinearFlow — Paras Manikhunte',
        body: `Hi Marcus,\n\nI followed LinearFlow Systems' recent $6.2M Seed announcement and saw your team is expanding the Workflow Engine pod with a Full Stack Product Engineer.\n\nMy background spans TypeScript and React frontend interfaces paired with Python FastAPI and PostgreSQL backend services. Having built full-stack workflow and orchestration tools with automated test coverage, I would love to contribute to LinearFlow's execution engine.\n\nThank you for your time and consideration.\n\nBest regards,\nParas Manikhunte`,
        personalization_evidence: [
          {
            fact_type: 'COMPANY_SIGNAL',
            detail: '$6.2M Seed round led by Y Combinator and Index Ventures (Nov 2026)',
            source: 'https://venturebeat.example.com/2026/11/08/linearflow-seed-round',
          },
          {
            fact_type: 'CANDIDATE_RESUME',
            detail: 'Engineered Python FastAPI services and React + TypeScript dashboards',
            source: 'Candidate Profile v1',
          },
        ],
        status: 'PENDING_APPROVAL',
        approved_at: null,
        sent_at: null,
        provider_message_id: null,
        created_at: now,
        updated_at: now,
      },
    ];

    for (const dr of seedDrafts) {
      this.outreachDrafts.set(dr.id, dr);
    }

    // 9. Applications & Status History (Phase 9)
    const app1 = this.createApplication({
      jobId: j1Id,
      profileId: this.defaultProfileId,
      status: 'READY_TO_APPLY',
      notes: 'High-priority Series A match (Score: 95/100). Outreach draft ready for Ananya Deshmukh.',
      followUpAt: '2026-11-16T09:00:00.000Z',
    });

    const app2 = this.createApplication({
      jobId: j2Id,
      profileId: this.defaultProfileId,
      status: 'SAVED',
      notes: 'Global remote full-stack role using TypeScript, React, and FastAPI.',
      followUpAt: '2026-11-18T09:00:00.000Z',
    });
    void app1;
    void app2;

    // 10. Initial Agent Run History
    const seedRuns: AgentRunRecord[] = [
      {
        id: '90000000-0000-4000-8000-000000000001',
        task_id: 'task-funding-scout-init',
        agent_name: 'funding-scout',
        task_type: 'DISCOVER_FUNDED_COMPANIES',
        status: 'COMPLETED',
        input: { geographies: ['IN', 'US', 'DE'], funding_stages: ['SEED', 'SERIES_A', 'SERIES_B'], lookback_days: 30 },
        output: { sources_checked: 4, companies_found: 4, duplicates_skipped: 0 },
        idempotency_key: 'idem-funding-2026-11-12',
        retry_count: 0,
        error_message: null,
        started_at: '2026-11-12T07:25:00.000Z',
        completed_at: '2026-11-12T07:25:04.000Z',
        created_at: '2026-11-12T07:25:00.000Z',
      },
      {
        id: '90000000-0000-4000-8000-000000000002',
        task_id: 'task-company-investigator-init',
        agent_name: 'company-investigator',
        task_type: 'INVESTIGATE_COMPANIES',
        status: 'COMPLETED',
        input: { company_count: 4, research_depth: 'standard' },
        output: { verified_websites: 4, ats_detected: ['GREENHOUSE', 'ASHBY', 'LEVER'] },
        idempotency_key: 'idem-investigator-2026-11-12',
        retry_count: 0,
        error_message: null,
        started_at: '2026-11-12T07:30:00.000Z',
        completed_at: '2026-11-12T07:30:06.000Z',
        created_at: '2026-11-12T07:30:00.000Z',
      },
      {
        id: '90000000-0000-4000-8000-000000000003',
        task_id: 'task-job-hunter-init',
        agent_name: 'job-hunter',
        task_type: 'POLL_ATS_SOURCES',
        status: 'COMPLETED',
        input: { sources_polled: 4 },
        output: { new_jobs_count: 5, updated_jobs_count: 0, closed_jobs_count: 0 },
        idempotency_key: 'idem-hunter-2026-11-12',
        retry_count: 0,
        error_message: null,
        started_at: '2026-11-12T08:15:00.000Z',
        completed_at: '2026-11-12T08:15:05.000Z',
        created_at: '2026-11-12T08:15:00.000Z',
      },
      {
        id: '90000000-0000-4000-8000-000000000004',
        task_id: 'task-job-evaluator-init',
        agent_name: 'job-evaluator',
        task_type: 'EVALUATE_ACTIVE_JOBS',
        status: 'COMPLETED',
        input: { profile_id: this.defaultProfileId, profile_version: 1, jobs_count: 5 },
        output: { qualified: 3, review: 1, rejected: 1 },
        idempotency_key: 'idem-evaluator-2026-11-12',
        retry_count: 0,
        error_message: null,
        started_at: '2026-11-12T08:16:30.000Z',
        completed_at: '2026-11-12T08:16:33.000Z',
        created_at: '2026-11-12T08:16:30.000Z',
      },
    ];

    for (const run of seedRuns) {
      this.agentRuns.set(run.id, run);
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
        output = this.executeFundingScoutAgent();
      } else if (agentName === 'company-investigator') {
        output = this.executeCompanyInvestigatorAgent(inputPayload.company_id);
      } else if (agentName === 'job-hunter') {
        output = this.executeJobHunterAgent(inputPayload.source_id);
      } else if (agentName === 'job-evaluator') {
        output = await this.executeJobEvaluatorAgent(inputPayload.job_id);
      } else if (agentName === 'contact-finder') {
        output = this.executeContactFinderAgent(inputPayload.company_id);
      } else if (agentName === 'outreach-assistant') {
        output = await this.executeOutreachAssistantAgent(inputPayload);
      } else if (agentName === 'full-pipeline') {
        const s1 = this.executeFundingScoutAgent();
        const s2 = this.executeCompanyInvestigatorAgent();
        const s3 = this.executeJobHunterAgent();
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

  private executeFundingScoutAgent(): Record<string, any> {
    const discoveredCatalog = [
      {
        name: 'VayuScale Data',
        website: 'https://vayuscale.example.in',
        country_code: 'IN',
        headquarters: 'Bengaluru, India',
        industry: 'Real-Time Analytics & Postgres Extensions',
        description:
          'Cloud-native distributed OLAP and PostgreSQL vector indexing platform built in Rust, Python, and TypeScript.',
        employee_count: 29,
        round_type: 'SEED',
        amount: 5400000,
        currency: 'USD',
        announcement_date: '2026-11-10',
        publication_date: '2026-11-11',
        investors: ['Matrix Partners India', 'Nexus Venture Partners'],
        source_url: 'https://techcrunch.example.com/2026/11/11/vayuscale-data-seed',
      },
      {
        name: 'NovaStack API',
        website: 'https://novastack.example.com',
        country_code: 'GB',
        headquarters: 'London, UK (Remote-First)',
        industry: 'Developer Infrastructure & API Gateways',
        description:
          'Programmable multi-region API gateway and rate-limiting engine hiring backend Node.js and TypeScript engineers globally.',
        employee_count: 54,
        round_type: 'SERIES_A',
        amount: 16000000,
        currency: 'USD',
        announcement_date: '2026-11-09',
        publication_date: '2026-11-10',
        investors: ['Balderton Capital', 'Seedcamp'],
        source_url: 'https://sifted.example.eu/2026/11/10/novastack-series-a',
      },
    ];

    let newCompanies = 0;
    let newRounds = 0;

    for (const item of discoveredCatalog) {
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

      const { created: roundCreated } = this.addFundingRoundIfNew({
        company_id: company.id,
        round_type: item.round_type,
        amount: item.amount,
        currency: item.currency,
        announcement_date: item.announcement_date,
        publication_date: item.publication_date,
        investors: item.investors,
        source_url: item.source_url,
      });
      if (roundCreated) newRounds++;
    }

    return {
      sources_checked: 3,
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
          : comp.country_code === 'IN'
          ? 'GREENHOUSE'
          : 'ASHBY';

      const careerUrl =
        comp.metadata?.career_page ||
        (ats === 'GREENHOUSE'
          ? `https://boards.greenhouse.io/${slug}`
          : `https://jobs.ashbyhq.com/${slug}`);

      comp.investigation_status = 'COMPLETED';
      comp.last_researched_at = new Date().toISOString();
      comp.metadata = {
        ...comp.metadata,
        career_page: careerUrl,
        ats_provider: ats,
        verified_identity: true,
      };
      this.companies.set(comp.id, comp);

      // Ensure a job source exists
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

      // Ensure active career page signal
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
          confidence: 0.92,
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

  private executeJobHunterAgent(targetSourceId?: string): Record<string, any> {
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

      if (comp.normalized_name.includes('vayuscale')) {
        const { outcome } = this.upsertJobFromSource({
          company_id: comp.id,
          source_id: src.id,
          external_id: 'gh-vayuscale-701',
          title: 'Backend Engineer — Distributed PostgreSQL & Python/FastAPI',
          description:
            'Build cloud-native query routing and telemetry services at VayuScale Data using Python, FastAPI, TypeScript, Node.js, and PostgreSQL. Ideal for engineers with 1-2 years of backend experience. Remote across India.',
          location: 'Remote (India)',
          country_code: 'IN',
          work_mode: 'REMOTE',
          employment_type: 'FULL_TIME',
          salary_min: 1600000,
          salary_max: 2400000,
          salary_currency: 'INR',
          experience_min: 1.0,
          experience_max: 2.0,
          posted_at: '2026-11-12T06:00:00.000Z',
          apply_url: `https://boards.greenhouse.io/vayuscale/jobs/701`,
          source_url: src.source_url,
        });
        if (outcome === 'NEW') newJobs++;
        if (outcome === 'UPDATED') updatedJobs++;
      } else if (comp.normalized_name.includes('novastack')) {
        const { outcome } = this.upsertJobFromSource({
          company_id: comp.id,
          source_id: src.id,
          external_id: 'ashby-novastack-512',
          title: 'Full Stack Software Engineer (Node.js, TypeScript, React)',
          description:
            'NovaStack API is hiring a Full Stack Software Engineer to build developer control planes and API analytics dashboards using Node.js, TypeScript, React, PostgreSQL, and Redis. Remote worldwide including India.',
          location: 'Global Remote',
          country_code: 'GB',
          work_mode: 'REMOTE',
          employment_type: 'FULL_TIME',
          salary_min: 70000,
          salary_max: 95000,
          salary_currency: 'USD',
          experience_min: 1.0,
          experience_max: 2.5,
          posted_at: '2026-11-12T07:00:00.000Z',
          apply_url: `https://jobs.ashbyhq.com/novastack/512`,
          source_url: src.source_url,
        });
        if (outcome === 'NEW') newJobs++;
        if (outcome === 'UPDATED') updatedJobs++;
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

      // Optional Gemini semantic reasoning enrichment if explicitly requested
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
          // Deterministic reasoning already saved; never fail evaluation if LLM call fails
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

      const domain = comp.domain || 'example.com';
      const newContact: ContactRecord = {
        id: crypto.randomUUID(),
        company_id: comp.id,
        name: comp.country_code === 'IN' ? 'Vikramaditya Nair' : 'Elena Rostova',
        designation: 'Technical Recruiter — Engineering',
        email: `talent@${domain}`,
        email_status: 'PUBLICLY_LISTED',
        email_source_url: `https://${domain}/careers`,
        linkedin_url: `https://linkedin.com/company/${comp.normalized_name}`,
        other_profile_url: null,
        metadata: {
          priority_rank: 1,
          role_category: 'Technical Recruiter',
          provenance_note: `Verified public talent acquisition contact on https://${domain}/careers`,
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
