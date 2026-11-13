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
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (error) {
      setError(error.message);
      setState('idle');
    } else setState('sent');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-2xl font-semibold">Job tracker</h1>
      {state === 'sent' ? (
        <p className="mt-4 text-sm text-muted" role="status">
          Check your inbox. The sign-in link has been sent to {email.trim()}.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="text-sm text-bad" role="alert">{error}</p>}
          <button className="btn btn-primary w-full" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}
    </main>
  );
}
