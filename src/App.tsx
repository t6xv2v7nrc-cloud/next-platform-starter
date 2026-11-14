import { useEffect, useState, type FormEvent } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { openedExpiredLink, openedFromReset, supabase } from './lib/store';
import PasswordForm from './components/PasswordForm';
import { DataProvider } from './lib/data';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Board from './pages/Board';
import ApplicationsTable from './pages/ApplicationsTable';
import ApplicationDetail from './pages/ApplicationDetail';
import QuickAdd from './pages/QuickAdd';
import CvVersions from './pages/CvVersions';
import SettingsPage from './pages/Settings';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [resetting, setResetting] = useState(openedFromReset);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setResetting(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (supabase && session === undefined) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (supabase && !session) return <Login expired={openedExpiredLink} />;
  if (supabase && resetting)
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
        <h1 className="mb-4 text-2xl font-semibold">Job tracker</h1>
        <PasswordForm title="Set a new password" intro={`For ${session?.user.email ?? 'your account'}. You will use it to sign in on any browser.`} onDone={() => setResetting(false)} />
        <button className="link mt-4 self-start text-sm" onClick={() => setResetting(false)}>Skip for now</button>
      </main>
    );

  return (
    <DataProvider key={session?.user.id ?? 'local'}>
      <Layout email={session?.user.email ?? null}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/board" element={<Board />} />
          <Route path="/applications" element={<ApplicationsTable />} />
          <Route path="/applications/:id" element={<ApplicationDetail />} />
          <Route path="/add" element={<QuickAdd />} />
          <Route path="/cv" element={<CvVersions />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Layout>
    </DataProvider>
  );
}

function Login({ expired }: { expired?: boolean }) {
  const [mode, setMode] = useState<'password' | 'link' | 'reset'>(expired ? 'reset' : 'password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    if (mode === 'password') {
      const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(
          /invalid login credentials/i.test(error.message)
            ? 'Wrong email or password. If you have not set a password yet, sign in with an email link once, then set one in Settings.'
            : error.message,
        );
        setState('idle');
      }
      return; // on success the session listener in App takes over
    }
    if (mode === 'reset') {
      const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) {
        setError(/rate limit/i.test(error.message) ? 'Too many emails have been sent in the last hour. Try again later.' : error.message);
        setState('idle');
      } else setState('sent');
      return;
    }
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (error) {
      setError(
        /rate limit/i.test(error.message)
          ? 'Too many sign-in emails have been sent in the last hour. Sign in with your password instead, or try again later.'
          : error.message,
      );
      setState('idle');
    } else setState('sent');
  }

  const tab = (m: typeof mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m}
      className={`flex-1 rounded-md py-2 text-sm font-medium ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
      onClick={() => { setMode(m); setError(''); setState('idle'); }}>
      {label}
    </button>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Job tracker</h1>
      {mode === 'reset' ? (
        <div className="mt-6">
          <h2 className="text-base font-semibold">Reset your password</h2>
          <p className="mt-1 text-sm text-muted">
            {expired ? 'That email link has expired or was already used. Enter your email for a new reset link, or go back and sign in with your password.' : 'We will email you a link. Open it and you can choose a new password.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 flex gap-1 rounded-lg bg-raised p-1" role="tablist">
          {tab('password', 'Password')}
          {tab('link', 'Email link')}
        </div>
      )}
      {state === 'sent' && mode === 'reset' ? (
        <div className="mt-4 space-y-3 text-sm text-muted" role="status">
          <p>If {email.trim()} has an account, a reset link is on its way. Open it, choose a new password, then sign in with it on any browser.</p>
          <p>Nothing arrived? Check your junk folder. Only a few emails can be sent each hour.</p>
          <button className="link" onClick={() => { setMode('password'); setState('idle'); }}>Back to sign in</button>
        </div>
      ) : state === 'sent' ? (
        <p className="mt-4 text-sm text-muted" role="status">
          Check your inbox. The sign-in link has been sent to {email.trim()}. It signs in the browser it opens in, so to use it in this browser, copy the link and paste it here.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode === 'password' && (
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          <button className="btn btn-primary w-full" disabled={state === 'sending'}>
            {state === 'sending' ? (mode === 'password' ? 'Signing in…' : 'Sending…')
              : mode === 'password' ? 'Sign in' : mode === 'reset' ? 'Email me a reset link' : 'Email me a sign-in link'}
          </button>
          {mode === 'password' && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <button type="button" className="link" onClick={() => { setMode('reset'); setError(''); setState('idle'); }}>Forgot password?</button>
              <span>No password yet? Use Email link once, then set one in Settings.</span>
            </div>
          )}
          {mode === 'reset' && (
            <button type="button" className="link text-sm" onClick={() => { setMode('password'); setError(''); setState('idle'); }}>Back to sign in</button>
          )}
        </form>
      )}
    </main>
  );
}
