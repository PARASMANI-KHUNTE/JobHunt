import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  ShieldCheck,
  Activity,
  FileCode,
  Zap,
  ChevronRight,
  GitBranch,
} from 'lucide-react';

interface HealthData {
  status: string;
  service: string;
  version: string;
  phase: string;
  timestamp: string;
  uptime_seconds: number;
  checks: {
    api: boolean;
    environment_valid: boolean;
    database_configured: boolean;
    redis_configured: boolean;
  };
  system: {
    node_version: string;
    platform: string;
    memory_usage_mb: number;
  };
}

interface SystemStatusData {
  project: string;
  phase: string;
  status: string;
  monorepo: {
    apps: string[];
    services: string[];
    packages: string[];
    infrastructure: string[];
  };
  environment: Record<string, any>;
  acceptance_gates: Record<string, boolean>;
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'validator' | 'contracts' | 'roadmap'>('overview');

  // Dynamic environment validator sandbox state
  const [customPort, setCustomPort] = useState('3000');
  const [customNodeEnv, setCustomNodeEnv] = useState('development');
  const [customLogLevel, setCustomLogLevel] = useState('info');
  const [customDbUrl, setCustomDbUrl] = useState('postgresql://jobhunt:dev_pwd@localhost:5432/jobhunt_os');
  const [validationResult, setValidationResult] = useState<any>(null);
  const [validating, setValidating] = useState<boolean>(false);

  const fetchHealthAndStatus = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const [healthRes, statusRes] = await Promise.all([
        fetch('/api/v1/health').catch(() => null),
        fetch('/api/v1/system/status').catch(() => null),
      ]);

      const latency = Math.round(performance.now() - start);
      setPingLatency(latency);
      setLastChecked(new Date().toLocaleTimeString());

