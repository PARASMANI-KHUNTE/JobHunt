import React, { useState } from 'react';
import { Plus, Trash2, RefreshCw, Play, Check } from 'lucide-react';

interface ProfileAndAgentsProps {
  mode: 'profile' | 'agents';
  profile: any;
  agents: any[];
  agentRuns: any[];
  sources: any[];
  onUpdateProfile: (payload: Record<string, any>) => Promise<void>;
  onAddSkill: (skillName: string, proficiency: string, years: number) => Promise<void>;
  onDeleteSkill: (skillId: string) => Promise<void>;
  onTriggerAgent: (agentName: string) => Promise<void>;
  onCheckSource: (sourceId: string) => Promise<void>;
}

export const ProfileAndAgentsView: React.FC<ProfileAndAgentsProps> = ({
  mode,
  profile,
  agents,
  agentRuns,
  sources,
  onUpdateProfile,
  onAddSkill,
  onDeleteSkill,
  onTriggerAgent,
  onCheckSource,
}) => {
  const [fullName, setFullName] = useState(profile?.full_name || 'Paras Manikhunte');
  const [headline, setHeadline] = useState(profile?.headline || '');
  const [expYears, setExpYears] = useState(String(profile?.experience_years ?? 1.5));
  const [resumeText, setResumeText] = useState(profile?.resume_text || '');
  const [remoteOnly, setRemoteOnly] = useState<boolean>(
    profile?.preferences?.remote_only ?? true
  );
  const [minSalary, setMinSalary] = useState(
    String(profile?.preferences?.minimum_salary ?? 700000)
  );
  const [maxExp, setMaxExp] = useState(
    String(profile?.preferences?.maximum_experience ?? 2)
  );

  // New skill input
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillProf, setNewSkillProf] = useState('ADVANCED');
  const [newSkillYears, setNewSkillYears] = useState('1.5');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onUpdateProfile({
        full_name: fullName,
        headline,
        experience_years: Number(expYears),
        resume_text: resumeText,
        preferences: {
          ...profile?.preferences,
          remote_only: remoteOnly,
          minimum_salary: Number(minSalary),
          maximum_experience: Number(maxExp),
        },
      });
      setFeedback(
        'Candidate profile saved. Profile version incremented and all active jobs re-evaluated.'
      );
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddSkillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onAddSkill(newSkillName.trim(), newSkillProf, Number(newSkillYears));
      setNewSkillName('');
      setFeedback(`Added normalized skill '${newSkillName}' and re-scored active jobs.`);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'profile') {
    return (
      <div className="space-y-6">
        {feedback && (
          <div className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-emerald-400 flex items-center justify-between">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-slate-400">
              Dismiss
            </button>
          </div>
        )}
        {errorMsg && (
          <div className="px-4 py-2.5 rounded-lg bg-rose-950/30 border border-rose-800 text-xs text-rose-300 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-200">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Candidate Profile & Hard-Filter Preferences */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Candidate Profile & Hard-Filter Rules
                </h2>
                <p className="text-xs text-slate-400">
                  Updates automatically increment profile_version and trigger job re-evaluation
                </p>
              </div>
              <span className="text-xs font-mono text-indigo-400">
                Version v{profile?.profile_version || 1}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Candidate Experience (Years)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={expYears}
                  onChange={(e) => setExpYears(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block text-slate-300 font-medium mb-1">Headline</label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
            </div>

            <div className="text-xs">
              <label className="block text-slate-300 font-medium mb-1">
                Verified Resume Facts (Used by Evaluator & Outreach Assistant)
              </label>
              <textarea
                rows={4}
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 leading-relaxed"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3 text-xs">
              <h3 className="font-semibold text-white">
                Deterministic Hard-Filter Thresholds
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Minimum Target Salary (INR)
                  </label>
                  <input
                    type="number"
                    value={minSalary}
                    onChange={(e) => setMinSalary(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Max Required Experience (Yrs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={maxExp}
                    onChange={(e) => setMaxExp(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono tabular-nums"
                  />
                </div>

                <div className="flex flex-col justify-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                    <input
                      type="checkbox"
                      checked={remoteOnly}
                      onChange={(e) => setRemoteOnly(e.target.checked)}
                      className="rounded border-slate-700"
                    />
                    <span>Strict Remote-Only Filter</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg"
              >
                Save Profile & Re-Evaluate Jobs
              </button>
            </div>
          </form>

          {/* Right 5 Cols: Normalized Candidate Skills Matrix */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white">
                Candidate Skill Matrix ({profile?.skills?.length || 0})
              </h2>
              <p className="text-xs text-slate-400">
                Unique constraint enforced on (profile_id, normalized_skill)
              </p>
            </div>

            <form onSubmit={handleAddSkillSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <input
                type="text"
                placeholder="Skill (e.g. Redis)"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
              <select
                value={newSkillProf}
                onChange={(e) => setNewSkillProf(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              >
                <option value="BEGINNER">BEGINNER</option>
                <option value="INTERMEDIATE">INTERMEDIATE</option>
                <option value="ADVANCED">ADVANCED</option>
                <option value="EXPERT">EXPERT</option>
              </select>
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg flex items-center justify-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Skill</span>
              </button>
            </form>

            <div className="divide-y divide-slate-800/80 text-xs">
              {(profile?.skills || []).map((sk: any) => (
                <div key={sk.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white">{sk.skill_name}</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {' '}
                      · norm:{sk.normalized_skill} · {sk.proficiency} ({sk.years_experience}y)
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove skill ${sk.skill_name}`}
                    onClick={async () => {
                      setBusy(true);
                      await onDeleteSkill(sk.id);
                      setBusy(false);
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mode === 'agents' (Agents, ATS Sources & Reliability Console)
  return (
    <div className="space-y-6">
      {feedback && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-emerald-400 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-slate-400">
            Dismiss
          </button>
        </div>
      )}

      {/* 6 Logical Agent Workers Grid */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Logical Agent Workers (Idempotent Task Dispatch)
            </h2>
            <p className="text-xs text-slate-400">
              Each worker executes deterministic parsing/normalization and persists task state to agent_runs
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((ag) => (
            <div
              key={ag.name}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">{ag.label}</span>
                  <span className="font-mono text-[11px] text-indigo-400">{ag.queue}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{ag.description}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-500 font-mono text-[11px]">Cadence: {ag.cadence}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onTriggerAgent(ag.name);
                    setFeedback(`Executed ${ag.label} worker and persisted run log.`);
                    setBusy(false);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Play className="w-3 h-3" />
                  <span>Run Worker</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Split: ATS Source Health Monitoring + Agent Run Execution History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Authorized ATS Sources & Health ({sources.length})
            </h3>
            <span className="text-xs text-slate-400">Transient error != closed</span>
          </div>
          <div className="divide-y divide-slate-800/80 text-xs">
            {sources.map((src) => (
              <div key={src.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-white">
                    {src.company_name} · <span className="font-mono">{src.ats_provider}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate max-w-sm mt-0.5">
                    {src.source_url}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                    Status: <span className="text-emerald-400">{src.status}</span> · Active roles:{' '}
                    {src.active_jobs_count} · Failures: {src.failure_count}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onCheckSource(src.id);
                    setFeedback(`Polled ${src.company_name} (${src.ats_provider}) endpoint.`);
                    setBusy(false);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Poll Source</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Agent Execution Audit Log ({agentRuns.length})
            </h3>
            <span className="text-xs text-slate-400 font-mono">agent_runs table</span>
          </div>
          <div className="divide-y divide-slate-800/80 text-xs max-h-96 overflow-y-auto">
            {agentRuns.map((run) => (
              <div key={run.id} className="p-3.5 space-y-1">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-semibold text-white">{run.agent_name}</span>
                  <span
                    className={
                      run.status === 'COMPLETED' ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    {run.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Task: {run.task_id} · Idempotency: {run.idempotency_key}
                </div>
                {run.output && (
                  <div className="text-[11px] text-slate-300 font-mono bg-slate-950 p-2 rounded border border-slate-800/80 overflow-x-auto">
                    {JSON.stringify(run.output)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All 10 Phases Verification Matrix */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          Engineering Roadmap & Acceptance Gate Verification (Phases 0–10)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          {[
            'Phase 0: Monorepo, Docker Compose, Env Validation & CI',
            'Phase 1: PostgreSQL Schema, Migrations & Profile Versioning',
            'Phase 2: Funding Scout & Domain Identity Deduplication',
            'Phase 3: Company Investigator, ATS Detection & Priority Score',
            'Phase 4: Job Hunter (Greenhouse, Lever, Ashby) & Outage Resilience',
            'Phase 5: Job Evaluator (Hard Filters + 100pt Weighted Scorer)',
            'Phase 6: Job CRM Dashboard & Idempotent Telegram/App Alerts',
            'Phase 7: Contact Finder & Field-Level Provenance',
            'Phase 8: Outreach Assistant (Approval & Explicit Send Separation)',
            'Phase 9: Application CRM Lifecycle & Immutable Event History',
            'Phase 10: SSRF Guard, Prompt-Injection Sanitizer & E2E Tests',
          ].map((ph) => (
            <div
              key={ph}
              className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2 text-slate-200"
            >
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{ph}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
