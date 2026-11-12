import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FundingScoutInputSchema,
  FundingScoutOutputSchema,
  CompanyInvestigatorOutputSchema,
  JobHunterOutputSchema,
  JobEvaluatorOutputSchema,
  ContactFinderOutputSchema,
  OutreachAssistantOutputSchema,
} from './index.ts';

test('FundingScoutInputSchema validates correct input', () => {
  const sampleInput = {
    geographies: ['IN', 'US', 'GB'],
    funding_stages: ['PRE_SEED', 'SEED', 'SERIES_A'],
    lookback_days: 30,
    max_results: 50,
  };

  const parsed = FundingScoutInputSchema.safeParse(sampleInput);
  assert.equal(parsed.success, true);
});

test('FundingScoutOutputSchema validates spec output contract', () => {
  const sampleOutput = {
    companies: [
      {
        name: 'HyperScale AI',
        website: 'https://hyperscale.example.com',
        country_code: 'IN',
        funding_stage: 'SERIES_A',
        funding_amount: 12000000,
        currency: 'USD',
        announcement_date: '2026-11-01',
        publication_date: '2026-11-10',
        investors: ['Sequoia India', 'Lightspeed'],
        source_url: 'https://news.example.com/hyperscale-series-a',
        confidence: 0.95,
      },
    ],
    discovery_metadata: {
      sources_checked: 5,
      companies_found: 1,
    },
  };

  const parsed = FundingScoutOutputSchema.safeParse(sampleOutput);
  assert.equal(parsed.success, true);
});

test('JobEvaluatorOutputSchema enforces score breakdown and decision bounds', () => {
  const sampleEvaluation = {
    job_id: '123e4567-e89b-12d3-a456-426614174000',
    profile_id: '987fcdeb-51a2-43f7-9876-543210987654',
    score: 91,
    decision: 'QUALIFIED',
    hard_filters: {
      location_eligible: true,
      experience_eligible: true,
      role_eligible: true,
      work_mode_eligible: true,
    },
    score_breakdown: {
      technical_skills: 28,
      role_relevance: 24,
      experience: 14,
      responsibilities: 14,
      location: 10,
      salary: 1,
    },
    matched_skills: ['Node.js', 'TypeScript', 'PostgreSQL'],
    missing_skills: [],
    reasoning: 'Candidate exceeds technical requirements and has matching experience profile.',
    evidence: [],
    evaluation_version: '1.0',
  };

  const parsed = JobEvaluatorOutputSchema.safeParse(sampleEvaluation);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    const sum =
      parsed.data.score_breakdown.technical_skills +
      parsed.data.score_breakdown.role_relevance +
      parsed.data.score_breakdown.experience +
      parsed.data.score_breakdown.responsibilities +
      parsed.data.score_breakdown.location +
      parsed.data.score_breakdown.salary;
    assert.equal(sum, 91);
  }
});

test('OutreachAssistantOutputSchema enforces safety PENDING_APPROVAL status', () => {
  const sampleDraft = {
    subject: 'Interest in Senior Backend Engineering Opportunity',
    body: 'Hello, I came across the Backend Engineering role at your company...',
    personalization_evidence: [],
    factual_claims_verified: true,
    status: 'PENDING_APPROVAL',
  };

  const parsed = OutreachAssistantOutputSchema.safeParse(sampleDraft);
  assert.equal(parsed.success, true);

  // If status is not PENDING_APPROVAL, it must fail schema validation (safety gate)
  const invalidStatus = { ...sampleDraft, status: 'SENT_AUTOMATICALLY' };
  const invalidParsed = OutreachAssistantOutputSchema.safeParse(invalidStatus);
  assert.equal(invalidParsed.success, false);
});