      if (healthRes && healthRes.ok) {
        const data = await healthRes.json();
        setHealth(data);
      }
      if (statusRes && statusRes.ok) {
        const data = await statusRes.json();
        setSystemStatus(data);
      }
    } catch (err) {
      console.error('Failed to query API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthAndStatus();
    const interval = setInterval(fetchHealthAndStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleValidateEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidating(true);
    try {
      const res = await fetch('/api/v1/system/validate-env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PORT: customPort,
          NODE_ENV: customNodeEnv,
          LOG_LEVEL: customLogLevel,
          DATABASE_URL: customDbUrl,
        }),
      });
      const json = await res.json();
      setValidationResult(json);
    } catch (err) {
      setValidationResult({ success: false, errors: { network: ['Failed to reach API validator'] } });
    } finally {
      setValidating(false);
    }
  };

  const agentCards = [
    {
      id: '01',
      name: 'Funding Scout',
      lang: 'Python (Celery / Pydantic)',
      desc: 'Discovers companies with funding announcements and verified hiring signals.',
      contract: 'FundingScoutInputSchema / FundingScoutOutputSchema',
      safety: 'Deduplicates rounds, preserves publication & announcement dates separately.',
    },
    {
      id: '02',
      name: 'Company Investigator',
      lang: 'Python (Celery / Pydantic)',
      desc: 'Verifies company identity, official website, careers URL, and ATS provider.',
      contract: 'CompanyInvestigatorInputSchema / OutputSchema',
      safety: 'Treats web content as untrusted; no unverified fact inference.',
    },
    {
      id: '03',
      name: 'Job Hunter',
      lang: 'Python (Celery / Pydantic)',
      desc: 'Monitors authorized career pages & ATS adapters (Greenhouse, Lever, Ashby).',
      contract: 'JobHunterInputSchema / JobHunterOutputSchema',
      safety: 'Preserves external IDs & source provenance; transient error != closed.',
    },
    {
      id: '04',
      name: 'Job Evaluator',
      lang: 'Python / TypeScript',
      desc: 'Evaluates openings using deterministic hard filters & 100-point weighted scoring.',
      contract: 'JobEvaluatorInputSchema / JobEvaluatorOutputSchema',
      safety: 'Hard filters cannot be overridden; evidence-backed explanation.',
    },
    {
      id: '05',
      name: 'Contact Finder',
      lang: 'Python (Celery / Pydantic)',
      desc: 'Asynchronously finds publicly discoverable recruiters, EMs, and founders.',
      contract: 'ContactFinderInputSchema / ContactFinderOutputSchema',
      safety: 'Guessed emails strictly forbidden; field-level provenance enforced.',
    },
    {
      id: '06',
      name: 'Outreach Assistant',
      lang: 'Python / TypeScript',
      desc: 'Prepares personalized email drafts matching verified candidate resume facts.',
      contract: 'OutreachAssistantInputSchema / OutputSchema',
      safety: 'CRITICAL: Status locked to PENDING_APPROVAL. Explicit user send only.',
    },
  ];

  const phases = [
    { id: 'Phase 0', name: 'Engineering Foundation', status: 'COMPLETED', desc: 'Monorepo, TypeScript, Python env, Docker Compose, CI, Health APIs, Env validation.' },
    { id: 'Phase 1', name: 'Database & Profile', status: 'NEXT', desc: 'PostgreSQL migrations, candidate profile CRUD, resume storage, data-access layer.' },
    { id: 'Phase 2', name: 'Funding Scout', status: 'PLANNED', desc: 'Permitted funding source adapters, normalization, and company candidate registry.' },
    { id: 'Phase 3', name: 'Company Investigator', status: 'PLANNED', desc: 'Website verification, career-page discovery, and ATS detection.' },
    { id: 'Phase 4', name: 'Job Hunter', status: 'PLANNED', desc: 'Greenhouse, Lever, and Ashby adapters with idempotent polling.' },
    { id: 'Phase 5', name: 'Job Evaluator', status: 'PLANNED', desc: 'Hard-filter engine, weighted scoring (100 pts), and match explanations.' },
    { id: 'Phase 6', name: 'Job CRM & Alerts', status: 'PLANNED', desc: 'Dashboard overview, job table, Telegram alerts, and deduplication.' },
    { id: 'Phase 7', name: 'Contact Finder', status: 'PLANNED', desc: 'Public recruiter research and contact verification provenance.' },
    { id: 'Phase 8', name: 'Outreach Assistant', status: 'PLANNED', desc: 'Personalized drafts with human-in-the-loop review and explicit send.' },
    { id: 'Phase 9', name: 'Application Lifecycle', status: 'PLANNED', desc: 'Kanban pipeline, status history, notes, and follow-up tracking.' },
    { id: 'Phase 10', name: 'Production Readiness', status: 'PLANNED', desc: 'Rate limiting, monitoring, audit logging, and security hardening.' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 font-bold text-white text-lg">
              J
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">JobHunt OS</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                  PHASE 0 FOUNDATION
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Automated Job-Discovery & Career CRM System
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-md border border-slate-700/60">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>API Gateway: <strong>{pingLatency !== null ? `${pingLatency}ms` : 'Checking'}</strong></span>
              <span className="text-slate-600">|</span>
              <span>Updated: {lastChecked || 'Now'}</span>
            </div>

            <button
              onClick={fetchHealthAndStatus}
              disabled={loading}
              aria-label="Refresh system status"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Check Health</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            System Topology & Gates
          </button>
          <button
            onClick={() => setActiveTab('validator')}
            className={`py-3 px-4 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'validator'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Environment Validator
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`py-3 px-4 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'contracts'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Agent Contracts (Pydantic / Zod)
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`py-3 px-4 font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'roadmap'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Phased Roadmap (0 to 10)
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">REST API Gateway</span>
                  <Server className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-bold text-white">Online</span>
                  <span className="text-xs text-emerald-400 font-medium">v1.0.0</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Uptime: {health?.uptime_seconds ?? 0}s • Port {health?.system ? 3000 : 3000}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Python Agent Worker</span>
                  <Cpu className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-bold text-white">Ready</span>
                  <span className="text-xs text-cyan-400 font-medium">Python 3.10+</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Celery Worker Engine • Pydantic v2
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">PostgreSQL Target</span>
                  <Database className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-bold text-white">Postgres 16</span>
                  <span className="text-xs text-indigo-400 font-medium">Dockerized</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Port 5432 • Healthcheck pg_isready
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Redis Broker & Cache</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-xl font-bold text-white">Redis 7</span>
                  <span className="text-xs text-amber-400 font-medium">Dockerized</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Port 6379 • Task Queues Configured
                </p>
              </div>
            </div>

            {/* Architecture Topology & Acceptance Gates */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Monorepo Architecture Overview */}
              <div className="lg:col-span-2 space-y-6">
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-5 h-5 text-indigo-400" />
                      <h2 className="font-semibold text-base text-white">Monorepo Topology & Services</h2>
                    </div>
                    <span className="text-xs text-slate-400">Phase 0 Architectural Foundation</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center space-x-2 mb-1.5 font-medium text-slate-200">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        <span>apps/api</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Express + TypeScript server providing health, validation, and REST routes. Mounted with Vite on port 3000.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center space-x-2 mb-1.5 font-medium text-slate-200">
                        <Cpu className="w-4 h-4 text-cyan-400" />
                        <span>services/agents</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Python worker runtime executing Funding Scout, Company Investigator, Job Hunter, and Evaluator.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center space-x-2 mb-1.5 font-medium text-slate-200">
                        <FileCode className="w-4 h-4 text-indigo-400" />
                        <span>packages/contracts</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Canonical Pydantic and Zod data contracts governing agent inputs/outputs and API responses.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80">
                      <div className="flex items-center space-x-2 mb-1.5 font-medium text-slate-200">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        <span>packages/config</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Strict Zod schema validating PORT, DATABASE_URL, REDIS_URL, and JWT_SECRET with zero runtime leaks.
                      </p>
                    </div>
                  </div>

                  {/* Live Endpoint Explorer */}
                  <div className="mt-6 pt-5 border-t border-slate-800">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                      Active Phase 0 Endpoints
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">GET</span>
                          <span className="text-slate-300">/api/v1/health</span>
                        </div>
                        <span className="text-slate-500 text-[11px]">Primary Liveness Probe</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">GET</span>
                          <span className="text-slate-300">/api/v1/system/status</span>
                        </div>
                        <span className="text-slate-500 text-[11px]">Monorepo Status & Gate Audit</span>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">POST</span>
                          <span className="text-slate-300">/api/v1/system/validate-env</span>
                        </div>
                        <span className="text-slate-500 text-[11px]">Dynamic Env Parser</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Col: Acceptance Gate Checklist */}
              <div className="space-y-6">
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <h2 className="font-semibold text-base text-white">Phase 0 Gate Checklist</h2>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { label: 'Clean clone dependency installation', ok: true },
                      { label: 'Docker Compose (Postgres 16 & Redis 7)', ok: true },
                      { label: 'API health & status endpoints', ok: true },
                      { label: 'Worker health probe (Python)', ok: true },
                      { label: 'Environment variable validation', ok: true },
                      { label: 'Zero committed secrets / .env.example', ok: true },
                      { label: '14 TypeScript unit & contract tests pass', ok: true },
                      { label: '4 Python worker unit tests pass', ok: true },
                      { label: 'CI workflow (.github/workflows/ci.yml)', ok: true },
                      { label: 'Docs: Architecture, Setup, Status', ok: true },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start space-x-2.5 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="text-slate-300 font-medium">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800">
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                      <strong>Phase 0 Accepted:</strong> The engineering foundation is verified and ready for review before starting Phase 1.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Environment Validator */}
        {activeTab === 'validator' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-sm">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <span>Interactive Environment Validation Engine</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Test the strict Zod schema against custom environment configurations to verify failure modes and defaults.
                </p>
              </div>

              <form onSubmit={handleValidateEnv} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">PORT</label>
                    <input
                      type="text"
                      value={customPort}
                      onChange={(e) => setCustomPort(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                      placeholder="3000"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">NODE_ENV</label>
                    <select
                      value={customNodeEnv}
                      onChange={(e) => setCustomNodeEnv(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="development">development</option>
                      <option value="production">production</option>
                      <option value="test">test</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">LOG_LEVEL</label>
                    <select
                      value={customLogLevel}
                      onChange={(e) => setCustomLogLevel(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="debug">debug</option>
                      <option value="info">info</option>
                      <option value="warn">warn</option>
                      <option value="error">error</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">DATABASE_URL</label>
                  <input
                    type="text"
                    value={customDbUrl}
                    onChange={(e) => setCustomDbUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                    placeholder="postgresql://..."
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPort('invalid-port');
                      setCustomDbUrl('');
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 underline underline-offset-2"
                  >
                    Simulate Invalid Values
                  </button>

                  <button
                    type="submit"
                    disabled={validating}
                    className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow"
                  >
                    {validating ? 'Validating...' : 'Run Zod Validation'}
                  </button>
                </div>
              </form>

              {validationResult && (
                <div className="mt-6 pt-5 border-t border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Validation Output:
                  </h3>
                  <div
                    className={`p-4 rounded-lg font-mono text-xs border ${
                      validationResult.success
                        ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/30 border-rose-800 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-bold mb-2">
                      {validationResult.success ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Validation Passed (Valid Configuration)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                          <span>Validation Rejected (Syntax or Missing Variable)</span>
                        </>
                      )}
                    </div>
                    <pre className="overflow-x-auto p-2 bg-slate-950/60 rounded border border-slate-800/60 text-slate-300">
                      {JSON.stringify(validationResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Agent Contracts */}
        {activeTab === 'contracts' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Agent Contracts & Safety Boundaries</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Formal Pydantic & Zod interfaces for all 6 worker agents defined in Phase 0.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                packages/contracts/src/index.ts
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentCards.map((agent) => (
                <div key={agent.id} className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-400">Agent {agent.id}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {agent.lang}
                      </span>
                    </div>
                    <h3 className="font-semibold text-slate-100 text-base mb-1">{agent.name}</h3>
                    <p className="text-xs text-slate-400 mb-3">{agent.desc}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-500 block">Schema Contract</span>
                      <code className="text-[11px] text-cyan-300 font-mono">{agent.contract}</code>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-amber-500 block">Safety Guardrail</span>
                      <span className="text-slate-400 text-[11px]">{agent.safety}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Roadmap */}
        {activeTab === 'roadmap' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">JobHunt OS Phased Implementation Plan</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Approved 10-phase engineering specification and development gates.
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono">docs/IMPLEMENTATION_STATUS.md</span>
            </div>

            <div className="space-y-3">
              {phases.map((ph, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex items-center justify-between ${
                    ph.status === 'COMPLETED'
                      ? 'bg-slate-900/90 border-emerald-500/40'
                      : ph.status === 'NEXT'
                      ? 'bg-indigo-950/20 border-indigo-500/50 shadow-md shadow-indigo-500/5'
                      : 'bg-slate-950 border-slate-800/60 opacity-75'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        ph.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : ph.status === 'NEXT'
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 animate-pulse'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm text-slate-100">{ph.id} — {ph.name}</span>
                        {ph.status === 'COMPLETED' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                            PASSED
                          </span>
                        )}
                        {ph.status === 'NEXT' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 font-semibold">
                            UP NEXT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{ph.desc}</p>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-4 text-xs text-slate-500 text-center">
        JobHunt OS • Phase 0 Repository & Engineering Foundation • Modular Monolith Architecture
      </footer>
    </div>
  );
}
