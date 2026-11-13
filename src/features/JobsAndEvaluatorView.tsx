import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, ExternalLink, Check, AlertCircle, Plus, Briefcase, ArrowUpDown, Loader2 } from 'lucide-react';
import { decisionTone, formatSalary } from '../lib/ui.ts';

type SortMode = 'score' | 'newest' | 'priority';

interface JobsAndEvaluatorProps {
  jobs: any[];
  /** Cross-section deep link: select & reveal this job when set. */
  focusJobId?: string | null;
  onFocusJobConsumed?: () => void;
  onRefreshJobs: () => Promise<void>;
  onEvaluateJob: (jobId: string) => Promise<void>;
  onSaveJobToPipeline: (jobId: string) => Promise<void>;
  onCreateDraftForJob: (jobId: string, companyId: string) => Promise<void>;
}

export const JobsAndEvaluatorView: React.FC<JobsAndEvaluatorProps> = ({
  jobs,
  focusJobId = null,
  onFocusJobConsumed,
  onRefreshJobs,
  onEvaluateJob,
  onSaveJobToPipeline,
  onCreateDraftForJob,
}) => {
  const [decisionFilter, setDecisionFilter] = useState<string>('ALL');
  const [workModeFilter, setWorkModeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(jobs[0]?.id || null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'save' | 'eval' | 'draft' | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Consume cross-section focus (e.g. "View Breakdown" from Overview)
  useEffect(() => {
    if (focusJobId) {
      setSelectedJobId(focusJobId);
      onFocusJobConsumed?.();
    }
  }, [focusJobId, onFocusJobConsumed]);

  const filteredJobs = jobs
    .filter((job) => {
      const decision = job.evaluation?.decision || 'REVIEW';
      if (decisionFilter !== 'ALL' && decision !== decisionFilter) return false;
      if (workModeFilter !== 'ALL' && job.work_mode !== workModeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = job.title.toLowerCase().includes(q);
        const matchCompany = (job.company_name || '').toLowerCase().includes(q);
        const matchDesc = (job.description || '').toLowerCase().includes(q);
        if (!matchTitle && !matchCompany && !matchDesc) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'score') {
        return (b.evaluation?.score ?? 0) - (a.evaluation?.score ?? 0);
      }
      if (sortMode === 'newest') {
        return (
          new Date(b.posted_at || b.first_seen_at || 0).getTime() -
          new Date(a.posted_at || a.first_seen_at || 0).getTime()
        );
      }
      return (b.company_priority || 0) - (a.company_priority || 0);
    });

  const selectedJob =
    filteredJobs.find((j) => j.id === selectedJobId) ||
    jobs.find((j) => j.id === selectedJobId) ||
    filteredJobs[0] ||
    null;

  const handleSave = async (jobId: string) => {
    setBusyJobId(jobId);
    setBusyAction('save');
    setActionFeedback(null);
    setActionError(null);
    try {
      await onSaveJobToPipeline(jobId);
      setActionFeedback('Opportunity saved to Application CRM pipeline.');
    } catch (err: any) {
      setActionError(err.message || 'Could not save job.');
    } finally {
      setBusyJobId(null);
      setBusyAction(null);
    }
  };

  const handleEvaluate = async (jobId: string) => {
    setBusyJobId(jobId);
    setBusyAction('eval');
    setActionFeedback(null);
    setActionError(null);
    try {
      await onEvaluateJob(jobId);
      setActionFeedback('Job re-evaluated against current candidate profile version.');
    } catch (err: any) {
      setActionError(err.message || 'Re-evaluation failed.');
    } finally {
      setBusyJobId(null);
      setBusyAction(null);
    }
  };

  const handleDraft = async (jobId: string, companyId: string) => {
    setBusyJobId(jobId);
    setBusyAction('draft');
    setActionError(null);
    try {
      await onCreateDraftForJob(jobId, companyId);
    } catch (err: any) {
      setActionError(err.message || 'Could not create outreach draft.');
    } finally {
      setBusyJobId(null);
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Interactive Segmented Control for Decision Routing */}
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            {(['ALL', 'QUALIFIED', 'REVIEW', 'REJECTED'] as const).map((dec) => (
              <button
                key={dec}
                type="button"
                onClick={() => setDecisionFilter(dec)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  decisionFilter === dec
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dec === 'ALL' ? 'All Evaluations' : dec.charAt(0) + dec.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            {(['ALL', 'REMOTE', 'ONSITE'] as const).map((wm) => (
              <button
                key={wm}
                type="button"
                onClick={() => setWorkModeFilter(wm)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  workModeFilter === wm
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {wm === 'ALL' ? 'Any Mode' : wm === 'REMOTE' ? 'Remote Only' : 'Onsite'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <ArrowUpDown className="w-3 h-3 text-slate-500 ml-1.5" />
            {(
              [
                ['score', 'Score'],
                ['newest', 'Newest'],
                ['priority', 'Priority'],
              ] as Array<[SortMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  sortMode === mode
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search discovered jobs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by role, skill, or company..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>
          <button
            type="button"
            onClick={onRefreshJobs}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Poll ATS Sources</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="px-4 py-2.5 rounded-lg bg-rose-950/30 border border-rose-800 text-xs text-rose-300 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionFeedback && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-emerald-400 flex items-center justify-between">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Split Workspace: Left Table + Right Match Evaluation Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: High-Density Normalized Job Table */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Normalized Job Openings ({filteredJobs.length})
            </h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Deduplicated by (source_id, external_id)
            </span>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Briefcase className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300">
                {jobs.length === 0
                  ? 'No jobs discovered yet.'
                  : 'No job openings match the active filters.'}
              </p>
              {jobs.length === 0 ? (
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Register companies and investigate them to register ATS sources, then poll live
                  Greenhouse / Lever / Ashby endpoints to fetch real openings.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setDecisionFilter('ALL');
                    setWorkModeFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded-md"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {filteredJobs.map((job) => {
                const ev = job.evaluation;
                const score = ev?.score ?? 0;
                const decision = ev?.decision || 'REVIEW';
                const isSelected = selectedJob?.id === job.id;

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`p-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-white">{job.title}</h3>
                        {/* Zero-Pill Metadata Discipline: Clean unboxed inline text with · separators */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          <span className="font-medium text-slate-200">{job.company_name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{job.work_mode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{job.location || 'Global'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatSalary(job)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                          <span>ID: {job.external_id}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Published: {job.posted_at ? job.posted_at.slice(0, 10) : 'Not Disclosed'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>First seen: {job.first_seen_at.slice(0, 10)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                          {job.company_career_page && (
                            <a
                              href={job.company_career_page}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-1 font-medium"
                            >
                              <span>Careers Page</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {job.apply_url && (
                            <a
                              href={job.apply_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-300 hover:text-white hover:underline inline-flex items-center gap-1"
                            >
                              <span>Direct Apply / ATS</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {job.company_website && (
                            <a
                              href={job.company_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-400 hover:text-slate-200 hover:underline inline-flex items-center gap-1"
                            >
                              <span>Official Site</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <div
                          className={`font-mono tabular-nums text-base font-bold ${decisionTone(decision)}`}
                        >
                          {score}
                          <span className="text-xs font-normal text-slate-500">/100</span>
                        </div>
                        <div className={`text-xs font-semibold ${decisionTone(decision)}`}>
                          {decision}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 Columns: Agent 04 Evaluation Breakdown & Actions */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
          {selectedJob ? (
            <>
              <div className="border-b border-slate-800 pb-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-400">
                      {selectedJob.company_name} · Priority {selectedJob.company_priority}
                    </p>
                    <h2 className="text-base font-bold text-white mt-0.5">{selectedJob.title}</h2>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <span className="text-xl font-bold text-white">
                      {selectedJob.evaluation?.score ?? 0}/100
                    </span>
                    <p className={`text-xs font-semibold ${decisionTone(selectedJob.evaluation?.decision)}`}>
                      {selectedJob.evaluation?.decision || 'UNSCORED'}
                    </p>
                  </div>
                </div>

                {/* External Links Bar: Careers Page, Direct Apply, Official Website */}
                <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-950/80 border border-slate-800/80 px-3 py-2 rounded-lg">
                  {selectedJob.company_career_page && (
                    <a
                      href={selectedJob.company_career_page}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 hover:underline font-medium inline-flex items-center gap-1"
                    >
                      <span>Company Careers Page</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {selectedJob.apply_url && (
                    <a
                      href={selectedJob.apply_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 hover:underline font-medium inline-flex items-center gap-1"
                    >
                      <span>Apply on ATS</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {selectedJob.company_website && (
                    <a
                      href={selectedJob.company_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-slate-200 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Official Website</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedJob.description}
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {selectedJob.application_status ? (
                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      In Pipeline ({selectedJob.application_status})
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyJobId === selectedJob.id}
                      onClick={() => handleSave(selectedJob.id)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      {busyJobId === selectedJob.id && busyAction === 'save' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {busyJobId === selectedJob.id && busyAction === 'save'
                          ? 'Saving...'
                          : 'Save to Pipeline'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busyJobId === selectedJob.id}
                    onClick={() => handleEvaluate(selectedJob.id)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {busyJobId === selectedJob.id && busyAction === 'eval' && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>
                      {busyJobId === selectedJob.id && busyAction === 'eval'
                        ? 'Evaluating...'
                        : 'Re-Evaluate'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={busyJobId === selectedJob.id}
                    onClick={() => handleDraft(selectedJob.id, selectedJob.company_id)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {busyJobId === selectedJob.id && busyAction === 'draft' && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>
                      {busyJobId === selectedJob.id && busyAction === 'draft'
                        ? 'Drafting...'
                        : 'Draft Outreach'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Stage 1: Hard Filter Verification */}
              {selectedJob.evaluation && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-300 mb-2">
                      Stage 1: Mandatory Hard Filters (Profile v{selectedJob.evaluation.profile_version})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {Object.entries(selectedJob.evaluation.hard_filter_results || {}).map(
                        ([key, passed]) => (
                          <div
                            key={key}
                            className="px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between"
                          >
                            <span className="text-slate-400">
                              {key.replace('_eligible', '').replace('_', ' ')}
                            </span>
                            <span
                              className={`font-mono font-semibold ${
                                passed ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {passed ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Stage 2: 100-Point Weighted Breakdown */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-300 mb-2">
                      Stage 2: 100-Point Weighted Score Breakdown
                    </h3>
                    <div className="space-y-2 text-xs font-mono tabular-nums">
                      {[
                        {
                          label: 'Technical Skill Match',
                          val: selectedJob.evaluation.score_breakdown.technical_skills,
                          max: 30,
                        },
                        {
                          label: 'Role / Title Relevance',
                          val: selectedJob.evaluation.score_breakdown.role_relevance,
                          max: 25,
                        },
                        {
                          label: 'Experience Compatibility',
                          val: selectedJob.evaluation.score_breakdown.experience,
                          max: 15,
                        },
                        {
                          label: 'Responsibilities Match',
                          val: selectedJob.evaluation.score_breakdown.responsibilities,
                          max: 15,
                        },
                        {
                          label: 'Location & Work Mode',
                          val: selectedJob.evaluation.score_breakdown.location,
                          max: 10,
                        },
                        {
                          label: 'Salary Compatibility',
                          val: selectedJob.evaluation.score_breakdown.salary,
                          max: 5,
                        },
                      ].map((row) => (
                        <div key={row.label} className="space-y-1">
                          <div className="flex justify-between text-slate-300">
                            <span className="font-sans">{row.label}</span>
                            <span>
                              {row.val} / {row.max}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500"
                              style={{ width: `${Math.min(100, (row.val / row.max) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Skills & Reasoning */}
                  <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400">Matched Skills: </span>
                      <span className="text-emerald-400 font-medium">
                        {selectedJob.evaluation.matched_skills?.join(' · ') || 'None'}
                      </span>
                    </div>
                    {selectedJob.evaluation.missing_skills?.length > 0 && (
                      <div>
                        <span className="text-slate-400">Unmatched / Bonus Skills: </span>
                        <span className="text-amber-400">
                          {selectedJob.evaluation.missing_skills.join(' · ')}
                        </span>
                      </div>
                    )}
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 leading-relaxed">
                      <span className="font-semibold text-white block mb-1">
                        Evaluator Explanation ({selectedJob.evaluation.model_version}):
                      </span>
                      {selectedJob.evaluation.reasoning}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>Select a job opening from the table to inspect its evaluation breakdown.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
