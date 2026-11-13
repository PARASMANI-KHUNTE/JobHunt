import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Play,
  Check,
  ExternalLink,
  Upload,
  FileText,
  X,
  Sparkles,
  Briefcase,
  GraduationCap,
  Loader2,
} from 'lucide-react';
import { fileToParsePayload } from '../lib/resume.ts';
import type {
  ParseResumePayload,
  ParseResumeResult,
  ApplyResumePayload,
  ApplyResumeResult,
  ParsedResume,
  ParsedWorkExperience,
  ParsedEducation,
} from '../lib/resume.ts';

type ReviewSkill = {
  skill_name: string;
  normalized_skill: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  frequency: number;
  include: boolean;
};

type ReviewWork = ParsedWorkExperience & { include: boolean };
type ReviewEducation = ParsedEducation & { include: boolean };

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
  onParseResume: (payload: ParseResumePayload) => Promise<ParseResumeResult>;
  onApplyResume: (payload: ApplyResumePayload) => Promise<ApplyResumeResult>;
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
  onParseResume,
  onApplyResume,
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

  // Re-sync form fields whenever the profile version changes (e.g. after a
  // resume import or an external update) so the form never shows stale data.
  const profileVersion = profile?.profile_version ?? 1;
  useEffect(() => {
    setFullName(profile?.full_name || 'Paras Manikhunte');
    setHeadline(profile?.headline || '');
    setExpYears(String(profile?.experience_years ?? 1.5));
    setResumeText(profile?.resume_text || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileVersion]);

  // New skill input
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillProf, setNewSkillProf] = useState('ADVANCED');
  const [newSkillYears, setNewSkillYears] = useState('1.5');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resume import state
  const [dragActive, setDragActive] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [importFilename, setImportFilename] = useState<string | null>(null);
  const [rawResumeText, setRawResumeText] = useState('');
  const [rName, setRName] = useState('');
  const [rHeadline, setRHeadline] = useState('');
  const [rYears, setRYears] = useState('0');
  const [rSummary, setRSummary] = useState('');
  const [reviewSkills, setReviewSkills] = useState<ReviewSkill[]>([]);
  const [reviewWork, setReviewWork] = useState<ReviewWork[]>([]);
  const [reviewEdu, setReviewEdu] = useState<ReviewEducation[]>([]);

  const startReview = (result: ParseResumeResult, filename: string | null) => {
    setParsed(result.parsed);
    setImportFilename(filename);
    setRawResumeText(result.resume_text);
    setRName(result.parsed.full_name || profile?.full_name || '');
    setRHeadline(result.parsed.headline || profile?.headline || '');
    setRYears(String(result.parsed.experience_years ?? profile?.experience_years ?? 0));
    setRSummary(result.parsed.summary || '');
    setReviewSkills(
      result.parsed.skills.map((s) => ({
        skill_name: s.skill_name,
        normalized_skill: s.normalized_skill,
        proficiency: s.proficiency,
        frequency: s.frequency,
        include: true,
      }))
    );
    setReviewWork(result.parsed.work_experience.map((w) => ({ ...w, include: true })));
    setReviewEdu(result.parsed.education.map((e) => ({ ...e, include: true })));
  };

  const resetImport = () => {
    setParsed(null);
    setImportFilename(null);
    setRawResumeText('');
    setRName('');
    setRHeadline('');
    setRYears('0');
    setRSummary('');
    setReviewSkills([]);
    setReviewWork([]);
    setReviewEdu([]);
    setPasteText('');
    setShowPaste(false);
  };

  const handleParseFile = async (file: File) => {
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const payload = await fileToParsePayload(file);
      const result = await onParseResume(payload);
      startReview(result, file.name);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not parse the resume file.');
    } finally {
      setBusy(false);
    }
  };

  const handleParseText = async () => {
    if (!pasteText.trim()) {
      setErrorMsg('Paste your resume text first.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const result = await onParseResume({ text: pasteText });
      startReview(result, null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Resume parsing failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyImport = async () => {
    const includedSkills = reviewSkills.filter((s) => s.include);
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const payload: ApplyResumePayload = {
        full_name: rName,
        headline: rHeadline,
        summary: rSummary,
        experience_years: Number(rYears) || 0,
        resume_text: rawResumeText,
        work_experience: reviewWork
          .filter((w) => w.include)
          .map(({ include: _include, ...w }) => w),
        education: reviewEdu
          .filter((e) => e.include)
          .map(({ include: _include, ...e }) => e),
        skills: includedSkills.map((s) => ({
          skill_name: s.skill_name,
          proficiency: s.proficiency,
          years_experience: 1,
        })),
      };
      const result = await onApplyResume(payload);
      const version = result.profile?.profile_version ?? 'new';
      setFeedback(
        `Resume imported — ${result.skills_added} skill(s) added${
          result.skills_skipped > 0 ? `, ${result.skills_skipped} duplicate(s) skipped` : ''
        }. Profile is now v${version} and all active jobs were re-scored.`
      );
      resetImport();
    } catch (err: any) {
      setErrorMsg(err.message || 'Resume import failed.');
    } finally {
      setBusy(false);
    }
  };

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

  const handleDeleteSkill = async (skillId: string, skillName: string) => {
    if (!window.confirm(`Remove skill "${skillName}" from your profile? Active jobs will be re-scored.`))
      return;
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onDeleteSkill(skillId);
      setFeedback(`Removed skill '${skillName}' and re-scored active jobs.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not remove skill.');
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerAgentSafe = async (agentName: string, agentLabel: string) => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onTriggerAgent(agentName);
      setFeedback(`Executed ${agentLabel} worker and persisted run log.`);
    } catch (err: any) {
      setErrorMsg(err.message || `${agentLabel} run failed.`);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckSourceSafe = async (sourceId: string, companyName: string, provider: string) => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onCheckSource(sourceId);
      setFeedback(`Polled live ${companyName} (${provider}) endpoint over HTTP.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Source poll failed.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'profile') {
    // Profile completeness hints (easier onboarding)
    const hints: string[] = [];
    if (!profile?.headline) hints.push('Add a headline');
    if (!profile?.resume_text?.trim())
      hints.push('Import or paste resume text — outreach drafts use it as verified facts');
    if ((profile?.skills?.length ?? 0) < 3) hints.push('Add at least 3 skills');
    if (!profile?.preferences?.minimum_salary) hints.push('Set a minimum target salary');
    const hasHistory = (profile?.work_experience?.length ?? 0) > 0 || (profile?.education?.length ?? 0) > 0;

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

        {/* ============================================================
            Resume Import: dropzone / paste → parse → review → apply
            ============================================================ */}
        <div className="bg-slate-900/60 border border-indigo-500/25 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Import from Resume</h2>
                <p className="text-xs text-slate-400">
                  Drop your resume and review what gets filled in — nothing is saved until you
                  confirm.
                </p>
              </div>
            </div>
            {!parsed && (
              <button
                type="button"
                onClick={() => setShowPaste((v) => !v)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium whitespace-nowrap shrink-0"
              >
                {showPaste ? 'Hide paste box' : 'Or paste text instead'}
              </button>
            )}
          </div>

          {!parsed ? (
            <div className="space-y-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleParseFile(file);
                }}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-indigo-400 bg-indigo-500/10'
                    : 'border-slate-700 bg-slate-950/40 hover:border-indigo-500/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleParseFile(file);
                    e.target.value = '';
                  }}
                />
                {busy ? (
                  <div className="flex flex-col items-center gap-2 text-slate-300">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                    <span className="text-xs">Parsing resume…</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-indigo-400" />
                    <p className="text-xs text-slate-200 mt-2 font-medium">
                      Drag &amp; drop your resume here, or click to browse
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      PDF, TXT or MD · max 7MB · parsed deterministically, no AI guessing
                    </p>
                  </>
                )}
              </div>

              {showPaste && (
                <div className="space-y-2">
                  <textarea
                    rows={5}
                    placeholder="Paste your full resume text here…"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 leading-relaxed"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParseText}
                      disabled={busy}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
                    >
                      Parse Pasted Text
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ---------------- Review & Confirm Sheet ---------------- */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    Review extracted data{importFilename ? ` from ${importFilename}` : ''} — edit
                    anything before importing
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetImport}
                  aria-label="Cancel resume import"
                  className="text-slate-500 hover:text-slate-300 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(parsed.email || parsed.phone) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className="text-slate-500">Detected contact:</span>
                  {parsed.email && (
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono">
                      {parsed.email}
                    </span>
                  )}
                  {parsed.phone && (
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono">
                      {parsed.phone}
                    </span>
                  )}
                  <span className="text-slate-600">(for reference — edit in the form below)</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    value={rName}
                    onChange={(e) => setRName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Headline</label>
                  <input
                    type="text"
                    value={rHeadline}
                    onChange={(e) => setRHeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Experience (Years)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={rYears}
                    onChange={(e) => setRYears(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="text-xs">
                <label className="block text-slate-300 font-medium mb-1">Summary</label>
                <textarea
                  rows={2}
                  value={rSummary}
                  onChange={(e) => setRSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 leading-relaxed"
                />
              </div>

              {/* Skills review chips */}
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-medium">
                    Skills detected ({reviewSkills.length})
                  </label>
                  {reviewSkills.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setReviewSkills((prev) => prev.map((s) => ({ ...s, include: true })))
                        }
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Select all
                      </button>
                      <span className="text-slate-700">·</span>
                      <button
                        type="button"
                        onClick={() =>
                          setReviewSkills((prev) => prev.map((s) => ({ ...s, include: false })))
                        }
                        className="text-slate-500 hover:text-slate-400"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                {reviewSkills.length === 0 ? (
                  <p className="py-2 text-slate-500">
                    No known skills detected — you can add them manually in the Skill Matrix below.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {reviewSkills.map((sk, idx) => (
                      <div
                        key={sk.normalized_skill}
                        className={`flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg border text-[11px] transition-colors ${
                          sk.include
                            ? 'border-indigo-500/40 bg-indigo-500/10'
                            : 'border-slate-800 bg-slate-950 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={sk.include}
                          aria-label={`Include skill ${sk.skill_name}`}
                          onChange={(e) =>
                            setReviewSkills((prev) =>
                              prev.map((s, i) =>
                                i === idx ? { ...s, include: e.target.checked } : s
                              )
                            )
                          }
                          className="rounded border-slate-700"
                        />
                        <span className="font-medium text-slate-100">{sk.skill_name}</span>
                        <select
                          value={sk.proficiency}
                          aria-label={`Proficiency for ${sk.skill_name}`}
                          onChange={(e) =>
                            setReviewSkills((prev) =>
                              prev.map((s, i) =>
                                i === idx
                                  ? {
                                      ...s,
                                      proficiency: e.target
                                        .value as ReviewSkill['proficiency'],
                                    }
                                  : s
                            )
                          )
                          }
                          className="bg-slate-950 border border-slate-800 rounded px-1 py-0.5 text-slate-300"
                        >
                          <option value="BEGINNER">BEGINNER</option>
                          <option value="INTERMEDIATE">INTERMEDIATE</option>
                          <option value="ADVANCED">ADVANCED</option>
                          <option value="EXPERT">EXPERT</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Work experience review */}
              {reviewWork.length > 0 && (
                <div className="text-xs">
                  <label className="block text-slate-300 font-medium mb-1.5">
                    Work experience detected ({reviewWork.length})
                  </label>
                  <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950/50">
                    {reviewWork.map((w, idx) => (
                      <div key={idx} className="px-3 py-2 flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={w.include}
                          aria-label={`Include ${w.title || w.company}`}
                          onChange={(e) =>
                            setReviewWork((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, include: e.target.checked } : x
                              )
                            )
                          }
                          className="rounded border-slate-700"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-100">
                            {w.title || 'Unknown title'}
                          </span>
                          {w.company && <span className="text-slate-400"> @ {w.company}</span>}
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                          {w.start} – {w.end} · {w.duration_years}y
                          {w.current ? ' · current' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Education review */}
              {reviewEdu.length > 0 && (
                <div className="text-xs">
                  <label className="block text-slate-300 font-medium mb-1.5">
                    Education detected ({reviewEdu.length})
                  </label>
                  <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-slate-950/50">
                    {reviewEdu.map((ed, idx) => (
                      <div key={idx} className="px-3 py-2 flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={ed.include}
                          aria-label={`Include education ${ed.degree}`}
                          onChange={(e) =>
                            setReviewEdu((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, include: e.target.checked } : x
                              )
                            )
                          }
                          className="rounded border-slate-700"
                        />
                        <span className="font-medium text-slate-100">{ed.degree}</span>
                        <span className="text-slate-400 truncate">
                          {ed.institution || ''}
                          {ed.year ? ` · ${ed.year}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={resetImport}
                  className="text-xs text-slate-400 hover:text-slate-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={busy}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-2"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Import {reviewSkills.filter((s) => s.include).length} skill(s) &amp; profile
                      details
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Candidate Profile & Hard-Filter Preferences */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Candidate Profile &amp; Hard-Filter Rules
                </h2>
                <p className="text-xs text-slate-400">
                  Updates automatically increment profile_version and trigger job re-evaluation
                </p>
              </div>
              <span className="text-xs font-mono text-indigo-400">
                Version v{profileVersion}
              </span>
            </div>

            {hints.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500">Completeness:</span>
                {hints.map((hint) => (
                  <span
                    key={hint}
                    className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
                  >
                    {hint}
                  </span>
                ))}
              </div>
            )}

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
                Verified Resume Facts (Used by Evaluator &amp; Outreach Assistant)
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
                Save Profile &amp; Re-Evaluate Jobs
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
              {(profile?.skills || []).length === 0 ? (
                <p className="py-6 text-center text-slate-500 leading-relaxed">
                  No skills added yet. Import your resume above or add your core stack here — the
                  evaluator scores job descriptions against these normalized skills.
                </p>
              ) : (
                (profile?.skills || []).map((sk: any) => (
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
                      disabled={busy}
                      onClick={() => handleDeleteSkill(sk.id, sk.skill_name)}
                      className="text-slate-500 hover:text-rose-400 p-1 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Work History & Education (populated by resume import) */}
        {hasHistory && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {(profile?.work_experience?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-indigo-400" />
                    Work History ({profile.work_experience.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">from resume import</span>
                </div>
                <div className="divide-y divide-slate-800/80 text-xs">
                  {profile.work_experience.map((w: any, idx: number) => (
                    <div key={idx} className="px-5 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-100">
                          {w.title || 'Unknown title'}
                          {w.company ? <span className="text-slate-400"> @ {w.company}</span> : null}
                          {w.current && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300">
                              CURRENT
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap tabular-nums">
                        {w.start} – {w.end} · {w.duration_years}y
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(profile?.education?.length ?? 0) > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-indigo-400" />
                    Education ({profile.education.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">from resume import</span>
                </div>
                <div className="divide-y divide-slate-800/80 text-xs">
                  {profile.education.map((ed: any, idx: number) => (
                    <div key={idx} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-100">{ed.degree}</span>
                        {ed.institution ? (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {ed.institution}
                          </div>
                        ) : null}
                      </div>
                      {ed.year && (
                        <span className="text-[11px] text-slate-500 font-mono">{ed.year}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
      {errorMsg && (
        <div className="px-4 py-2.5 rounded-lg bg-rose-950/30 border border-rose-800 text-xs text-rose-300 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-200">
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
                  onClick={() => handleTriggerAgentSafe(ag.name, ag.label)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
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
              Authorized ATS Sources &amp; Health ({sources.length})
            </h3>
            <span className="text-xs text-slate-400">Transient error != closed</span>
          </div>
          <div className="divide-y divide-slate-800/80 text-xs">
            {sources.length === 0 ? (
              <p className="p-6 text-center text-slate-500 leading-relaxed">
                No ATS sources registered yet. Add companies in Companies &amp; Funding and run
                Investigate — each verified company registers an authorized ATS endpoint here.
              </p>
            ) : (
              sources.map((src) => (
              <div key={src.id} className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="font-semibold text-white">
                    {src.company_name} · <span className="font-mono">{src.ats_provider}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    {src.company_career_page && (
                      <a
                        href={src.company_career_page}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <span>Careers Page</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    <a
                      href={src.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      <span>Live ATS Endpoint</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    Status: <span className="text-emerald-400">{src.status}</span> · Active roles:{' '}
                    {src.active_jobs_count} · Failures: {src.failure_count}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleCheckSourceSafe(src.id, src.company_name, src.ats_provider)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Poll Live</span>
                </button>
              </div>
            ))
            )}
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
            {agentRuns.length === 0 ? (
              <p className="p-6 text-center text-slate-500 leading-relaxed">
                No agent runs yet. Every worker execution is recorded here with its idempotency key,
                task ID, and structured output.
              </p>
            ) : (
              agentRuns.map((run) => (
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
            ))
            )}
          </div>
        </div>
      </div>

      {/* All 10 Phases Verification Matrix */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">
          Engineering Roadmap &amp; Acceptance Gate Verification (Phases 0–10)
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
