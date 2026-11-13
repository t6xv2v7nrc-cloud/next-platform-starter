import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store, type CvInput, type InterviewInput, type MoveOpts } from './store';
import { needsCv, type Application, type CvVersion, type Data, type NewApplication, type Settings, type Status, type StatusEvent } from './types';
import { applyFilters, buildRows, NO_FILTERS, type Filters, type Row } from './analytics';
import { toISODate, today } from './format';

/** A named set of applications, opened in the table when a bar, dot or tile is clicked. */
export interface Drill {
  label: string;
  ids: string[];
}

interface Ctx {
  data: Data;
  rows: Row[];
  /** Rows after the global dashboard filters. */
  filtered: Row[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  drill: Drill | null;
  setDrill: (d: Drill | null) => void;
  cvName: (id: string | null) => string;
  createApplication: (a: NewApplication, opts?: MoveOpts) => Promise<Application>;
  updateApplication: (id: string, patch: Partial<Application>, opts?: MoveOpts) => Promise<void>;
  /** Change status, writing a status event. Fills in date_applied on first send. */
  move: (app: Application, to: Status, opts?: MoveOpts & { cvVersionId?: string }) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  updateEvent: (id: string, patch: Pick<StatusEvent, 'changed_at' | 'note'>) => Promise<void>;
  saveCv: (id: string | null, cv: CvInput, file?: File | null) => Promise<CvVersion>;
  deleteCv: (id: string) => Promise<void>;
  saveInterview: (id: string | null, i: InterviewInput) => Promise<void>;
  deleteInterview: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);
export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData outside provider');
  return c;
}

function useSession<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable: keep it in memory */
      }
    },
    [key],
  );
  return [v, set];
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useSession<Filters>('jt.filters', NO_FILTERS);
  const [drill, setDrill] = useSession<Drill | null>('jt.drill', null);

  useEffect(() => {
    store.load().then(setData, (e: Error) => setError(e.message));
  }, []);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const ctx = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const patch = (fn: (d: Data) => Data) => setData((d) => (d ? fn(d) : d));
    const putApp = (app: Application, events: StatusEvent[]) =>
      patch((d) => ({
        ...d,
        applications: d.applications.some((a) => a.id === app.id) ? d.applications.map((a) => (a.id === app.id ? app : a)) : [...d.applications, app],
        events: [...d.events.filter((e) => e.application_id !== app.id), ...events],
      }));

    const updateApplication: Ctx['updateApplication'] = async (id, p, opts) => {
      const res = await store.updateApplication(id, p, opts);
      putApp(res.app, res.events);
    };

    return {
      data, rows, filtered, filters, setFilters, drill, setDrill,
      cvName: (id) => data.cvs.find((c) => c.id === id)?.name ?? '',
      createApplication: async (a, opts) => {
        const res = await store.createApplication(a, opts);
        putApp(res.app, res.events);
        return res.app;
      },
      updateApplication,
      move: async (app, to, opts) => {
        const p: Partial<Application> = { status: to };
        if (opts?.cvVersionId) p.cv_version_id = opts.cvVersionId;
        if (needsCv(to) && to !== 'Rejected' && to !== 'No response' && !app.date_applied)
          p.date_applied = opts?.changedAt ? toISODate(new Date(opts.changedAt)) : today();
        await updateApplication(app.id, p, opts);
      },
      deleteApplication: async (id) => {
        await store.deleteApplication(id);
        patch((d) => ({
          ...d,
          applications: d.applications.filter((a) => a.id !== id),
          events: d.events.filter((e) => e.application_id !== id),
          interviews: d.interviews.filter((e) => e.application_id !== id),
        }));
      },
      updateEvent: async (id, p) => {
        const ev = await store.updateEvent(id, p);
        patch((d) => ({ ...d, events: d.events.map((e) => (e.id === id ? ev : e)) }));
      },
      saveCv: async (id, cv, file) => {
        const out = await store.saveCv(id, cv, file);
        patch((d) => ({ ...d, cvs: d.cvs.some((c) => c.id === out.id) ? d.cvs.map((c) => (c.id === out.id ? out : c)) : [...d.cvs, out] }));
        return out;
      },
      deleteCv: async (id) => {
        await store.deleteCv(id);
        patch((d) => ({ ...d, cvs: d.cvs.filter((c) => c.id !== id) }));
      },
      saveInterview: async (id, i) => {
        const out = await store.saveInterview(id, i);
        patch((d) => ({ ...d, interviews: d.interviews.some((x) => x.id === out.id) ? d.interviews.map((x) => (x.id === out.id ? out : x)) : [...d.interviews, out] }));
      },
      deleteInterview: async (id) => {
        await store.deleteInterview(id);
        patch((d) => ({ ...d, interviews: d.interviews.filter((x) => x.id !== id) }));
      },
      saveSettings: async (p) => {
        const settings = await store.saveSettings(p);
        patch((d) => ({ ...d, settings }));
      },
    };
  }, [data, rows, filtered, filters, setFilters, drill, setDrill]);

  if (error)
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">Could not load your data</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <button className="btn btn-primary mt-4" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!ctx) return <div className="p-6 text-sm text-muted">Loading…</div>;
  return <DataCtx.Provider value={ctx}>{children}</DataCtx.Provider>;
}
