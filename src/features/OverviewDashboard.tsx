import React from 'react';
import {
  Sparkles,
  Check,
  Circle,
  Briefcase,
  Play,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Bell,
} from 'lucide-react';
import { relativeTime } from '../lib/ui.ts';

export type NavSection =
  | 'overview'
  | 'jobs'
  | 'companies'
  | 'pipeline'
  | 'profile'
  | 'agents';

export interface OverviewDashboardProps {
  onboarding: {
    profileDone: boolean;
    companiesDone: boolean;
    sourcesDone: boolean;
    jobsDone: boolean;
    allDone: boolean;
  };
  metrics: Record<string, any>;
  pipelineCounts: Record<string, number>;
  funnelSegments: Array<{ key: string; label: string; tone: string }>;
  funnelTotal: number;
  qualifiedJobsList: any[];
  alerts: any[];
  agentRuns: any[];
  runningPipeline: boolean;
  pollingLiveAts: boolean;
  onNavigate: (section: NavSection) => void;
  onSetPipelineSubview: (subview: 'pipeline' | 'outreach') => void;
  onRunFullPipeline: () => Promise<void>;
  onPollLiveAts: () => Promise<void>;
  onFocusJob: (jobId: string) => void;
  onMarkAlertRead: (alertId: string) => Promise<void>;
  onSetBanner: (banner: { tone: 'success' | 'error' | 'info'; text: string }) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  onboarding,
  metrics,
  pipelineCounts,
  funnelSegments,
  funnelTotal,
  qualifiedJobsList,
  alerts,
  agentRuns,
  runningPipeline,
  pollingLiveAts,
  onNavigate,
  onSetPipelineSubview,
  onRunFullPipeline,
  onPollLiveAts,
  onFocusJob,
  onMarkAlertRead,
  onSetBanner,
}) => {
  return (
    <div className="space-y-6">
      {/* First-Run Onboarding Checklist (hidden once workflow is live) */}
      {!onboarding.allDone && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Getting Started — Bootstrap Your Live Job Pipeline
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            JobHunt OS stores no mock data. Complete these steps once to activate real,
            evidence-backed job discovery.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                done: onboarding.profileDone,
                title: '1. Candidate Profile',
                desc: 'Upload resume (auto-fills skills) or fill manually',
                target: 'profile' as NavSection,
              },
              {
                done: onboarding.companiesDone,
                title: '2. Register Companies',
                desc: 'Add target companies manually',
                target: 'companies' as NavSection,
              },
              {
                done: onboarding.sourcesDone,
                title: '3. Detect ATS Sources',
                desc: 'Investigate → register ATS endpoints',
                target: 'agents' as NavSection,
              },
              {
                done: onboarding.jobsDone,
                title: '4. Poll Live ATS Jobs',
                desc: 'Fetch real openings & evaluate',
                target: 'jobs' as NavSection,
              },
            ].map((step) => (
              <button
                key={step.title}
                type="button"
                onClick={() => onNavigate(step.target)}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  step.done
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-indigo-500/50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  {step.done ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-3 h-3 text-slate-600 shrink-0" />
                  )}
                  <span>{step.title}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{step.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top Metric Strip (real values only — no mock fallbacks) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Verified Companies</span>
          <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
            {metrics.verified_companies_count ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {metrics.verified_website_rate ?? 0}% website provenance ·{' '}
            {metrics.active_sources_count ?? 0} ATS sources
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Qualified Opportunities</span>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
            {metrics.qualified_jobs_count ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            Out of {metrics.unique_jobs_count ?? 0} unique jobs · {metrics.review_jobs_count ?? 0} in review
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Active CRM Applications</span>
          <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
            {metrics.applications_tracked_count ?? 0}
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            Ready: {pipelineCounts.READY_TO_APPLY || 0} · Applied: {pipelineCounts.APPLIED || 0} · Saved:{' '}
            {pipelineCounts.SAVED || 0}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400">Outreach & Public Contacts</span>
          <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
            {metrics.pending_drafts_count ?? 0}
            <span className="text-sm font-normal text-slate-400"> pending approval</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {metrics.verified_contacts_count ?? 0} verified contacts · {metrics.sent_drafts_count ?? 0} sent
          </p>
        </div>
      </div>

      {/* Application Lifecycle Funnel */}
      {funnelTotal > 0 && (
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Application Funnel</h2>
            <button
              type="button"
              onClick={() => {
                onSetPipelineSubview('pipeline');
                onNavigate('pipeline');
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Open Pipeline <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-950">
            {funnelSegments.map((seg) => (
              <div
                key={seg.key}
                className={seg.tone}
                style={{
                  width: `${((pipelineCounts[seg.key] || 0) / funnelTotal) * 100}%`,
                }}
                title={`${seg.label}: ${pipelineCounts[seg.key]}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-slate-400">
            {funnelSegments.map((seg) => (
              <span key={seg.key} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-sm ${seg.tone}`} />
                {seg.label}
                <span className="font-mono tabular-nums text-slate-300">
                  {pipelineCounts[seg.key]}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Two-Column Split: Qualified Jobs Table + Idempotent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols: Top Qualified Matches */}
        <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Qualified Job Matches (Score ≥ 80)</h2>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <span>Inspect All Jobs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {qualifiedJobsList.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Briefcase className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300">No qualified matches yet.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Run the Discovery Pipeline or Poll Live ATS Jobs to fetch real openings, then the
                evaluator will score them against your profile.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={runningPipeline}
                  onClick={onRunFullPipeline}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Pipeline
                </button>
                <button
                  type="button"
                  disabled={pollingLiveAts}
                  onClick={onPollLiveAts}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pollingLiveAts ? 'animate-spin' : ''}`} />
                  Poll Live ATS
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {qualifiedJobsList.map((job) => (
                <div
                  key={job.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/30"
                >
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-white">{job.title}</h3>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-200 font-medium">{job.company_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.work_mode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{job.location}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400">
                        Matched: {job.evaluation?.matched_skills?.join(', ')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                      {job.company_career_page && (
                        <a
                          href={job.company_career_page}
                          target="_blank"
                          rel="noopener noreferrer"
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
                          className="text-slate-400 hover:text-slate-200 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Website</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-emerald-400">
                        {job.evaluation?.score}/100
                      </div>
                      <div className="text-[11px] text-slate-500">QUALIFIED</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onFocusJob(job.id);
                        onNavigate('jobs');
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg whitespace-nowrap shrink-0"
                    >
                      View Breakdown
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 4 Cols: Idempotent Qualified-Job Notifications */}
        <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Qualified-Job Alerts ({alerts.length})
            </h2>
            <span className="text-xs text-slate-400 font-mono">Telegram / App</span>
          </div>

          {alerts.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <Bell className="w-6 h-6 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Alerts fire once per qualified job (idempotent). No notifications yet — qualified
                matches will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
              {alerts.map((al) => (
                <div key={al.id} className="p-4 space-y-1.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-white leading-snug">{al.title}</span>
                    <span className="font-mono text-[10px] text-indigo-400 shrink-0">
                      {al.delivery_channel}
                    </span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">{al.message}</p>
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                    <span>{relativeTime(al.created_at)}</span>
                    {al.read_at ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Read
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onMarkAlertRead(al.id).catch((err) =>
                            onSetBanner({ tone: 'error', text: err.message })
                          )
                        }
                        className="text-indigo-400 hover:underline font-sans"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Latest Agent Activity Strip */}
      {agentRuns.length > 0 && (
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Latest Agent Activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('agents')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              Full Audit Log <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {agentRuns.slice(0, 6).map((run) => (
              <div
                key={run.id}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] flex items-center gap-2"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    run.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                <span className="font-medium text-slate-200">{run.agent_name}</span>
                <span className="text-slate-500 font-mono tabular-nums">
                  {relativeTime(run.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
