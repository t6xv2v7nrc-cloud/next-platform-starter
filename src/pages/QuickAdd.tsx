import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { suggestCv } from '../lib/analytics';
import { needsCv, SECTORS, type Application, type Sector, type Source, type Status } from '../lib/types';
import { today } from '../lib/format';
import { ErrorText, Field, PageHeader, Select } from '../components/ui';

const QUICK_STATUSES: Status[] = ['Saved', 'Applied', 'Screening', 'Interview'];

function sourceFor(url: string): Source {
  if (/indeed\./i.test(url)) return 'Indeed';
  return url.trim() ? 'Company site' : 'Indeed';
}

export default function QuickAdd() {
  const { data, rows, createApplication } = useData();
  const [url, setUrl] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [sector, setSector] = useState<Sector | ''>('');
  const [status, setStatus] = useState<Status>('Saved');
  const [cv, setCv] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Application | null>(null);

  const active = data.cvs.filter((c) => c.active);
  const hint = useMemo(() => (sector ? suggestCv(rows, data.cvs, sector) : null), [rows, data.cvs, sector]);

  async function paste() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      setError('Could not read the clipboard. Paste the link into the box instead.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (/linkedin\./i.test(url)) return setError('LinkedIn links are not used in this tracker. Paste the Indeed or company link.');
    setBusy(true);
    setError('');
    try {
      const app = await createApplication({
        company: company.trim(), role_title: role.trim(), job_url: url.trim() || null, source: sourceFor(url),
        sector: sector || 'Other', status, cv_version_id: cv || null, date_found: today(), date_applied: needsCv(status) ? today() : null,
      });
      setSaved(app);
      setUrl(''); setCompany(''); setRole(''); setCv('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Quick add" />
      {saved && (
        <p className="mb-3 rounded-lg border border-good/50 bg-good/10 px-3 py-2 text-sm" role="status">
          Logged {saved.company}. <Link className="link" to={`/applications/${saved.id}`}>Add the rest</Link> or log another below.
        </p>
      )}
      <form onSubmit={submit} className="card space-y-3 p-4">
        <Field label="Job link">
          {(id) => (
            <div className="flex gap-2">
              <input id={id} className="input" type="url" inputMode="url" autoFocus placeholder="Paste the Indeed or company link" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button type="button" className="btn shrink-0" onClick={paste}>Paste</button>
            </div>
          )}
        </Field>
        <Field label="Company">{(id) => <input id={id} className="input" required autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />}</Field>
        <Field label="Role">{(id) => <input id={id} className="input" required autoComplete="off" value={role} onChange={(e) => setRole(e.target.value)} />}</Field>
        <Field label="Sector">{(id) => <Select id={id} value={sector} onChange={setSector} options={SECTORS} empty="Choose a sector" required />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={status} onChange={(v) => v && setStatus(v)} options={QUICK_STATUSES} />}</Field>
        <Field
          label={needsCv(status) ? 'CV version sent' : 'CV version (needed once applied)'}
          hint={hint && (
            <>
              Both versions are in use for this sector. Last time you sent {hint.last.name}, so try{' '}
              <button type="button" className="link" onClick={() => setCv(hint.suggest.id)}>{hint.suggest.name}</button> this time to keep the test fair.
            </>
          )}
        >
          {(id) => <Select id={id} value={cv} onChange={setCv} required={needsCv(status)} empty={needsCv(status) ? 'Choose a version' : 'Not sent yet'} options={active.map((c) => ({ value: c.id, label: c.name }))} />}
        </Field>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
