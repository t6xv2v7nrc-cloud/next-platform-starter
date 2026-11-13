import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { store } from '../lib/store';
import { byCv, unfairPairs, type Rate } from '../lib/analytics';
import type { CvVersion } from '../lib/types';
import { fmtDate, pct, today } from '../lib/format';
import { ErrorText, Field, Modal, PageHeader } from '../components/ui';

export default function CvVersions() {
  const { data, rows, saveCv, deleteCv, setDrill } = useData();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<CvVersion | 'new' | null>(null);
  const [error, setError] = useState('');
  const stats = useMemo(() => byCv(rows, data.cvs), [rows, data.cvs]);
  const unfair = useMemo(() => unfairPairs(rows, data.cvs), [rows, data.cvs]);

  const rate = (r: Rate) => (r.n === 0 ? 'No data' : r.tooFew ? 'Too few to tell' : pct(r.num, r.n));
  const run = async (fn: () => Promise<unknown>) => {
    try { setError(''); await fn(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="CV versions">
        <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>New version</button>
      </PageHeader>
      <ErrorText>{error}</ErrorText>

      {unfair.map((u) => (
        <div key={u.a.id + u.b.id} className="mb-3 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-sm" role="note">
          <strong>Not a fair test yet.</strong> {u.a.name} has only been sent to {u.aSectors.join(', ')} roles and {u.b.name} only to {u.bSectors.join(', ')} roles.
          Any difference between them could be the sector, not the CV. Send both to the same sector to compare them.
        </div>
      ))}

      <ul className="space-y-3">
        {stats.map(({ cv, response, interview }) => (
          <li key={cv.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{cv.name} {!cv.active && <span className="chip align-middle">Retired</span>}</h2>
                <p className="text-xs text-muted">Created {fmtDate(cv.created_on)}{cv.focus ? `. Focus: ${cv.focus}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {cv.file_path && <button className="btn btn-sm" onClick={() => run(async () => { const u = await store.cvUrl(cv); if (u) window.open(u, '_blank', 'noopener'); })}>Open PDF</button>}
                <button className="btn btn-sm" onClick={() => setEditing(cv)}>Edit</button>
                <button className="btn btn-sm" onClick={() => run(() => saveCv(cv.id, { name: cv.name, active: !cv.active }))}>{cv.active ? 'Retire' : 'Make active'}</button>
              </div>
            </div>
            {cv.change_summary && <p className="mt-2 text-sm"><span className="text-muted">What changed:</span> {cv.change_summary}</p>}
            {!cv.file_path && <p className="mt-2 text-xs text-warn">PDF not uploaded yet{cv.file_name ? `: ${cv.file_name}` : ''}. Use Edit to upload it.</p>}
            <button type="button" disabled={response.n === 0} onClick={() => { setDrill({ label: `Sent with ${cv.name}`, ids: response.ids }); navigate('/applications'); }}
              className="mt-3 grid w-full cursor-pointer grid-cols-3 gap-2 rounded-lg bg-raised p-3 text-left disabled:cursor-default">
              <span><span className="block text-xs text-muted">Sent</span><span className="text-lg font-semibold">{response.n}</span></span>
              <span><span className="block text-xs text-muted">Response rate</span><span className={`font-semibold ${response.tooFew ? 'text-sm text-muted' : 'text-lg'}`}>{rate(response)}</span><span className="block text-xs text-muted">{response.num} of {response.n}, n={response.n}</span></span>
              <span><span className="block text-xs text-muted">Interview rate</span><span className={`font-semibold ${interview.tooFew ? 'text-sm text-muted' : 'text-lg'}`}>{rate(interview)}</span><span className="block text-xs text-muted">{interview.num} of {interview.n}, n={interview.n}</span></span>
            </button>
            {response.n === 0 && <button className="link mt-2 text-xs" onClick={() => confirm(`Delete ${cv.name}?`) && run(() => deleteCv(cv.id))}>Delete this version</button>}
          </li>
        ))}
      </ul>
      {stats.length === 0 && <p className="card p-6 text-center text-sm text-muted">No CV versions yet. Add the one you are sending now.</p>}

      {editing && <CvDialog cv={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CvDialog({ cv, onClose }: { cv: CvVersion | null; onClose: () => void }) {
  const { saveCv } = useData();
  const [name, setName] = useState(cv?.name ?? '');
  const [created, setCreated] = useState(cv?.created_on ?? today());
  const [focus, setFocus] = useState(cv?.focus ?? '');
  const [summary, setSummary] = useState(cv?.change_summary ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (file && file.type !== 'application/pdf') return setError('The file must be a PDF.');
    if (file && file.size > 5 * 1024 * 1024) return setError('The PDF must be under 5 MB.');
    setBusy(true);
    try {
      await saveCv(cv?.id ?? null, { name: name.trim(), created_on: created, focus: focus.trim() || null, change_summary: summary.trim() || null, active: cv?.active ?? true }, file);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={cv ? `Edit ${cv.name}` : 'New CV version'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name" hint="For example, General v2.">{(id) => <input id={id} className="input" required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Created on">{(id) => <input id={id} className="input" type="date" required value={created} onChange={(e) => setCreated(e.target.value)} />}</Field>
        <Field label="Focus" hint="For example, research and legal.">{(id) => <input id={id} className="input" value={focus} onChange={(e) => setFocus(e.target.value)} />}</Field>
        <Field label="What changed from the last version">{(id) => <textarea id={id} className="input h-24" value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field>
        <Field label={cv?.file_path ? 'Replace the PDF' : 'The PDF that was sent'} hint={cv?.file_name && cv.file_path ? `Current file: ${cv.file_name}` : undefined}>
          {(id) => <input id={id} className="input py-2" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}
