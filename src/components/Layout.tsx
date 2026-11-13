import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { store, supabase } from '../lib/store';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
  { to: '/board', label: 'Board', icon: 'M4 4h4v14H4zM10 4h4v9h-4zM16 4h4v12h-4z' },
  { to: '/add', label: 'Quick add', icon: 'M12 5v14M5 12h14' },
  { to: '/applications', label: 'Table', icon: 'M3 6h18M3 12h18M3 18h18' },
  { to: '/cv', label: 'CVs', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6' },
  { to: '/settings', label: 'Settings', icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export type Theme = 'system' | 'light' | 'dark';
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('jt.theme') as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    try {
      localStorage.setItem('jt.theme', theme);
    } catch {
      /* ignore */
    }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  return [theme, setTheme];
}

export default function Layout({ children, email }: { children: ReactNode; email: string | null }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'}`;
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${isActive ? 'text-accent-ink' : 'text-muted'}`;

  return (
    <div className="min-h-dvh lg:pl-56">
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-line bg-surface p-3 lg:flex">
        <div className="px-3 py-3 text-base font-semibold">Job tracker</div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}>
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 text-xs text-muted">
          {email ? (
            <>
              <div className="truncate">{email}</div>
              <button className="link mt-1" onClick={() => supabase?.auth.signOut()}>Sign out</button>
            </>
          ) : (
            'Demo mode'
          )}
        </div>
      </aside>

      {store.mode === 'local' && (
        <div className="border-b border-line bg-raised px-4 py-2 text-center text-xs text-muted">
          Demo mode: data is kept in this browser only. Connect Supabase to sign in and sync.
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 pt-4 pb-24 lg:px-6 lg:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {NAV.map((n) =>
          n.to === '/add' ? (
            <NavLink key={n.to} to={n.to} className="flex flex-1 items-center justify-center" aria-label="Quick add">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white">
                <Icon d={n.icon} />
              </span>
            </NavLink>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={tab}>
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  );
}
