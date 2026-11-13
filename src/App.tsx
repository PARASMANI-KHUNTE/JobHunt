import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  AlertTriangle,
  CheckCircle2,
  Info,
  RotateCw,
  Bell,
  Sparkles,
  Circle,
  Loader2,
} from 'lucide-react';
import { OverviewDashboard } from './features/OverviewDashboard.tsx';
import { JobsAndEvaluatorView } from './features/JobsAndEvaluatorView.tsx';
import { CompaniesAndFundingView } from './features/CompaniesAndFundingView.tsx';
import { PipelineAndContactsView } from './features/PipelineAndContactsView.tsx';
import { ProfileAndAgentsView } from './features/ProfileAndAgentsView.tsx';
import { Banner, relativeTime, extractApiError, type BannerTone } from './lib/ui.ts';
import type {
  ParseResumePayload,
  ParseResumeResult,
  ApplyResumePayload,
  ApplyResumeResult,
} from './lib/resume.ts';

type NavSection =
  | 'overview'
  | 'jobs'
  | 'companies'
  | 'pipeline'
  | 'profile'
  | 'agents';

// Server-side stages of the full discovery pipeline (displayed as a stepper overlay)
const PIPELINE_STAGES = [
  { label: 'Funding Scout', desc: 'Import funded startups & rounds' },
  { label: 'Company Investigator', desc: 'Verify websites & register ATS sources' },
  { label: 'Live Job Hunter', desc: 'Poll Greenhouse / Lever / Ashby over HTTP' },
  { label: 'Match Evaluator', desc: 'Hard filters + 100-point scoring' },
  { label: 'Contact Finder', desc: 'Public recruiter contacts & provenance' },
];

