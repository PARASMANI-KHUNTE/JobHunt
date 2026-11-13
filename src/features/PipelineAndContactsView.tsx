import React, { useState } from 'react';
import {
  Check,
  Send,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Plus,
  Mail,
  Kanban,
  Ban,
  Loader2,
} from 'lucide-react';
import { statusTone } from '../lib/ui.ts';

interface PipelineAndContactsProps {
  subView: 'pipeline' | 'outreach';
  onSubViewChange: (view: 'pipeline' | 'outreach') => void;
  applications: any[];
  contacts: any[];
  drafts: any[];
  jobs: any[];
  onUpdateApplicationStatus: (appId: string, newStatus: string, notes: string) => Promise<void>;
  onAddApplicationNote: (appId: string, notes: string) => Promise<void>;
  onResearchContacts: () => Promise<void>;
  onCreateDraft: (contactId: string, jobId: string) => Promise<void>;
  onUpdateDraft: (draftId: string, subject: string, body: string) => Promise<void>;
  onDiscardDraft: (draftId: string) => Promise<void>;
  onApproveDraft: (draftId: string) => Promise<void>;
  onSendDraft: (draftId: string, forceUnverified?: boolean) => Promise<any>;
}

const APPLICATION_STATUSES = [
  'SAVED',
  'READY_TO_APPLY',
  'APPLIED',
  'SHORTLISTED',
  'INTERVIEWING',
  'OFFER',
  'REJECTED',
  'GHOSTED',
  'WITHDRAWN',
  'CLOSED',
];

