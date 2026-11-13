import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResumeText } from './services/resumeParser.ts';
import { normalizeSkill } from './services/coreEngine.ts';
import { createApiApp } from './app.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_RESUME = `Aarav Sharma
Senior Full Stack Engineer
aarav.sharma@example.com | +91 98765 43210
Bengaluru, India

SKILLS
React, TypeScript, Node.js, PostgreSQL, Docker, Kubernetes, AWS, Redis

EXPERIENCE
Senior Software Engineer at Razorpay  Jan 2022 - Present
- Built payment microservices with Node.js and PostgreSQL
- Deployed on Kubernetes and AWS with Terraform

Software Engineer at Freshworks  Jul 2019 - Dec 2021
- React dashboards, Redis caching, CI/CD pipelines

EDUCATION
B.Tech Computer Science, IIT Bombay  2019`;

describe('Resume Parser (deterministic)', () => {
  const parsed = parseResumeText(SAMPLE_RESUME);

  test('extracts full name, headline, email and phone from header block', () => {
    assert.equal(parsed.full_name, 'Aarav Sharma');
    assert.equal(parsed.headline, 'Senior Full Stack Engineer');
    assert.equal(parsed.email, 'aarav.sharma@example.com');
    assert.equal(parsed.phone, '+91 98765 43210');
  });

  test('extracts skills via taxonomy with normalized names', () => {
    const names = parsed.skills.map((s) => s.skill_name);
    for (const expected of ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'Redis']) {
      assert.ok(names.includes(expected), `missing skill ${expected}`);
    }
    for (const skill of parsed.skills) {
      assert.equal(skill.normalized_skill, normalizeSkill(skill.skill_name));
      assert.ok(['INTERMEDIATE', 'ADVANCED', 'EXPERT'].includes(skill.proficiency));
    }
  });

  test('parses work experience entries with title, company and durations', () => {
    assert.equal(parsed.work_experience.length, 2);
    const first = parsed.work_experience[0];
    assert.equal(first.title, 'Senior Software Engineer');
    assert.equal(first.company, 'Razorpay');
    assert.equal(first.current, true);
    assert.ok(first.duration_years > 3.5, `expected >= 3.5y, got ${first.duration_years}`);
    const second = parsed.work_experience[1];
    assert.equal(second.company, 'Freshworks');
    assert.ok(second.duration_years >= 2.3 && second.duration_years <= 2.6);
  });

  test('computes experience years from earliest start date (Jul 2019 -> now)', () => {
    assert.equal(parsed.experience_years_source, 'computed');
    // Jul 2019 start; current date 2026 => between 6.8 and 7.6 years
    assert.ok(parsed.experience_years > 6.5 && parsed.experience_years < 7.7,
      `expected ~7y, got ${parsed.experience_years}`);
  });

  test('stated "N+ years of experience" phrase takes priority over computed span', () => {
    const withPhrase = parseResumeText(
      SAMPLE_RESUME.replace('Senior Full Stack Engineer', 'Senior Full Stack Engineer with 3+ years of experience')
    );
    assert.equal(withPhrase.experience_years_source, 'stated');
    assert.equal(withPhrase.experience_years, 3);
  });

  test('extracts education entry', () => {
    assert.equal(parsed.education.length, 1);
    assert.match(parsed.education[0].degree, /B\.?TECH/i);
    assert.match(parsed.education[0].institution || '', /IIT Bombay/i);
    assert.equal(parsed.education[0].year, '2019');
  });

  test('derives a human-readable summary', () => {
    assert.ok(parsed.summary.includes('Senior Full Stack Engineer'));
    assert.ok(parsed.summary.includes('years of experience'));
    assert.ok(parsed.summary.includes('Razorpay'));
  });

  test('handles noisy/garbage input without throwing', () => {
    const junk = parseResumeText('\n\n\x00\x01 random noise @@@ ### \n 12345 \n');
    assert.equal(junk.full_name === null || typeof junk.full_name === 'string', true);
    assert.ok(Array.isArray(junk.skills));
  });
});

describe('Resume Import API (parse + apply)', () => {
  test('POST /api/v1/profile/resume/parse + /apply fills profile, skills and re-scores jobs', async () => {
    const app = createApiApp();
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. Parse (no persistence)
      const parseRes = await fetch(`${base}/api/v1/profile/resume/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE_RESUME }),
      });
      assert.equal(parseRes.status, 200);
      const parseJson = (await parseRes.json()) as any;
      assert.equal(parseJson.data.parsed.full_name, 'Aarav Sharma');
      assert.ok(parseJson.data.parsed.skills.length >= 5);
      assert.equal(typeof parseJson.data.resume_text, 'string');

      // 2. Validation guard: apply without resume_text is rejected
      const badRes = await fetch(`${base}/api/v1/profile/resume/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [] }),
      });
      assert.equal(badRes.status, 400);

      // 3. Apply the reviewed payload
      const applyRes = await fetch(`${base}/api/v1/profile/resume/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: parseJson.data.parsed.full_name,
          headline: parseJson.data.parsed.headline,
          summary: parseJson.data.parsed.summary,
          experience_years: parseJson.data.parsed.experience_years,
          resume_text: parseJson.data.resume_text,
          work_experience: parseJson.data.parsed.work_experience,
          education: parseJson.data.parsed.education,
          skills: parseJson.data.parsed.skills.map((s: any) => ({
            skill_name: s.skill_name,
            proficiency: s.proficiency,
            years_experience: 2,
          })),
        }),
      });
      assert.equal(applyRes.status, 200);
      const applyJson = (await applyRes.json()) as any;
      assert.ok(applyJson.data.skills_added >= 5);
      assert.ok(applyJson.data.profile.profile_version >= 2);
      assert.equal(applyJson.data.profile.full_name, 'Aarav Sharma');
      assert.ok(Array.isArray(applyJson.data.profile.work_experience));
      assert.equal(applyJson.data.profile.work_experience.length, 2);
      assert.equal(applyJson.data.profile.resume_text, SAMPLE_RESUME);

      // 4. GET /profile reflects imported data
      const profRes = await fetch(`${base}/api/v1/profile`);
      const profJson = (await profRes.json()) as any;
      assert.equal(profJson.data.full_name, 'Aarav Sharma');
      assert.ok(profJson.data.skills.length >= 5);
      assert.ok(profJson.data.profile_version >= 2);

      // 5. Idempotent re-apply: duplicate skills are skipped, not errors
      const reapplyRes = await fetch(`${base}/api/v1/profile/resume/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: SAMPLE_RESUME,
          skills: parseJson.data.parsed.skills.map((s: any) => ({
            skill_name: s.skill_name,
            proficiency: s.proficiency,
            years_experience: 2,
          })),
        }),
      });
      assert.equal(reapplyRes.status, 200);
      const reapplyJson = (await reapplyRes.json()) as any;
      assert.equal(reapplyJson.data.skills_added, 0);
      assert.ok(reapplyJson.data.skills_skipped >= 5);
    } finally {
      server.close();
    }
  });

  test('PDF extraction path: real PDF fixture parses through the API', async () => {
    const pdfPath = path.resolve(__dirname, '../tests/fixtures/sample-resume.pdf');
    if (!fs.existsSync(pdfPath)) {
      console.log('  (skipping: PDF fixture not found)');
      return;
    }
    const base64 = fs.readFileSync(pdfPath).toString('base64');

    const app = createApiApp();
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/profile/resume/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'sample-resume.pdf', content_base64: base64 }),
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as any;
      assert.equal(json.data.parsed.full_name, 'Aarav Sharma');
      assert.ok(json.data.parsed.skills.length >= 5);
    } finally {
      server.close();
    }
  });
});
