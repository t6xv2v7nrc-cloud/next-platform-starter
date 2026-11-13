import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '../lib/data';
import { needsCv, STATUSES, type Application, type Risk, type Status } from '../lib/types';
import { toLocalInput } from '../lib/format';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Select<T extends string>({ id, value, onChange, options, empty, required }: {
  id?: string;
  value: T | '';
  onChange: (v: T | '') => void;
  options: readonly T[] | readonly { value: T; label: string }[];
  empty?: string;
  required?: boolean;
}) {
  return (
    <select id={id} className="input" value={value} required={required} onChange={(e) => onChange(e.target.value as T | '')}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return <option key={opt.value} value={opt.value}>{opt.label}</option>;
      })}
    </select>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-bad" role="alert">{children}</p> : null;
}

export function RiskBadge({ risk }: { risk: Risk | null }) {
  if (!risk) return null;
  const tone = risk === 'High' ? 'border-bad/50 text-bad' : risk === 'Medium' ? 'border-warn/50 text-warn' : '';
  return <span className={`chip ${tone}`} title="Conflict risk with running Keel">{risk} conflict</span>;
}

export function CvBadge({ id }: { id: string | null }) {
  const { cvName } = useData();
  return id ? <span className="chip">{cvName(id)}</span> : null;
}

export function StatusBadge({ status }: { status: Status }) {
  const tone =
    status === 'Offer' || status === 'Accepted' ? 'border-good/50 text-good'
    : status === 'Rejected' ? 'border-bad/50 text-bad'
    : status === 'Saved' || status === 'Withdrawn' || status === 'No response' ? ''
    : 'border-accent/50 text-accent-ink';
  return <span className={`chip ${tone}`}>{status}</span>;
}

/** Change status with an optional back-date, note and (when required) CV version. */
export function MoveDialog({ app, to: initialTo, onClose }: { app: Application; to?: Status; onClose: () => void }) {
  const { data, move, updateApplication } = useData();
  const [to, setTo] = useState<Status>(initialTo ?? app.status);
  const [when, setWhen] = useState(toLocalInput(new Date().toISOString()));
  const [note, setNote] = useState('');
  const [cv, setCv] = useState(app.cv_version_id ?? '');
  const [reason, setReason] = useState(app.rejection_reason ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cvs = data.cvs.filter((c) => c.active || c.id === app.cv_version_id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (to === app.status) return onClose();
    setBusy(true);
    setError('');
    try {
      await move(app, to, { changedAt: new Date(when).toISOString(), note: note.trim() || undefined, cvVersionId: cv || undefined });
      if (to === 'Rejected' && reason.trim() !== (app.rejection_reason ?? '')) await updateApplication(app.id, { rejection_reason: reason.trim() || null });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`Move ${app.company}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="New status">{(id) => <Select id={id} value={to} onChange={(v) => v && setTo(v)} options={STATUSES} />}</Field>
        {needsCv(to) && (
          <Field label="CV version sent" hint={cvs.length ? undefined : 'Add a CV version first, on the CVs screen.'}>
            {(id) => <Select id={id} value={cv} onChange={setCv} required empty="Choose a version" options={cvs.map((c) => ({ value: c.id, label: c.name }))} />}
          </Field>
        )}
        <Field label="When it happened" hint="Change this to back-date a late update.">
          {(id) => <input id={id} className="input" type="datetime-local" required value={when} max={toLocalInput(new Date(Date.now() + 86400000).toISOString())} onChange={(e) => setWhen(e.target.value)} />}
        </Field>
        {to === 'Rejected' && (
          <Field label="Rejection reason (optional)">{(id) => <input id={id} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        )}
        <Field label="Note (optional)">{(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save move'}</button>
      </form>
    </Modal>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