export const PipelineAndContactsView: React.FC<PipelineAndContactsProps> = ({
  subView,
  onSubViewChange,
  applications,
  contacts,
  drafts,
  jobs,
  onUpdateApplicationStatus,
  onAddApplicationNote,
  onResearchContacts,
  onCreateDraft,
  onUpdateDraft,
  onDiscardDraft,
  onApproveDraft,
  onSendDraft,
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(applications[0]?.id || null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(drafts[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [statusNote, setStatusNote] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingDraftFor, setCreatingDraftFor] = useState<string | null>(null);

  // Draft editing local state
  const selectedDraft =
    drafts.find((d) => d.id === selectedDraftId) || drafts[0] || null;
  const [editSubject, setEditSubject] = useState<string>(selectedDraft?.subject || '');
  const [editBody, setEditBody] = useState<string>(selectedDraft?.body || '');

  const handleSelectDraft = (d: any) => {
    setSelectedDraftId(d.id);
    setEditSubject(d.subject);
    setEditBody(d.body);
    setFeedback(null);
    setErrorMsg(null);
  };

  const selectedApp =
    applications.find((a) => a.id === selectedAppId) || applications[0] || null;

  const handleTransition = async (appId: string, nextStatus: string) => {
    const terminalStatuses = ['REJECTED', 'WITHDRAWN', 'GHOSTED', 'CLOSED'];
    if (terminalStatuses.includes(nextStatus)) {
      const confirmed = window.confirm(
        `Are you sure you want to transition this application to "${nextStatus}"?`
      );
      if (!confirmed) return;
    }
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onUpdateApplicationStatus(appId, nextStatus, statusNote);
      setStatusNote('');
      setFeedback(`Application status updated to ${nextStatus} and logged in audit history.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Status transition failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !statusNote.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await onAddApplicationNote(selectedApp.id, statusNote.trim());
      setStatusNote('');
      setFeedback('Activity note appended to application timeline.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (draftId: string) => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onApproveDraft(draftId);
      setFeedback(
        'Draft explicitly approved by user. You can now click "Step 2: Explicit Send", "Open in Gmail", or "Open Mail App".'
      );
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async (draftId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to discard this outreach draft? It will be removed from the active approval queue.'
    );
    if (!confirmed) return;
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onDiscardDraft(draftId);
      setFeedback('Draft discarded and removed from the active approval queue.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDraftForContact = async (contactId: string, jobId: string) => {
    setCreatingDraftFor(contactId);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await onCreateDraft(contactId, jobId);
      setFeedback('Generated personalized draft for contact (PENDING_APPROVAL).');
    } catch (err: any) {
      setErrorMsg(err.message || 'Draft generation failed.');
    } finally {
      setCreatingDraftFor(null);
    }
  };

  const handleSend = async (draftId: string, forceUnverified = false) => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const resData = await onSendDraft(draftId, forceUnverified);
      setFeedback(
        resData?.delivery_note ||
          'Outreach email dispatched with idempotency key and provider message ID.'
      );
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Compute live mailto & Gmail compose URLs from current edited subject/body
  const currentRecipientEmail = selectedDraft?.contact_email || '';
  const liveMailtoUrl = currentRecipientEmail
    ? `mailto:${encodeURIComponent(currentRecipientEmail)}?subject=${encodeURIComponent(
        editSubject || selectedDraft?.subject || ''
      )}&body=${encodeURIComponent(editBody || selectedDraft?.body || '')}`
    : null;
  const liveGmailUrl = currentRecipientEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        currentRecipientEmail
      )}&su=${encodeURIComponent(editSubject || selectedDraft?.subject || '')}&body=${encodeURIComponent(
        editBody || selectedDraft?.body || ''
      )}`
    : null;

  return (
    <div className="space-y-6">
      {/* Sub-navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => onSubViewChange('pipeline')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'pipeline'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Application Pipeline ({applications.length})
          </button>
          <button
            type="button"
            onClick={() => onSubViewChange('outreach')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subView === 'outreach'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Contacts & Outreach Approval ({drafts.length})
          </button>
        </div>

        {subView === 'outreach' && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setFeedback(null);
              setErrorMsg(null);
              try {
                await onResearchContacts();
                setFeedback(
                  'Contact Finder scanned public company directories for recruiter contacts.'
                );
              } catch (err: any) {
                setErrorMsg(err.message || 'Contact Finder run failed.');
              } finally {
                setBusy(false);
              }
            }}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>Run Contact Finder</span>
          </button>
        )}
      </div>

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

      {/* Subview 1: Application Lifecycle CRM & Audit History */}
      {subView === 'pipeline' && (
        <div className="space-y-4">
          {/* Lifecycle Status Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              ALL ({applications.length})
            </button>
            {APPLICATION_STATUSES.filter(
              (st) => applications.filter((a) => a.status === st).length > 0
            ).map((st) => {
              const count = applications.filter((a) => a.status === st).length;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                    statusFilter === st
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {st} ({count})
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Cols: Tracked Applications */}
            <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Tracked Opportunity Lifecycle ({applications.length})
                </h2>
                <span className="text-xs text-slate-400">Manual Application Control</span>
              </div>

              {applications.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <Kanban className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm text-slate-300">No applications tracked yet.</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Save qualified matches from the Jobs & Evaluator view to start tracking them
                    through your application lifecycle.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {applications
                    .filter((app) => statusFilter === 'ALL' || app.status === statusFilter)
                    .map((app) => {
                      const isSelected = selectedApp?.id === app.id;
                      return (
                        <div
                          key={app.id}
                          onClick={() => setSelectedAppId(app.id)}
                          className={`p-4 cursor-pointer transition-colors ${
                            isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-800/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <h3 className="text-sm font-semibold text-white">{app.job_title}</h3>
                              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-1.5">
                                <span className="text-slate-200 font-medium">{app.company_name}</span>
                                <span aria-hidden="true">·</span>
                                <span>{app.work_mode}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  Match Score: {app.score ?? '—'}/100
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                                {app.company_career_page && (
                                  <a
                                    href={app.company_career_page}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
                                  >
                                    <span>Careers Page</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                {app.job_apply_url && (
                                  <a
                                    href={app.job_apply_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>Application Portal</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                              {app.follow_up_at && (
                                <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                  Follow-up scheduled: {app.follow_up_at.slice(0, 10)}
                                </p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <span
                                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${statusTone(app.status)}`}
                              >
                                {app.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

          {/* Right 5 Cols: Status Transition & Immutable Event History */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
            {selectedApp ? (
              <>
                <div className="border-b border-slate-800 pb-4 space-y-2">
                  <span className="text-xs text-slate-400">{selectedApp.company_name}</span>
                  <h2 className="text-base font-bold text-white">{selectedApp.job_title}</h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Current Status: <strong className="text-indigo-400">{selectedApp.status}</strong>
                    {selectedApp.applied_at && ` · Applied: ${selectedApp.applied_at.slice(0, 10)}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                    {selectedApp.company_career_page && (
                      <a
                        href={selectedApp.company_career_page}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <span>Company Careers Page</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {selectedApp.job_apply_url && (
                      <a
                        href={selectedApp.job_apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <span>Direct Job Application</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Status Transition Control */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Transition Application Stage
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {APPLICATION_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={busy || selectedApp.status === st}
                        onClick={() => handleTransition(selectedApp.id, st)}
                        className={`px-2.5 py-1 rounded text-xs font-mono transition-colors whitespace-nowrap shrink-0 ${
                          selectedApp.status === st
                            ? 'bg-indigo-600 text-white font-semibold'
                            : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddNote} className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="block text-xs font-semibold text-slate-300">
                    Log Activity or Interview Note
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="e.g. Completed technical screen with engineering team..."
                      className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg whitespace-nowrap shrink-0"
                    >
                      Add Event
                    </button>
                  </div>
                </form>

                {/* Immutable Application Events History */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <h3 className="text-xs font-semibold text-slate-300">
                    Immutable Status & Activity History ({selectedApp.history?.length || 0})
                  </h3>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(selectedApp.history || []).map((ev: any) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                          <span>
                            {ev.old_status ? `${ev.old_status} → ${ev.new_status}` : ev.new_status}
                          </span>
                          <span className="tabular-nums">{ev.occurred_at.slice(0, 19).replace('T', ' ')}</span>
                        </div>
                        <p className="text-slate-300">{ev.notes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">No applications tracked yet.</p>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Subview 2: Public Contacts & Human-in-the-Loop Outreach Assistant */}
      {subView === 'outreach' && (
        <div className="space-y-6">
          {/* Public Contacts Table with Field-Level Provenance */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Public Company Contacts & Verification Provenance ({contacts.length})
              </h2>
              <span className="text-xs text-slate-400">
                Guessed emails are strictly prohibited from VERIFIED status
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">Contact & Role</th>
                    <th className="py-3 px-4">Company & Careers</th>
                    <th className="py-3 px-4">Business Email & Verification Status</th>
                    <th className="py-3 px-4">Provenance Source</th>
                    <th className="py-3 px-4 text-right">Outreach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {contacts.map((ct) => {
                    const companyJob =
                      jobs.find((j) => j.company_id === ct.company_id) || jobs[0];
                    return (
                      <tr key={ct.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{ct.name}</div>
                          <div className="text-slate-400">{ct.designation}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200 font-medium">{ct.company_name}</div>
                          {ct.company_career_page && (
                            <a
                              href={ct.company_career_page}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1"
                            >
                              <span>Careers Page</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className="text-slate-200">{ct.email || 'Not Published'}</span>
                          <span aria-hidden="true"> · </span>
                          <span
                            className={
                              ct.email_status === 'VERIFIED' || ct.email_status === 'PUBLICLY_LISTED'
                                ? 'text-emerald-400'
                                : 'text-amber-400'
                            }
                          >
                            {ct.email_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {ct.email_source_url ? (
                            <a
                              href={ct.email_source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                            >
                              <span>{ct.email_source_url}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-slate-500">N/A</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {companyJob && (
                            <button
                              type="button"
                              disabled={busy || creatingDraftFor === ct.id}
                              onClick={() => handleCreateDraftForContact(ct.id, companyJob.id)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                            >
                              {creatingDraftFor === ct.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              <span>Generate Draft</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Outreach Drafts & Mandatory 2-Step Approval + Explicit Send */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">
                  Outreach Draft Queue ({drafts.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-800/80">
                {drafts.map((dr) => {
                  const isSel = selectedDraft?.id === dr.id;
                  return (
                    <div
                      key={dr.id}
                      onClick={() => handleSelectDraft(dr)}
                      className={`p-4 cursor-pointer transition-colors ${
                        isSel ? 'bg-slate-800/70' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-white">{dr.contact_name}</div>
                          <div className="text-[11px] text-slate-400">
                            {dr.company_name} · {dr.job_title}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-mono font-semibold ${
                            dr.status === 'SENT'
                              ? 'text-emerald-400'
                              : dr.status === 'APPROVED'
                              ? 'text-cyan-400'
                              : dr.status === 'DISCARDED'
                              ? 'text-slate-600'
                              : 'text-amber-400'
                          }`}
                        >
                          {dr.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 truncate mt-1.5">{dr.subject}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 7 Cols: Draft Review, Evidence & Explicit Send Controls */}
            <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
              {selectedDraft ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white">
                        Recipient: {selectedDraft.contact_name} ({selectedDraft.contact_designation})
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        To: <span className="text-slate-200">{selectedDraft.contact_email || 'UNPUBLISHED'}</span> · Verification:{' '}
                        <span
                          className={
                            selectedDraft.contact_email_status === 'VERIFIED'
                              ? 'text-emerald-400'
                              : selectedDraft.contact_email_status === 'PUBLICLY_LISTED'
                              ? 'text-sky-400'
                              : 'text-amber-400'
                          }
                        >
                          {selectedDraft.contact_email_status}
                        </span>
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                        {selectedDraft.company_career_page && (
                          <a
                            href={selectedDraft.company_career_page}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                          >
                            <span>{selectedDraft.company_name} Careers</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {selectedDraft.job_apply_url && (
                          <a
                            href={selectedDraft.job_apply_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                          >
                            <span>Referenced Job Opening</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs">
                      <span className="text-slate-400">Draft State: </span>
                      <strong className="text-white">{selectedDraft.status}</strong>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Subject Line</label>
                      <input
                        type="text"
                        disabled={selectedDraft.status === 'SENT'}
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Personalized Email Body (Grounded on Verified Profile & Company Signals)
                      </label>
                      <textarea
                        rows={8}
                        disabled={selectedDraft.status === 'SENT'}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-sans leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* Fact-Verification Provenance */}
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="font-semibold text-slate-300">
                      Verified Personalization Evidence (Zero Fabricated Claims):
                    </div>
                    {(selectedDraft.personalization_evidence || []).map((ev: any, idx: number) => (
                      <div key={idx} className="text-slate-400 flex items-start gap-2">
                        <span className="font-mono text-[10px] text-indigo-400 shrink-0">
                          [{ev.fact_type}]
                        </span>
                        <span>
                          {ev.detail} ({ev.source})
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Two-Step Safety Action Bar + Real Mail Client & Gmail Actions */}
                  <div className="space-y-3 pt-2 border-t border-slate-800">
                    {/* Draft Lifecycle Stepper */}
                    <div className="flex items-center gap-2">
                      {(['PENDING_APPROVAL', 'APPROVED', 'SENT'] as const).map((stage, idx) => {
                        const stageIndex =
                          selectedDraft.status === 'PENDING_APPROVAL'
                            ? 0
                            : selectedDraft.status === 'APPROVED'
                            ? 1
                            : selectedDraft.status === 'SENT'
                            ? 2
                            : -1;
                        const done = stageIndex >= idx && stageIndex !== -1;
                        return (
                          <React.Fragment key={stage}>
                            {idx > 0 && (
                              <div
                                className={`h-px flex-1 min-w-3 ${done ? 'bg-slate-600' : 'bg-slate-800'}`}
                              />
                            )}
                            <span
                              className={`flex items-center gap-1 text-[11px] font-mono whitespace-nowrap ${
                                done ? 'text-slate-200' : 'text-slate-600'
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                  done ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-600'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              {stage.replace('_', ' ')}
                            </span>
                          </React.Fragment>
                        );
                      })}
                      {selectedDraft.status === 'DISCARDED' && (
                        <span className="ml-auto text-[11px] font-mono text-slate-600">
                          DISCARDED
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          Safety Policy: Approval and Sending are strictly separate actions.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {selectedDraft.status !== 'SENT' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await onUpdateDraft(selectedDraft.id, editSubject, editBody);
                                setFeedback('Saved edits to outreach draft.');
                              } catch (err: any) {
                                setErrorMsg(err.message || 'Draft save failed.');
                              } finally {
                                setBusy(false);
                              }
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg whitespace-nowrap shrink-0"
                          >
                            Save Edits
                          </button>
                        )}

                        {selectedDraft.status !== 'SENT' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDiscard(selectedDraft.id)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 border border-slate-800 text-slate-400 hover:text-rose-300 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Discard</span>
                          </button>
                        )}

                        {selectedDraft.status === 'PENDING_APPROVAL' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(selectedDraft.id)}
                            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>{busy ? 'Approving...' : 'Step 1: Approve Draft'}</span>
                          </button>
                        )}

                        {selectedDraft.status === 'APPROVED' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSend(selectedDraft.id)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            {busy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>{busy ? 'Sending...' : 'Step 2: Explicit Send Email'}</span>
                          </button>
                        )}

                        {selectedDraft.status === 'APPROVED' &&
                          (selectedDraft.contact_email_status === 'INFERRED' ||
                            selectedDraft.contact_email_status === 'NOT_FOUND') && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleSend(selectedDraft.id, true)}
                              title="Bypass the unverified-recipient safety gate and send anyway"
                              className="px-3.5 py-1.5 bg-slate-800 hover:bg-rose-900/60 border border-rose-800 text-rose-200 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Send anyway (unverified)</span>
                            </button>
                          )}

                        {selectedDraft.status === 'SENT' && (
                          <span className="text-xs font-mono text-emerald-400">
                            Sent ({selectedDraft.provider_message_id})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Direct Real Email Client Dispatch Bar (Gmail Web Compose & Mailto) */}
                    <div className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Real Email Delivery & Client Launch</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {selectedDraft.status === 'PENDING_APPROVAL'
                            ? 'Approve this draft in Step 1 to unlock direct Gmail & Mail App sending or server-side Resend/SendGrid dispatch.'
                            : 'Send via server API (RESEND_API_KEY / SENDGRID_API_KEY) or launch directly in your Gmail / Mail client:'}
                        </p>
                      </div>

                      {selectedDraft.status !== 'PENDING_APPROVAL' && currentRecipientEmail && (
                        <div className="flex items-center gap-2 shrink-0">
                          {liveGmailUrl && (
                            <a
                              href={liveGmailUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <span>Open in Gmail</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {liveMailtoUrl && (
                            <a
                              href={liveMailtoUrl}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Open Mail App</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400">Select a draft to review and approve.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

