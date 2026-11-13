import React, { useState } from 'react';
import { Plus, RefreshCw, ExternalLink, Search, Building2, Loader2 } from 'lucide-react';

interface CompaniesAndFundingProps {
  companies: any[];
  onRunFundingScout: () => Promise<void>;
  onInvestigateCompany: (companyId: string) => Promise<void>;
  onAddCompany: (payload: Record<string, any>) => Promise<void>;
}

export const CompaniesAndFundingView: React.FC<CompaniesAndFundingProps> = ({
  companies,
  onRunFundingScout,
  onInvestigateCompany,
  onAddCompany,
}) => {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [investigatingId, setInvestigatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add company form state
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [careerPage, setCareerPage] = useState('');
  const [countryCode, setCountryCode] = useState('IN');
  const [headquarters, setHeadquarters] = useState('');
  const [industry, setIndustry] = useState('Developer Tools & Cloud');
  const [roundType, setRoundType] = useState('SEED');
  const [fundingAmount, setFundingAmount] = useState('4500000');

  const filtered = companies.filter((c) => {
    if (stageFilter !== 'ALL' && c.latest_funding?.round_type !== stageFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.domain && c.domain.toLowerCase().includes(q)) ||
        (c.industry && c.industry.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Error: Company name is required.');
      return;
    }
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onAddCompany({
        name: name.trim(),
        website: website.trim() || null,
        career_page: careerPage.trim() || null,
        country_code: countryCode,
        headquarters: headquarters.trim() || null,
        industry,
        round_type: roundType,
        funding_amount: fundingAmount ? Number(fundingAmount) : null,
        currency: 'USD',
      });
      setName('');
      setWebsite('');
      setCareerPage('');
      setHeadquarters('');
      setShowAddForm(false);
      setFeedback(
        'Company registered & deduplicated by canonical domain. Run Investigate next to register its ATS source.'
      );
    } catch (err: any) {
      setErrorMsg(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleScout = async () => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onRunFundingScout();
      setFeedback(
        'Funding Scout run executed. It imports the companies passed in its payload — register target companies manually for deterministic, evidence-backed data.'
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Funding Scout run failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleInvestigate = async (companyId: string, companyName: string) => {
    setInvestigatingId(companyId);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onInvestigateCompany(companyId);
      setFeedback(
        `Investigated ${companyName}: website verified, career page & ATS provider detected, ATS source registered.`
      );
    } catch (err: any) {
      setErrorMsg(err.message || `Investigation of ${companyName} failed.`);
    } finally {
      setInvestigatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            {(['ALL', 'SEED', 'SERIES_A', 'SERIES_B'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStageFilter(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  stageFilter === st
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL' ? 'All Stages' : st.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search companies"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or domain..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={handleScout}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>Run Funding Scout</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Cancel' : 'Add Company'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2.5 rounded-lg bg-rose-950/30 border border-rose-800 text-xs text-rose-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      {feedback && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-emerald-400 flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Manual Company Registration Form */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitCompany}
          className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-white">
              Register Company Candidate (Domain Deduplication Enabled)
            </h3>
            <span className="text-xs text-slate-400">SSRF URL Validation Active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Company Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Retool"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Official Website URL</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://retool.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Careers Page URL</label>
              <input
                type="url"
                value={careerPage}
                onChange={(e) => setCareerPage(e.target.value)}
                placeholder="https://retool.com/careers"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Country Code</label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              >
                <option value="IN">IN (India)</option>
                <option value="US">US (United States)</option>
                <option value="GB">GB (United Kingdom)</option>
                <option value="DE">DE (Germany)</option>
                <option value="SG">SG (Singapore)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Headquarters</label>
              <input
                type="text"
                value={headquarters}
                onChange={(e) => setHeadquarters(e.target.value)}
                placeholder="Bengaluru, India"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Funding Stage</label>
              <select
                value={roundType}
                onChange={(e) => setRoundType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              >
                <option value="PRE_SEED">PRE_SEED</option>
                <option value="SEED">SEED</option>
                <option value="SERIES_A">SERIES_A</option>
                <option value="SERIES_B">SERIES_B</option>
                <option value="GROWTH">GROWTH</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Funding Amount (USD)</label>
              <input
                type="number"
                value={fundingAmount}
                onChange={(e) => setFundingAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{busy ? 'Saving...' : 'Save & Compute Priority'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Companies Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Verified Company & Funding Registry ({filtered.length})
          </h2>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            Priority = 0.35·Funding + 0.40·Hiring + 0.15·Growth + 0.10·Relevance
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                <th className="py-3 px-4">Company & Domain</th>
                <th className="py-3 px-4">Latest Funding & Provenance</th>
                <th className="py-3 px-4">ATS & Careers Infrastructure</th>
                <th className="py-3 px-4 text-right">Employees</th>
                <th className="py-3 px-4 text-right">Priority Score</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center space-y-2">
                    <Building2 className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm text-slate-300">
                      {companies.length === 0
                        ? 'No companies registered yet.'
                        : 'No companies match the active filters.'}
                    </p>
                    {companies.length === 0 && (
                      <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                        Register your first target company manually — the canonical domain
                        deduplication and priority scoring activate on save.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((comp) => {
                const rf = comp.latest_funding;
                const pb = comp.metadata?.priority_breakdown;
                const careerUrl = comp.career_page || comp.metadata?.career_page;
                return (
                  <tr key={comp.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{comp.name}</div>
                      <div className="text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                        {comp.website ? (
                          <a
                            href={comp.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1"
                          >
                            <span>{comp.domain || comp.website}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="font-mono text-[11px]">{comp.domain || 'No domain'}</span>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{comp.headquarters || comp.country_code || 'Global'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {rf ? (
                        <div>
                          <div className="text-slate-200 font-medium font-mono tabular-nums">
                            {rf.round_type.replace('_', ' ')}
                            {rf.amount
                              ? ` · ${rf.currency || 'USD'} ${(rf.amount / 1_000_000).toFixed(1)}M`
                              : ' · Undisclosed'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span>Event: {rf.announcement_date || 'N/A'}</span>
                            <span aria-hidden="true">·</span>
                            {rf.source_url ? (
                              <a
                                href={rf.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-300 hover:text-white hover:underline inline-flex items-center gap-1"
                              >
                                <span>{rf.source_name || 'Source'}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span>Published: {rf.publication_date}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">No funding round recorded</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 space-y-1">
                      <div className="text-slate-200">
                        ATS: <span className="font-mono">{comp.metadata?.ats_provider || 'UNKNOWN'}</span>
                        {' · '}
                        <span>{comp.open_jobs_count || 0} active roles</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                        {careerUrl && (
                          <a
                            href={careerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <span>Careers Page</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {comp.ats_source_url && (
                          <a
                            href={comp.ats_source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 hover:underline inline-flex items-center gap-1 font-mono"
                          >
                            <span>Live ATS API</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {comp.employee_count !== null ? comp.employee_count : 'Unknown'}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-emerald-400">
                        {Number(comp.hiring_priority).toFixed(1)}
                      </div>
                      {pb && (
                        <div className="text-[10px] text-slate-500">
                          F:{pb.funding_score} H:{pb.hiring_score} G:{pb.growth_score}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={investigatingId === comp.id}
                        onClick={() => handleInvestigate(comp.id, comp.name)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded text-xs font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                      >
                        {investigatingId === comp.id && (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        <span>{investigatingId === comp.id ? 'Investigating...' : 'Investigate'}</span>
                      </button>
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
