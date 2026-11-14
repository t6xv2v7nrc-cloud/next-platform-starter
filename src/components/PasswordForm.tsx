import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/store';
import { ErrorText, Field } from './ui';

/** Set or change the signed-in user's password. */
export default function PasswordForm({ title = 'Password', intro, onDone }: { title?: string; intro?: string; onDone?: () => void }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== again) return setError('The two passwords do not match.');
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setError(
        /reauthenticat|recent/i.test(error.message) ? 'For security, sign out and back in, then set the password straight away.'
        : /different from the old/i.test(error.message) ? 'Choose a password you have not used here before.'
        : error.message,
      );
      return;
    }
    setPw('');
    setAgain('');
    if (onDone) onDone();
    else setMsg('Password saved. You can now sign in with it on any browser.');
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted">{intro ?? 'Set one to sign in on other browsers and devices without waiting for an email.'}</p>
      </div>
      <Field label="New password">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
      <Field label="Type it again">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />}</Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
        <span className="text-sm text-muted" role="status">{msg}</span>
      </div>
    </form>
  );
}
