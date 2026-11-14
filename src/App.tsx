import { useEffect, useState, type FormEvent } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/store';
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

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (supabase && session === undefined) return <div className="p-6 text-sm text-muted">Loading…</div>;
  if (supabase && !session) return <Login />;

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

function Login() {
  const [mode, setMode] = useState<'password' | 'link'>('password');
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
      <div className="mt-6 flex gap-1 rounded-lg bg-raised p-1" role="tablist">
        {tab('password', 'Password')}
        {tab('link', 'Email link')}
      </div>
      {state === 'sent' ? (
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
            {state === 'sending' ? (mode === 'password' ? 'Signing in…' : 'Sending…') : mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
          </button>
          {mode === 'password' && <p className="text-xs text-muted">No password yet? Sign in with an email link once, then set one in Settings.</p>}
        </form>
      )}
    </main>
  );
}
