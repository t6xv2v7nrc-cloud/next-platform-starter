import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Markdown from 'markdown-to-jsx';
import { useData } from '../lib/data';
import { store } from '../lib/store';
import {
  CONTRACT_TYPES, INTERVIEW_TYPES, needsCv, PAY_UNITS, RISKS, SECTORS, SOURCES, WORK_MODES,
  type Application, type Interview, type InterviewType, type PayUnit, type StatusEvent,
} from '../lib/types';
import { fmtDate, fmtDateTime, fmtMoney, fmtPay, toLocalInput } from '../lib/format';
import { CvBadge, ErrorText, Field, Modal, MoveDialog, RiskBadge, Select, StatusBadge } from '../components/ui';

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
const txt = (s: string) => s.trim() || null;

export default function ApplicationDetail() {
  const { id } = useParams();
  const { rows, data, deleteApplication } = useData();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [event, setEvent] = useState<StatusEvent | null>(null);
  const [interview, setInterview] = useState<Interview | 'new' | null>(null);
  const [error, setError] = useState('');

  const row = rows.find((r) => r.app.id === id);
  if (!row) return <p className="text-sm text-muted">Application not found. <Link className="link" to="/applications">Back to the table</Link></p>;
  const a = row.app;
  const cv = data.cvs.find((c) => c.id === a.cv_version_id);
  const interviews = data.interviews.filter((i) => i.application_id === a.id);

  async function openCv() {
    try {
      const url = cv && (await store.cvUrl(cv));
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const fact = (label: string, value: ReactNode) =>
    value ? <div><dt className="text-xs text-muted">{label}</dt><dd className="text-sm break-words">{value}</dd></div> : null;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/applications" className="text-sm text-muted hover:underline">← Applications</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold break-words">{a.company}</h1>
          <p className="text-sm text-muted">{a.role_title}</p>
          <div className="mt-2 flex flex-wrap gap-1"><StatusBadge status={a.status} /><CvBadge id={a.cv_version_id} /><RiskBadge risk={a.conflict_risk} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setMoving(true)}>Move</button>
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <section className="card p-4">
            {a.job_url
              ? <a className="link text-sm break-all" href={a.job_url} target="_blank" rel="noopener noreferrer">Open the job advert</a>
              : <p className="text-sm text-muted">No job link yet. Find it on Indeed and add it with Edit.</p>}
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fact('Sector', a.sector)}{fact('Source', a.source)}{fact('Location', a.location)}{fact('Work mode', a.work_mode)}{fact('Contract', a.contract_type)}
              {fact('Pay', fmtPay(a))}{a.pay_unit && a.pay_unit !== 'year' && row.payAnnual != null && fact('Annualised', fmtMoney(row.payAnnual))}
              {fact('Found', fmtDate(a.date_found))}{fact('Applied', fmtDate(row.appliedOn))}{fact('Closes', fmtDate(a.closing_date))}
              {fact('Cover letter', a.cover_letter ? 'Yes' : 'No')}{fact('Fit score', a.fit_score ? `${a.fit_score} of 5` : null)}
              {fact('Next action', a.next_action && `${a.next_action}${a.next_action_date ? `, ${fmtDate(a.next_action_date)}` : ''}`)}
              {fact('Contact', [a.contact_name, a.contact_email].filter(Boolean).join(', '))}
              {fact('Rejection reason', a.rejection_reason)}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Notes</h2>
            {a.notes ? <div className="prose-notes text-sm break-words"><Markdown options={{ disableParsingRawHTML: true }}>{a.notes}</Markdown></div> : <p className="text-sm text-muted">No notes yet.</p>}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Interviews</h2>
              <button className="btn btn-sm" onClick={() => setInterview('new')}>Add interview</button>
            </div>
            {interviews.length === 0 ? <p className="text-sm text-muted">None logged.</p> : (
              <ul className="divide-y divide-line">
                {interviews.map((i) => (
                  <li key={i.id} className="py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span><strong>{i.type}</strong>, {fmtDateTime(i.date_time)}{i.interviewer ? `, with ${i.interviewer}` : ''}{i.how_it_went ? `. Went ${i.how_it_went} of 5` : ''}</span>
                      <button className="btn btn-sm shrink-0" onClick={() => setInterview(i)}>Edit</button>
                    </div>
                    {i.questions_asked && <p className="mt-1 text-xs whitespace-pre-wrap text-muted"><span className="font-medium">Questions asked:</span> {i.questions_asked}</p>}
                    {i.notes && <p className="mt-1 text-xs whitespace-pre-wrap text-muted">{i.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">CV sent</h2>
            {cv ? (
              <div className="text-sm">
                <p className="font-medium">{cv.name}</p>
                {cv.focus && <p className="text-xs text-muted">{cv.focus}</p>}
                {cv.file_path
                  ? <button className="link mt-2 text-sm" onClick={openCv}>Open the PDF</button>
                  : <p className="mt-2 text-xs text-muted">PDF not uploaded yet. <Link className="link" to="/cv">Upload it</Link></p>}
              </div>
            ) : <p className="text-sm text-muted">None yet. A version is required once this is Applied.</p>}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Timeline</h2>
            <ol className="space-y-3 border-l border-line pl-4">
              {row.events.slice().reverse().map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-accent" />
                  <div className="flex items-start justify-between gap-2">
                    <span>{e.from_status ? `${e.from_status} to ${e.to_status}` : `Logged as ${e.to_status}`}</span>
                    <button className="link shrink-0 text-xs" onClick={() => setEvent(e)}>Edit</button>
                  </div>
                  <div className="text-xs text-muted">{fmtDateTime(e.changed_at)}</div>
                  {e.note && <div className="text-xs">{e.note}</div>}
                </li>
              ))}
            </ol>
          </section>

          <button className="btn btn-danger w-full" onClick={async () => {
            if (!confirm(`Delete ${a.company}, ${a.role_title}? This removes its timeline and interviews too.`)) return;
            await deleteApplication(a.id);
            navigate('/applications');
          }}>Delete application</button>
        </div>
      </div>

      {moving && <MoveDialog app={a} onClose={() => setMoving(false)} />}
      {editing && <EditDialog app={a} onClose={() => setEditing(false)} />}
      {event && <EventDialog event={event} onClose={() => setEvent(null)} />}
      {interview && <InterviewDialog appId={a.id} interview={interview === 'new' ? null : interview} onClose={() => setInterview(null)} />}
    </div>
  );
}

function EditDialog({ app, onClose }: { app: Application; onClose: () => void }) {
  const { data, updateApplication } = useData();
  const [f, setF] = useState({
    ...app,
    pay_min: app.pay_min?.toString() ?? '', pay_max: app.pay_max?.toString() ?? '', fit_score: app.fit_score?.toString() ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (label: string, k: 'company' | 'role_title' | 'job_url' | 'location' | 'next_action' | 'contact_name' | 'contact_email' | 'rejection_reason', props: { required?: boolean; type?: string; className?: string } = {}) => (
    <Field label={label} className={props.className}>{(id) => <input id={id} className="input" type={props.type ?? 'text'} required={props.required} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} />}</Field>
  );
  const date = (label: string, k: 'date_found' | 'date_applied' | 'closing_date' | 'next_action_date') => (
    <Field label={label}>{(id) => <input id={id} className="input" type="date" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value || null)} />}</Field>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const lo = num(f.pay_min), hi = num(f.pay_max);
    if (lo != null && hi != null && lo > hi) return setError('Pay from is higher than pay to.');
    if (/linkedin\./i.test(f.job_url ?? '')) return setError('LinkedIn links are not used in this tracker. Use the Indeed or company link.');
    setBusy(true);
    try {
      const { id: _id, created_at: _c, updated_at: _u, status: _s, ...rest } = f;
      await updateApplication(app.id, {
        ...rest,
        company: f.company.trim(), role_title: f.role_title.trim(),
        job_url: txt(f.job_url ?? ''), location: txt(f.location ?? ''), next_action: txt(f.next_action ?? ''), contact_name: txt(f.contact_name ?? ''),
        contact_email: txt(f.contact_email ?? ''), rejection_reason: txt(f.rejection_reason ?? ''), notes: txt(f.notes ?? ''),
        pay_min: lo, pay_max: hi, pay_unit: lo == null && hi == null ? null : f.pay_unit ?? 'year', fit_score: num(f.fit_score),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit application" onClose={onClose}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        {text('Company', 'company', { required: true, className: 'col-span-2' })}
        {text('Role', 'role_title', { required: true, className: 'col-span-2' })}
        {text('Job link', 'job_url', { type: 'url', className: 'col-span-2' })}
        <Field label="Sector">{(id) => <Select id={id} value={f.sector} onChange={(v) => v && set('sector', v)} options={SECTORS} />}</Field>
        <Field label="Source">{(id) => <Select id={id} value={f.source} onChange={(v) => v && set('source', v)} options={SOURCES} />}</Field>
        {text('Location', 'location')}
        <Field label="Work mode">{(id) => <Select id={id} value={f.work_mode ?? ''} onChange={(v) => set('work_mode', v || null)} options={WORK_MODES} empty="Not set" />}</Field>
        <Field label="Contract type">{(id) => <Select id={id} value={f.contract_type ?? ''} onChange={(v) => set('contract_type', v || null)} options={CONTRACT_TYPES} empty="Not set" />}</Field>
        <Field label="Pay unit">{(id) => <Select<PayUnit> id={id} value={f.pay_unit ?? ''} onChange={(v) => set('pay_unit', v || null)} options={PAY_UNITS.map((u) => ({ value: u, label: `Per ${u}` }))} empty="Not stated" />}</Field>
        <Field label="Pay from (£)">{(id) => <input id={id} className="input" inputMode="decimal" value={f.pay_min} onChange={(e) => set('pay_min', e.target.value)} />}</Field>
        <Field label="Pay to (£)">{(id) => <input id={id} className="input" inputMode="decimal" value={f.pay_max} onChange={(e) => set('pay_max', e.target.value)} />}</Field>
        {date('Date found', 'date_found')}{date('Date applied', 'date_applied')}{date('Closing date', 'closing_date')}
        <Field label="CV version">
          {(id) => <Select id={id} value={f.cv_version_id ?? ''} onChange={(v) => set('cv_version_id', v || null)} required={needsCv(app.status)} empty="None"
            options={data.cvs.filter((c) => c.active || c.id === app.cv_version_id).map((c) => ({ value: c.id, label: c.name }))} />}
        </Field>
        <Field label="Fit score">{(id) => <Select id={id} value={f.fit_score} onChange={(v) => set('fit_score', v)} options={['1', '2', '3', '4', '5']} empty="Not set" />}</Field>
        <Field label="Conflict risk">{(id) => <Select id={id} value={f.conflict_risk ?? ''} onChange={(v) => set('conflict_risk', v || null)} options={RISKS} empty="Not set" />}</Field>
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={f.cover_letter} onChange={(e) => set('cover_letter', e.target.checked)} />Cover letter sent</label>
        {text('Next action', 'next_action')}{date('Next action date', 'next_action_date')}
        {text('Contact name', 'contact_name')}{text('Contact email', 'contact_email', { type: 'email' })}
        {text('Rejection reason', 'rejection_reason', { className: 'col-span-2' })}
        <Field label="Notes (Markdown)" className="col-span-2">{(id) => <textarea id={id} className="input h-32" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />}</Field>
        <div className="col-span-2"><ErrorText>{error}</ErrorText></div>
        <button className="btn btn-primary col-span-2" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

function EventDialog({ event, onClose }: { event: StatusEvent; onClose: () => void }) {
  const { updateEvent } = useData();
  const [when, setWhen] = useState(toLocalInput(event.changed_at));
  const [note, setNote] = useState(event.note ?? '');
  const [error, setError] = useState('');
  return (
    <Modal title="Edit status event" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        try { await updateEvent(event.id, { changed_at: new Date(when).toISOString(), note: txt(note) }); onClose(); } catch (err) { setError((err as Error).message); }
      }}>
        <p className="text-sm text-muted">{event.from_status ? `${event.from_status} to ${event.to_status}` : `Logged as ${event.to_status}`}</p>
        <Field label="When it happened">{(id) => <input id={id} className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
        <Field label="Note">{(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary w-full">Save</button>
      </form>
    </Modal>
  );
}

function InterviewDialog({ appId, interview, onClose }: { appId: string; interview: Interview | null; onClose: () => void }) {
  const { saveInterview, deleteInterview } = useData();
  const [when, setWhen] = useState(toLocalInput(interview?.date_time ?? new Date().toISOString()));
  const [type, setType] = useState<InterviewType>(interview?.type ?? 'Video');
  const [interviewer, setInterviewer] = useState(interview?.interviewer ?? '');
  const [questions, setQuestions] = useState(interview?.questions_asked ?? '');
  const [went, setWent] = useState(interview?.how_it_went?.toString() ?? '');
  const [notes, setNotes] = useState(interview?.notes ?? '');
  const [error, setError] = useState('');
  return (
    <Modal title={interview ? 'Edit interview' : 'Add interview'} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await saveInterview(interview?.id ?? null, { application_id: appId, date_time: new Date(when).toISOString(), type, interviewer: txt(interviewer), questions_asked: txt(questions), how_it_went: num(went), notes: txt(notes) });
          onClose();
        } catch (err) { setError((err as Error).message); }
      }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date and time">{(id) => <input id={id} className="input" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
          <Field label="Type">{(id) => <Select id={id} value={type} onChange={(v) => v && setType(v)} options={INTERVIEW_TYPES} />}</Field>
          <Field label="Interviewer">{(id) => <input id={id} className="input" value={interviewer} onChange={(e) => setInterviewer(e.target.value)} />}</Field>
          <Field label="How it went">{(id) => <Select id={id} value={went} onChange={setWent} options={['1', '2', '3', '4', '5']} empty="Not rated" />}</Field>
        </div>
        <Field label="Questions asked" hint="Included in the Export for Claude.">{(id) => <textarea id={id} className="input h-24" value={questions} onChange={(e) => setQuestions(e.target.value)} />}</Field>
        <Field label="Notes">{(id) => <textarea id={id} className="input h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1">Save</button>
          {interview && <button type="button" className="btn btn-danger" onClick={async () => { if (confirm('Delete this interview?')) { await deleteInterview(interview.id); onClose(); } }}>Delete</button>}
        </div>
      </form>
    </Modal>
  );
}
