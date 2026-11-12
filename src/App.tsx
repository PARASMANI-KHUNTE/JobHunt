import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  Kanban,
  UserCheck,
  Cpu,
  Play,
  Check,
  ArrowRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { JobsAndEvaluatorView } from './features/JobsAndEvaluatorView.tsx';
import { CompaniesAndFundingView } from './features/CompaniesAndFundingView.tsx';
import { PipelineAndContactsView } from './features/PipelineAndContactsView.tsx';
import { ProfileAndAgentsView } from './features/ProfileAndAgentsView.tsx';

type NavSection =
  | 'overview'
  | 'jobs'
  | 'companies'
  | 'pipeline'
  | 'profile'
  | 'agents';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [runningPipeline, setRunningPipeline] = useState<boolean>(false);
  const [pollingLiveAts, setPollingLiveAts] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // CRM State loaded from /api/v1/*
  const [overview, setOverview] = useState<any>(null);
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentRuns, setAgentRuns] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);

  const loadAllCrmData = useCallback(async () => {
    try {
      const [
        ovRes,
        pipeRes,
        alertsRes,
        jobsRes,
        compRes,
        appsRes,
        contactsRes,
        draftsRes,
        profRes,
        agRes,
        runsRes,
        srcRes,
      ] = await Promise.all([
        fetch('/api/v1/dashboard/overview'),
        fetch('/api/v1/dashboard/pipeline'),
        fetch('/api/v1/dashboard/alerts'),
        fetch('/api/v1/jobs?status=ALL'),
        fetch('/api/v1/companies'),
        fetch('/api/v1/applications'),
        fetch('/api/v1/contacts'),
        fetch('/api/v1/outreach/drafts'),
        fetch('/api/v1/profile'),
        fetch('/api/v1/agents'),
        fetch('/api/v1/agents/runs'),
        fetch('/api/v1/monitoring/sources'),
      ]);

      if (ovRes.ok) setOverview((await ovRes.json()).data);
      if (pipeRes.ok) setPipelineCounts((await pipeRes.json()).data);
      if (alertsRes.ok) setAlerts((await alertsRes.json()).data);
      if (jobsRes.ok) setJobs((await jobsRes.json()).data);
      if (compRes.ok) setCompanies((await compRes.json()).data);
      if (appsRes.ok) setApplications((await appsRes.json()).data);
      if (contactsRes.ok) setContacts((await contactsRes.json()).data);
      if (draftsRes.ok) setDrafts((await draftsRes.json()).data);
      if (profRes.ok) setProfile((await profRes.json()).data);
      if (agRes.ok) setAgents((await agRes.json()).data);
      if (runsRes.ok) setAgentRuns((await runsRes.json()).data);
      if (srcRes.ok) setSources((await srcRes.json()).data);
    } catch (err) {
      console.error('Failed to load CRM data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllCrmData();
  }, [loadAllCrmData]);

  // End-to-End Discovery Pipeline Trigger
  const handleRunFullPipeline = async () => {
    setRunningPipeline(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/v1/agents/full-pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_network: true }),
      });
      if (!res.ok) throw new Error('Pipeline run failed');
      await loadAllCrmData();
      setBannerMessage(
        'Full Discovery Pipeline executed: Funding Scout → Investigator → Live ATS Job Hunter → Evaluator → Contact Finder completed with idempotent notifications.'
      );
    } catch (err: any) {
      setBannerMessage(`Pipeline error: ${err.message}`);
    } finally {
      setRunningPipeline(false);
    }
  };

  // Real-Time Live ATS Poll (Greenhouse & Ashby Public APIs)
  const handlePollLiveAts = async () => {
    setPollingLiveAts(true);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/v1/jobs/poll-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Live ATS poll failed');
      const json = await res.json();
      const inserted = json.data?.hunter_run?.output?.inserted ?? 0;
      const updated = json.data?.hunter_run?.output?.updated ?? 0;
      const liveFetched = json.data?.hunter_run?.output?.live_fetched ?? 0;
      await loadAllCrmData();
      setBannerMessage(
        `Live ATS Poll completed over HTTP (Greenhouse & Ashby): ${liveFetched} live postings fetched, ${inserted} new jobs added, ${updated} existing jobs refreshed & evaluated.`
      );
    } catch (err: any) {
      setBannerMessage(`Live ATS poll error: ${err.message}`);
    } finally {
      setPollingLiveAts(false);
    }
  };

  // Action Handlers passed to Feature Views
  const handleEvaluateJob = async (jobId: string) => {
    await fetch(`/api/v1/jobs/${jobId}/evaluate`, { method: 'POST' });
    await loadAllCrmData();
  };

  const handleSaveJobToPipeline = async (jobId: string) => {
    const res = await fetch(`/api/v1/jobs/${jobId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SAVED' }),
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Already in pipeline');
    }
    await loadAllCrmData();
  };

  const handleCreateDraftForJob = async (jobId: string, companyId: string) => {
    const companyContact =
      contacts.find((c) => c.company_id === companyId) || contacts[0];
    if (!companyContact) return;
    await fetch('/api/v1/outreach/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: companyContact.id, job_id: jobId }),
    });
    await loadAllCrmData();
    setActiveSection('pipeline');
  };

  const handleAddCompany = async (payload: Record<string, any>) => {
    const res = await fetch('/api/v1/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Failed to add company');
    }
    await loadAllCrmData();
  };

  const handleInvestigateCompany = async (companyId: string) => {
    await fetch(`/api/v1/companies/${companyId}/investigate`, { method: 'POST' });
    await loadAllCrmData();
  };

  const handleUpdateApplicationStatus = async (
    appId: string,
    newStatus: string,
    notes: string
  ) => {
    const res = await fetch(`/api/v1/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, notes }),
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Invalid transition');
    }
    await loadAllCrmData();
  };

  const handleAddApplicationNote = async (appId: string, notes: string) => {
    await fetch(`/api/v1/applications/${appId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    await loadAllCrmData();
  };

  const handleUpdateDraft = async (draftId: string, subject: string, body: string) => {
    await fetch(`/api/v1/outreach/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });
    await loadAllCrmData();
  };

  const handleApproveDraft = async (draftId: string) => {
    const res = await fetch(`/api/v1/outreach/drafts/${draftId}/approve`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Approval failed');
    }
    await loadAllCrmData();
  };

  const handleSendDraft = async (draftId: string) => {
    const res = await fetch(`/api/v1/outreach/drafts/${draftId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `send-${draftId}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Send blocked by safety policy');
    }
    const result = await res.json();
    await loadAllCrmData();
    return result.data;
  };

  const handleUpdateProfile = async (payload: Record<string, any>) => {
    const res = await fetch('/api/v1/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Update failed');
    }
    await loadAllCrmData();
  };

  const handleAddSkill = async (skillName: string, proficiency: string, years: number) => {
    const res = await fetch('/api/v1/profile/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skill_name: skillName,
        proficiency,
        years_experience: years,
      }),
    });
    if (!res.ok) {
      const errJson = await res.json();
      throw new Error(errJson.error?.message || 'Skill already exists');
    }
    await loadAllCrmData();
  };

  const handleDeleteSkill = async (skillId: string) => {
    await fetch(`/api/v1/profile/skills/${skillId}`, { method: 'DELETE' });
    await loadAllCrmData();
  };

  const handleTriggerAgent = async (agentName: string) => {
    await fetch(`/api/v1/agents/${agentName}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live_network: agentName === 'job-hunter' }),
    });
    await loadAllCrmData();
  };

  const handleCheckSource = async (sourceId: string) => {
    await fetch(`/api/v1/monitoring/sources/${sourceId}/check`, { method: 'POST' });
    await loadAllCrmData();
  };

  const handleMarkAlertRead = async (alertId: string) => {
    await fetch(`/api/v1/dashboard/alerts/${alertId}/read`, { method: 'PATCH' });
    await loadAllCrmData();
  };

  const sectionLabels: Record<NavSection, string> = {
    overview: 'CRM Overview & Alerts',
    jobs: 'Jobs & Match Evaluator',
    companies: 'Companies & Funding Scout',
    pipeline: 'Pipeline & Outreach Approval',
    profile: 'Candidate Profile & Rules',
    agents: 'Agents & ATS Sources',
  };

  const navItems: Array<{ id: NavSection; label: string; icon: React.ComponentType<any>; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'jobs', label: 'Jobs & Evaluator', icon: Briefcase, count: jobs.length },
    { id: 'companies', label: 'Companies & Funding', icon: Building2, count: companies.length },
    { id: 'pipeline', label: 'Pipeline & Outreach', icon: Kanban, count: applications.length },
    { id: 'profile', label: 'Candidate Profile', icon: UserCheck },
    { id: 'agents', label: 'Agents & Sources', icon: Cpu, count: sources.length },
  ];

  const metrics = overview?.metrics || {};
  const qualifiedJobsList = jobs.filter((j) => j.evaluation?.decision === 'QUALIFIED');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row font-sans">
      {/* Sidebar Navigation (256px width on desktop) */}
      <aside className="w-full lg:w-64 bg-slate-900/90 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 flex flex-col justify-between">
        <div>
          <div className="h-16 px-6 flex items-center border-b border-slate-800">
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              JobHunt OS
            </span>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Primary CRM Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span
                      className={`font-mono tabular-nums text-[11px] ${
                        isActive ? 'text-indigo-100' : 'text-slate-500'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Candidate Profile Summary in Sidebar Footer */}
        <div className="hidden lg:block p-4 border-t border-slate-800 text-xs space-y-1">
          <div className="font-semibold text-slate-200 truncate">
            {profile?.full_name || 'Paras Manikhunte'}
          </div>
          <div className="text-slate-400 font-mono tabular-nums">
            Profile v{profile?.profile_version || 1} · {profile?.skills?.length || 8} skills
          </div>
          <div className="text-[11px] text-slate-500">
            Target: Remote · ≥ INR 7,00,000
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on Left — Primary Action on Right */}
        <header className="h-16 px-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-8">
          <div className="text-sm font-medium text-slate-300 truncate">
            <span className="text-slate-500">Workspace</span>
            <span className="mx-2 text-slate-600">/</span>
            <span className="text-white font-semibold">{sectionLabels[activeSection]}</span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={pollingLiveAts}
              onClick={handlePollLiveAts}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pollingLiveAts ? 'animate-spin' : ''}`} />
              <span>{pollingLiveAts ? 'Fetching Live ATS...' : 'Poll Live ATS Jobs'}</span>
            </button>

            <button
              type="button"
              disabled={runningPipeline}
              onClick={handleRunFullPipeline}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningPipeline ? 'Running Pipeline...' : 'Run Discovery Pipeline'}</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {bannerMessage && (
            <div className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-emerald-400 flex items-center justify-between gap-4">
              <span>{bannerMessage}</span>
              <button
                type="button"
                onClick={() => setBannerMessage(null)}
                className="text-slate-400 hover:text-white shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-24 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-96 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              {/* 1. OVERVIEW DASHBOARD */}
              {activeSection === 'overview' && (
                <div className="space-y-6">
                  {/* Top Metric Strip (Tabular Numerals, Single Elevation) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400">Verified Companies</span>
                      <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                        {metrics.verified_companies_count ?? 4}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                        {metrics.verified_website_rate ?? 100}% website provenance ·{' '}
                        {metrics.active_sources_count ?? 4} ATS sources
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400">Qualified Opportunities</span>
                      <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
                        {metrics.qualified_jobs_count ?? 3}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                        Out of {metrics.unique_jobs_count ?? 5} unique jobs ·{' '}
                        {metrics.review_jobs_count ?? 1} in review
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400">Active CRM Applications</span>
                      <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                        {metrics.applications_tracked_count ?? 2}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                        Ready: {pipelineCounts.READY_TO_APPLY || 0} · Applied:{' '}
                        {pipelineCounts.APPLIED || 0} · Saved: {pipelineCounts.SAVED || 0}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                      <span className="text-xs text-slate-400">Outreach & Public Contacts</span>
                      <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                        {metrics.pending_drafts_count ?? 2}
                        <span className="text-sm font-normal text-slate-400"> pending approval</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                        {metrics.verified_contacts_count ?? 2} verified contacts ·{' '}
                        {metrics.sent_drafts_count ?? 0} sent
                      </p>
                    </div>
                  </div>

                  {/* Two-Column Split: Qualified Jobs Table + Idempotent Notifications */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left 8 Cols: Top Qualified Matches */}
                    <div className="lg:col-span-8 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">
                          Qualified Job Matches (Score ≥ 80)
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveSection('jobs')}
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          <span>Inspect All Jobs</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="divide-y divide-slate-800/80">
                        {qualifiedJobsList.map((job) => (
                          <div
                            key={job.id}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/30"
                          >
                            <div className="space-y-1">
                              <h3 className="text-sm font-semibold text-white">{job.title}</h3>
                              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                                <span className="text-slate-200 font-medium">
                                  {job.company_name}
                                </span>
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
                                onClick={() => setActiveSection('jobs')}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg whitespace-nowrap shrink-0"
                              >
                                View Breakdown
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right 4 Cols: Idempotent Qualified-Job Notifications */}
                    <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">
                          Qualified-Job Alerts ({alerts.length})
                        </h2>
                        <span className="text-xs text-slate-400 font-mono">Telegram / App</span>
                      </div>

                      <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto">
                        {alerts.map((al) => (
                          <div key={al.id} className="p-4 space-y-1.5 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-white leading-snug">
                                {al.title}
                              </span>
                              <span className="font-mono text-[10px] text-indigo-400 shrink-0">
                                {al.delivery_channel}
                              </span>
                            </div>
                            <p className="text-slate-400 leading-relaxed">{al.message}</p>
                            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 font-mono tabular-nums">
                              <span>{al.created_at.slice(0, 16).replace('T', ' ')}</span>
                              {al.read_at ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Read
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleMarkAlertRead(al.id)}
                                  className="text-indigo-400 hover:underline font-sans"
                                >
                                  Acknowledge
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. JOBS & EVALUATOR */}
              {activeSection === 'jobs' && (
                <JobsAndEvaluatorView
                  jobs={jobs}
                  onRefreshJobs={handlePollLiveAts}
                  onEvaluateJob={handleEvaluateJob}
                  onSaveJobToPipeline={handleSaveJobToPipeline}
                  onCreateDraftForJob={handleCreateDraftForJob}
                />
              )}

              {/* 3. COMPANIES & FUNDING SCOUT */}
              {activeSection === 'companies' && (
                <CompaniesAndFundingView
                  companies={companies}
                  onRunFundingScout={async () => {
                    await handleTriggerAgent('funding-scout');
                  }}
                  onInvestigateCompany={handleInvestigateCompany}
                  onAddCompany={handleAddCompany}
                />
              )}

              {/* 4. PIPELINE & OUTREACH */}
              {activeSection === 'pipeline' && (
                <PipelineAndContactsView
                  applications={applications}
                  contacts={contacts}
                  drafts={drafts}
                  jobs={jobs}
                  onUpdateApplicationStatus={handleUpdateApplicationStatus}
                  onAddApplicationNote={handleAddApplicationNote}
                  onResearchContacts={async () => {
                    await handleTriggerAgent('contact-finder');
                  }}
                  onCreateDraft={async (contactId, jobId) => {
                    await fetch('/api/v1/outreach/drafts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contact_id: contactId, job_id: jobId }),
                    });
                    await loadAllCrmData();
                  }}
                  onUpdateDraft={handleUpdateDraft}
                  onApproveDraft={handleApproveDraft}
                  onSendDraft={handleSendDraft}
                />
              )}

              {/* 5. CANDIDATE PROFILE */}
              {activeSection === 'profile' && (
                <ProfileAndAgentsView
                  mode="profile"
                  profile={profile}
                  agents={agents}
                  agentRuns={agentRuns}
                  sources={sources}
                  onUpdateProfile={handleUpdateProfile}
                  onAddSkill={handleAddSkill}
                  onDeleteSkill={handleDeleteSkill}
                  onTriggerAgent={handleTriggerAgent}
                  onCheckSource={handleCheckSource}
                />
              )}

              {/* 6. AGENTS & ATS SOURCES */}
              {activeSection === 'agents' && (
                <ProfileAndAgentsView
                  mode="agents"
                  profile={profile}
                  agents={agents}
                  agentRuns={agentRuns}
                  sources={sources}
                  onUpdateProfile={handleUpdateProfile}
                  onAddSkill={handleAddSkill}
                  onDeleteSkill={handleDeleteSkill}
                  onTriggerAgent={handleTriggerAgent}
                  onCheckSource={handleCheckSource}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