function summarizePipelineOutput(output: any): string {
  if (!output) return 'Full Discovery Pipeline completed.';
  const parts: string[] = [];
  if (output.funding_scout)
    parts.push(`Scout +${output.funding_scout.new_companies_created ?? 0} companies`);
  if (output.company_investigator)
    parts.push(
      `Investigator verified ${output.company_investigator.companies_investigated ?? 0} · +${output.company_investigator.new_sources_registered ?? 0} ATS sources`
    );
  if (output.job_hunter)
    parts.push(
      `Hunter +${output.job_hunter.new_jobs_count ?? 0} new / ${output.job_hunter.updated_jobs_count ?? 0} refreshed`
    );
  if (output.job_evaluator)
    parts.push(
      `Evaluator: ${output.job_evaluator.qualified ?? 0} qualified / ${output.job_evaluator.review ?? 0} review`
    );
  if (output.contact_finder)
    parts.push(`Contacts +${output.contact_finder.new_contacts_found ?? 0}`);
  return parts.length > 0
    ? `Full Discovery Pipeline executed — ${parts.join(' · ')}.`
    : 'Full Discovery Pipeline executed.';
}

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [runningPipeline, setRunningPipeline] = useState<boolean>(false);
  const [pipelineStage, setPipelineStage] = useState<number>(-1); // -1 hidden, 0..4 in progress, 5 complete
  const [pollingLiveAts, setPollingLiveAts] = useState<boolean>(false);
  const [banner, setBanner] = useState<{ tone: BannerTone; text: string } | null>(null);

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

  // Cross-section workflow state
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [pipelineSubview, setPipelineSubview] = useState<'pipeline' | 'outreach'>('pipeline');

  const loadAllCrmData = useCallback(async () => {
    setRefreshing(true);
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

      const allFailed = [ovRes, pipeRes, alertsRes, jobsRes, compRes, appsRes, contactsRes, draftsRes, profRes, agRes, runsRes, srcRes].every(
        (r) => !r.ok
      );
      setLoadError(allFailed ? 'CRM API unreachable — is the JobHunt OS server running?' : null);
      if (!allFailed) setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load CRM data:', err);
      setLoadError('CRM API unreachable — is the JobHunt OS server running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllCrmData();
  }, [loadAllCrmData]);

  // Auto-dismiss success/info banners after 8 seconds (errors stay until dismissed)
  useEffect(() => {
    if (!banner || banner.tone === 'error') return;
    const t = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(t);
  }, [banner]);

  // Keyboard shortcuts: 1–6 switch sections (ignored while typing in fields)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const order: NavSection[] = ['overview', 'jobs', 'companies', 'pipeline', 'profile', 'agents'];
      const idx = Number(e.key);
      if (idx >= 1 && idx <= 6) setActiveSection(order[idx - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // End-to-End Discovery Pipeline Trigger (5 deterministic stages)
  const handleRunFullPipeline = async () => {
    setRunningPipeline(true);
    setBanner(null);
    setPipelineStage(0);
    const timer = setInterval(() => setPipelineStage((s) => Math.min(s + 1, 4)), 1200);
    try {
      const res = await fetch('/api/v1/agents/full-pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live_network: true }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Pipeline run failed'));
      const json = await res.json();
      clearInterval(timer);
      setPipelineStage(5);
      await loadAllCrmData();
      setBanner({ tone: 'success', text: summarizePipelineOutput(json.data?.output) });
      setTimeout(() => setPipelineStage(-1), 1400);
    } catch (err: any) {
      clearInterval(timer);
      setPipelineStage(-1);
      setBanner({ tone: 'error', text: `Pipeline error: ${err.message}` });
    } finally {
      setRunningPipeline(false);
    }
  };

  // Real-Time Live ATS Poll (Greenhouse & Ashby Public APIs)
  const handlePollLiveAts = async () => {
    setPollingLiveAts(true);
    setBanner(null);
    try {
      const res = await fetch('/api/v1/jobs/poll-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Live ATS poll failed'));
      const json = await res.json();
      const output = json.data?.hunter_run?.output || {};
      const liveFetched = output.live_network_jobs_fetched ?? 0;
      const inserted = output.new_jobs_count ?? 0;
      const updated = output.updated_jobs_count ?? 0;
      await loadAllCrmData();
      setBanner({
        tone: 'success',
        text: `Live ATS Poll completed over HTTP (Greenhouse & Ashby): ${liveFetched} live postings fetched · ${inserted} new jobs added · ${updated} existing jobs refreshed & re-evaluated.`,
      });
    } catch (err: any) {
      setBanner({ tone: 'error', text: `Live ATS poll error: ${err.message}` });
    } finally {
      setPollingLiveAts(false);
    }
  };

  // Action Handlers passed to Feature Views (all surface API errors)
  const handleEvaluateJob = async (jobId: string) => {
    const res = await fetch(`/api/v1/jobs/${jobId}/evaluate`, { method: 'POST' });
    if (!res.ok) throw new Error(await extractApiError(res, 'Re-evaluation failed'));
    await loadAllCrmData();
  };

  const handleSaveJobToPipeline = async (jobId: string) => {
    const res = await fetch(`/api/v1/jobs/${jobId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SAVED' }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Already in pipeline'));
    await loadAllCrmData();
  };

  const handleCreateDraftForJob = async (jobId: string, companyId: string) => {
    const companyContact = contacts.find((c) => c.company_id === companyId);
    if (!companyContact) {
      setBanner({
        tone: 'error',
        text: 'No public contact found for this company yet — run Contact Finder in Pipeline & Outreach first.',
      });
      return;
    }
    const existing = drafts.find((d) => d.contact_id === companyContact.id && d.job_id === jobId);
    if (existing) {
      setPipelineSubview('outreach');
      setActiveSection('pipeline');
      setBanner({
        tone: 'info',
        text: `A draft to ${companyContact.name} for this job already exists — review it in the Outreach queue.`,
      });
      return;
    }
    const res = await fetch('/api/v1/outreach/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: companyContact.id, job_id: jobId }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Failed to create outreach draft'));
    await loadAllCrmData();
    setPipelineSubview('outreach');
    setActiveSection('pipeline');
    setBanner({
      tone: 'success',
      text: `Personalized draft generated for ${companyContact.name} — locked to PENDING_APPROVAL until you approve it.`,
    });
  };

  const handleAddCompany = async (payload: Record<string, any>) => {
    const res = await fetch('/api/v1/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Failed to add company'));
    await loadAllCrmData();
  };

  const handleInvestigateCompany = async (companyId: string) => {
    const res = await fetch(`/api/v1/companies/${companyId}/investigate`, { method: 'POST' });
    if (!res.ok) throw new Error(await extractApiError(res, 'Investigation failed'));
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
    if (!res.ok) throw new Error(await extractApiError(res, 'Invalid transition'));
    await loadAllCrmData();
  };

  const handleAddApplicationNote = async (appId: string, notes: string) => {
    const res = await fetch(`/api/v1/applications/${appId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Could not append activity note'));
    await loadAllCrmData();
  };

  const handleUpdateDraft = async (draftId: string, subject: string, body: string) => {
    const res = await fetch(`/api/v1/outreach/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Draft save failed'));
    await loadAllCrmData();
  };

  const handleDiscardDraft = async (draftId: string) => {
    const res = await fetch(`/api/v1/outreach/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'DISCARDED' }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Could not discard draft'));
    await loadAllCrmData();
  };

  const handleApproveDraft = async (draftId: string) => {
    const res = await fetch(`/api/v1/outreach/drafts/${draftId}/approve`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Approval failed'));
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
    if (!res.ok) throw new Error(await extractApiError(res, 'Send blocked by safety policy'));
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
    if (!res.ok) throw new Error(await extractApiError(res, 'Update failed'));
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
    if (!res.ok) throw new Error(await extractApiError(res, 'Skill already exists'));
    await loadAllCrmData();
  };

  const handleDeleteSkill = async (skillId: string) => {
    const res = await fetch(`/api/v1/profile/skills/${skillId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await extractApiError(res, 'Could not remove skill'));
    await loadAllCrmData();
  };

  // Resume Import: parse-only (no persistence) — user reviews before applying
  const handleParseResume = async (payload: ParseResumePayload): Promise<ParseResumeResult> => {
    const res = await fetch('/api/v1/profile/resume/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Resume parsing failed'));
    const json = await res.json();
    return json.data as ParseResumeResult;
  };

  // Resume Import: apply reviewed data to the profile (persist + re-score jobs)
  const handleApplyResume = async (payload: ApplyResumePayload): Promise<ApplyResumeResult> => {
    const res = await fetch('/api/v1/profile/resume/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await extractApiError(res, 'Resume import failed'));
    const json = await res.json();
    await loadAllCrmData();
    return json.data as ApplyResumeResult;
  };

  const handleTriggerAgent = async (agentName: string) => {
    const res = await fetch(`/api/v1/agents/${agentName}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live_network: agentName === 'job-hunter' }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, `Agent ${agentName} run failed`));
    await loadAllCrmData();
  };

  const handleCheckSource = async (sourceId: string) => {
    const res = await fetch(`/api/v1/monitoring/sources/${sourceId}/check`, { method: 'POST' });
    if (!res.ok) throw new Error(await extractApiError(res, 'Source check failed'));
    await loadAllCrmData();
  };

  const handleMarkAlertRead = async (alertId: string) => {
    const res = await fetch(`/api/v1/dashboard/alerts/${alertId}/read`, { method: 'PATCH' });
    if (!res.ok) throw new Error(await extractApiError(res, 'Could not mark alert as read'));
    await loadAllCrmData();
  };

  // Navigation metadata
  const sectionLabels: Record<NavSection, string> = {
    overview: 'CRM Overview & Alerts',
    jobs: 'Jobs & Match Evaluator',
    companies: 'Companies & Funding Scout',
    pipeline: 'Pipeline & Outreach Approval',
    profile: 'Candidate Profile & Rules',
    agents: 'Agents & ATS Sources',
  };

  const unreadAlertCount = alerts.filter((a) => !a.read_at).length;

  const navItems: Array<{ id: NavSection; label: string; icon: React.ComponentType<any>; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, count: unreadAlertCount > 0 ? unreadAlertCount : undefined },
    { id: 'jobs', label: 'Jobs & Evaluator', icon: Briefcase, count: jobs.length },
    { id: 'companies', label: 'Companies & Funding', icon: Building2, count: companies.length },
    { id: 'pipeline', label: 'Pipeline & Outreach', icon: Kanban, count: applications.length },
    { id: 'profile', label: 'Candidate Profile', icon: UserCheck, count: profile?.skills?.length },
    { id: 'agents', label: 'Agents & Sources', icon: Cpu, count: sources.length },
  ];

  const metrics = overview?.metrics || {};
  const qualifiedJobsList = useMemo(
    () => jobs.filter((j) => j.evaluation?.decision === 'QUALIFIED'),
    [jobs]
  );

  // Onboarding checklist state (drives the first-run workflow)
  const onboarding = useMemo(() => {
    const profileDone = Boolean(profile?.full_name) && (profile?.skills?.length ?? 0) > 0;
    const companiesDone = companies.length > 0;
    const sourcesDone = sources.length > 0;
    const jobsDone = jobs.length > 0;
    const allDone = profileDone && companiesDone && sourcesDone && jobsDone;
    return { profileDone, companiesDone, sourcesDone, jobsDone, allDone };
  }, [profile, companies, sources, jobs]);

  const funnelSegments = [
    { key: 'SAVED', label: 'Saved', tone: 'bg-slate-500' },
    { key: 'READY_TO_APPLY', label: 'Ready', tone: 'bg-amber-500' },
    { key: 'APPLIED', label: 'Applied', tone: 'bg-indigo-500' },
    { key: 'SHORTLISTED', label: 'Shortlisted', tone: 'bg-cyan-500' },
    { key: 'INTERVIEWING', label: 'Interviewing', tone: 'bg-sky-400' },
    { key: 'OFFER', label: 'Offer', tone: 'bg-emerald-500' },
    { key: 'REJECTED', label: 'Rejected', tone: 'bg-rose-500' },
    { key: 'GHOSTED', label: 'Ghosted', tone: 'bg-slate-700' },
  ].filter((seg) => (pipelineCounts[seg.key] || 0) > 0);

  const funnelTotal = funnelSegments.reduce((sum, seg) => sum + (pipelineCounts[seg.key] || 0), 0);

  const bannerStyles: Record<BannerTone, string> = {
    success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    info: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  };
  const bannerIcon: Record<BannerTone, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 shrink-0" />,
    error: <AlertTriangle className="w-4 h-4 shrink-0" />,
    info: <Info className="w-4 h-4 shrink-0" />,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row font-sans">
      {/* Sidebar Navigation (256px width on desktop) */}
      <aside className="w-full lg:w-64 bg-slate-900/90 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 flex flex-col justify-between">
        <div>
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800">
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              JobHunt OS
            </span>
            {unreadAlertCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                <Bell className="w-3 h-3" />
                {unreadAlertCount}
              </span>
            )}
          </div>

          {/* Primary Navigation: Responsive horizontal scroll on mobile (<lg), vertical stack on desktop (>=lg). Future UX improvement: collapsible hamburger drawer. */}
          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Primary CRM Navigation">
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  title={`${item.label} (shortcut: ${idx + 1})`}
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
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`font-mono tabular-nums text-[11px] px-1.5 rounded ${
                        isActive
                          ? 'text-indigo-100 bg-indigo-500/40'
                          : item.id === 'overview'
                          ? 'text-amber-400'
                          : 'text-slate-500'
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

        {/* Candidate Profile Summary in Sidebar Footer (real data) */}
        <div className="hidden lg:block p-4 border-t border-slate-800 text-xs space-y-1">
          <div className="font-semibold text-slate-200 truncate">
            {profile?.full_name || 'Candidate profile not set'}
          </div>
          <div className="text-slate-400 font-mono tabular-nums">
            Profile v{profile?.profile_version ?? 1} · {profile?.skills?.length ?? 0} skills
          </div>
          <div className="text-[11px] text-slate-500">
            Target:{' '}
            {profile?.preferences?.remote_only ? 'Remote' : 'Any mode'} · ≥{' '}
            {(profile?.preferences?.minimum_salary ?? 0).toLocaleString()}{' '}
            {profile?.preferences?.salary_currency || 'INR'}
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar: Breadcrumb + Workspace Actions */}
        <header className="h-16 px-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between gap-4">
          <div className="text-sm font-medium text-slate-300 truncate">
            <span className="text-slate-500">Workspace</span>
            <span className="mx-2 text-slate-600">/</span>
            <span className="text-white font-semibold">{sectionLabels[activeSection]}</span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {lastRefreshed && (
              <span className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Synced {relativeTime(lastRefreshed.toISOString())}
              </span>
            )}
            <button
              type="button"
              onClick={loadAllCrmData}
              disabled={refreshing}
              title="Reload all CRM data"
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              disabled={pollingLiveAts || runningPipeline}
              onClick={handlePollLiveAts}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pollingLiveAts ? 'animate-spin' : ''}`} />
              <span>{pollingLiveAts ? 'Fetching Live ATS...' : 'Poll Live ATS Jobs'}</span>
            </button>

            <button
              type="button"
              disabled={runningPipeline || pollingLiveAts}
              onClick={handleRunFullPipeline}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{runningPipeline ? 'Running Pipeline...' : 'Run Discovery Pipeline'}</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {loadError && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300 flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {loadError}
              </span>
              <button
                type="button"
                onClick={loadAllCrmData}
                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg font-medium shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {banner && (
            <div
              className={`px-4 py-3 rounded-xl border text-xs flex items-start justify-between gap-4 ${bannerStyles[banner.tone]}`}
              role="status"
            >
              <span className="flex items-start gap-2 leading-relaxed">
                {bannerIcon[banner.tone]}
                <span>{banner.text}</span>
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-slate-400 hover:text-white shrink-0"
                aria-label="Dismiss notification"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Full Pipeline Stage Overlay */}
          {pipelineStage >= 0 && (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Discovery Pipeline — 5 Deterministic Stages
                </h2>
                <span className="text-xs font-mono text-indigo-300">
                  {pipelineStage >= 5 ? 'COMPLETED' : `Stage ${Math.min(pipelineStage + 1, 5)} / 5`}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {PIPELINE_STAGES.map((stage, idx) => {
                  const done = pipelineStage > idx || pipelineStage >= 5;
                  const active = pipelineStage === idx && pipelineStage < 5;
                  return (
                    <div
                      key={stage.label}
                      className={`p-3 rounded-lg border text-xs space-y-1 transition-colors ${
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : active
                          ? 'border-indigo-500/50 bg-indigo-500/10'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                        {done ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : active ? (
                          <Loader2 className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-spin" />
                        ) : (
                          <Circle className="w-3 h-3 text-slate-600 shrink-0" />
                        )}
                        <span>{stage.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">{stage.desc}</p>
                    </div>
                  );
                })}
              </div>
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
                <OverviewDashboard
                  onboarding={onboarding}
                  metrics={metrics}
                  pipelineCounts={pipelineCounts}
                  funnelSegments={funnelSegments}
                  funnelTotal={funnelTotal}
                  qualifiedJobsList={qualifiedJobsList}
                  alerts={alerts}
                  agentRuns={agentRuns}
                  runningPipeline={runningPipeline}
                  pollingLiveAts={pollingLiveAts}
                  onNavigate={setActiveSection}
                  onSetPipelineSubview={setPipelineSubview}
                  onRunFullPipeline={handleRunFullPipeline}
                  onPollLiveAts={handlePollLiveAts}
                  onFocusJob={(id) => setFocusJobId(id)}
                  onMarkAlertRead={handleMarkAlertRead}
                  onSetBanner={setBanner}
                />
              )}

              {/* 2. JOBS & EVALUATOR */}
              {activeSection === 'jobs' && (
                <JobsAndEvaluatorView
                  jobs={jobs}
                  focusJobId={focusJobId}
                  onFocusJobConsumed={() => setFocusJobId(null)}
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
                  subView={pipelineSubview}
                  onSubViewChange={setPipelineSubview}
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
                    const res = await fetch('/api/v1/outreach/drafts', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ contact_id: contactId, job_id: jobId }),
                    });
                    if (!res.ok) throw new Error(await extractApiError(res, 'Draft creation failed'));
                    await loadAllCrmData();
                  }}
                  onUpdateDraft={handleUpdateDraft}
                  onDiscardDraft={handleDiscardDraft}
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
                  onParseResume={handleParseResume}
                  onApplyResume={handleApplyResume}
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
                  onParseResume={handleParseResume}
                  onApplyResume={handleApplyResume}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
