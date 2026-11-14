import { useState, type FormEvent } from 'react';
import { useData } from '../lib/data';
import { store, supabase } from '../lib/store';
import { download, toCsv } from '../lib/export';
import { payAnnual, today } from '../lib/format';
import { useTheme, type Theme } from '../components/Layout';
import PasswordForm from '../components/PasswordForm';
import { ErrorText, Field, PageHeader, Select } from '../components/ui';

export default function SettingsPage() {
  const { data, saveSettings } = useData();
  const s = data.settings;
  const [target, setTarget] = useState(String(s.weekly_target));
  const [days, setDays] = useState(String(s.no_response_days));
  const [day, setDay] = useState(String(s.day_multiplier));
  const [hour, setHour] = useState(String(s.hour_multiplier));
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [theme, setTheme] = useTheme();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(''); setError('');
    try {
      await saveSettings({ weekly_target: Math.round(Number(target)), no_response_days: Math.round(Number(days)), day_multiplier: Number(day), hour_multiplier: Number(hour) });
      setMsg('Saved.');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const csv = (name: string, rows: object[]) => download(`${name}-${today()}.csv`, toCsv(rows as Record<string, unknown>[]), 'text/csv');
  const n = (label: string, value: string, set: (v: string) => void, min: number, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <input id={id} className="input" type="number" inputMode="numeric" required min={min} step="any" value={value} onChange={(e) => set(e.target.value)} />}</Field>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Settings" />
      <form onSubmit={submit} className="card space-y-3 p-4">
        {n('Weekly application target', target, setTarget, 0, 'The dashed line on the weekly chart.')}
        {n('Days before No response', days, setDays, 1, 'An application in Applied with no event for this long is flagged for a one-tap move to No response.')}
        <div className="grid grid-cols-2 gap-3">
          {n('Day rate multiplier', day, setDay, 1, 'Working days in a year.')}
          {n('Hourly multiplier', hour, setHour, 1, 'Working hours in a year.')}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center gap-3"><button className="btn btn-primary">Save settings</button><span className="text-sm text-muted" role="status">{msg}</span></div>
      </form>

      <section className="card p-4">
        <Field label="Appearance">{(id) => <Select<Theme> id={id} value={theme} onChange={(v) => v && setTheme(v)} options={[{ value: 'system', label: 'Match the device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />}</Field>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="mb-3 text-xs text-muted">One CSV file per table.</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" onClick={() => csv('applications', data.applications.map((a) => ({ ...a, pay_annual: payAnnual(a, s) })))}>Applications</button>
          <button className="btn" onClick={() => csv('status_events', data.events)}>Status events</button>
          <button className="btn" onClick={() => csv('cv_versions', data.cvs.map((c) => ({ ...c, file_path: c.file_path?.startsWith('data:') ? '(stored in this browser)' : c.file_path })))}>CV versions</button>
          <button className="btn" onClick={() => csv('interviews', data.interviews)}>Interviews</button>
        </div>
      </section>

      {store.mode === 'supabase' && <PasswordForm />}

      <section className="card p-4 text-sm text-muted">
        {store.mode === 'supabase'
          ? <button className="btn" onClick={() => supabase?.auth.signOut()}>Sign out</button>
          : 'Demo mode: data is kept in this browser only. Set the Supabase keys to sign in and sync across devices.'}
      </section>
    </div>
  );
}

