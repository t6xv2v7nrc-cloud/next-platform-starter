import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SETTINGS, needsCv,
  type Application, type CvVersion, type Data, type Interview, type NewApplication, type Settings, type StatusEvent,
} from './types';
import { SEED_APPLICATIONS, SEED_CVS } from './seed';
import { today } from './format';

export interface MoveOpts {
  /** Back-date the status event written by this change. */
  changedAt?: string;
  note?: string;
}
export type CvInput = Partial<Omit<CvVersion, 'id' | 'created_at'>> & { name: string };
export type InterviewInput = Omit<Interview, 'id'>;

export interface Store {
  mode: 'supabase' | 'local';
  load(): Promise<Data>;
  createApplication(a: NewApplication, opts?: MoveOpts): Promise<{ app: Application; events: StatusEvent[] }>;
  updateApplication(id: string, patch: Partial<Application>, opts?: MoveOpts): Promise<{ app: Application; events: StatusEvent[] }>;
  deleteApplication(id: string): Promise<void>;
  updateEvent(id: string, patch: Pick<StatusEvent, 'changed_at' | 'note'>): Promise<StatusEvent>;
  saveCv(id: string | null, cv: CvInput, file?: File | null): Promise<CvVersion>;
  deleteCv(id: string): Promise<void>;
  cvUrl(cv: CvVersion): Promise<string | null>;
  saveInterview(id: string | null, i: InterviewInput): Promise<Interview>;
  deleteInterview(id: string): Promise<void>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** True when this page was opened from a password-reset email. Read before the client clears the URL. */
export const openedFromReset = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search);
/** True when an email link was opened after it expired or was already used. */
export const openedExpiredLink = typeof window !== 'undefined' && /error_code=otp_expired/.test(window.location.hash + window.location.search);
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

function assertCv(status: Application['status'], cvId: string | null | undefined) {
  if (needsCv(status) && !cvId) throw new Error('Choose the CV version that was sent. No version, no save.');
}

// ---------------------------------------------------------------- Supabase

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

class SupabaseStore implements Store {
  mode = 'supabase' as const;
  constructor(private db: SupabaseClient) {}

  private async uid(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('You are signed out. Sign in again.');
    return id;
  }

  async load(): Promise<Data> {
    let { data: settings, error } = await this.db.from('settings').select('*').maybeSingle();
    fail(error);
    if (!settings?.seeded) {
      const { data: cvCount } = await this.db.from('cv_versions').select('id').limit(1);
      const { data: appCount } = await this.db.from('applications').select('id').limit(1);
      if (!cvCount?.length && !appCount?.length) {
        fail((await this.db.from('cv_versions').insert(SEED_CVS)).error);
        fail((await this.db.from('applications').insert(SEED_APPLICATIONS)).error);
      }
      const res = await this.db.from('settings').upsert({ user_id: await this.uid(), seeded: true }).select().single();
      fail(res.error);
      settings = res.data;
    }
    const [apps, events, cvs, interviews] = await Promise.all([
      this.db.from('applications').select('*').order('created_at'),
      this.db.from('status_events').select('*').order('changed_at'),
      this.db.from('cv_versions').select('*').order('created_at'),
      this.db.from('interviews').select('*').order('date_time'),
    ]);
    [apps, events, cvs, interviews].forEach((r) => fail(r.error));
    return {
      applications: apps.data as Application[],
      events: events.data as StatusEvent[],
      cvs: cvs.data as CvVersion[],
      interviews: interviews.data as Interview[],
      settings: { ...DEFAULT_SETTINGS, ...settings } as Settings,
    };
  }

  /** The database trigger wrote the event; apply any back-date or note, then return the events. */
  private async eventsAfterChange(appId: string, opts?: MoveOpts): Promise<StatusEvent[]> {
    const { data, error } = await this.db.from('status_events').select('*').eq('application_id', appId).order('changed_at');
    fail(error);
    const events = data as StatusEvent[];
    if (opts && (opts.changedAt || opts.note) && events.length) {
      // The trigger stamps now(), so the newest row is the one just written.
      const newest = events[events.length - 1];
      const patched = await this.updateEvent(newest.id, { changed_at: opts.changedAt ?? newest.changed_at, note: opts.note ?? null });
      return events.map((e) => (e.id === patched.id ? patched : e)).sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    }
    return events;
  }

  async createApplication(a: NewApplication, opts?: MoveOpts) {
    assertCv(a.status ?? 'Saved', a.cv_version_id);
    const { data, error } = await this.db.from('applications').insert(a).select().single();
    fail(error);
    return { app: data as Application, events: await this.eventsAfterChange(data.id, opts) };
  }

  async updateApplication(id: string, patch: Partial<Application>, opts?: MoveOpts) {
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = patch;
    const { data, error } = await this.db.from('applications').update(rest).eq('id', id).select().single();
    if (error?.message.includes('cv_required_once_applied')) throw new Error('Choose the CV version that was sent. No version, no save.');
    fail(error);
    return { app: data as Application, events: await this.eventsAfterChange(id, patch.status ? opts : undefined) };
  }

  async deleteApplication(id: string) {
    fail((await this.db.from('applications').delete().eq('id', id)).error);
  }

  async updateEvent(id: string, patch: Pick<StatusEvent, 'changed_at' | 'note'>) {
    const { data, error } = await this.db.from('status_events').update(patch).eq('id', id).select().single();
    fail(error);
    return data as StatusEvent;
  }

  async saveCv(id: string | null, cv: CvInput, file?: File | null) {
    const row: CvInput = { ...cv };
    if (file) {
      const path = `${await this.uid()}/${crypto.randomUUID()}.pdf`;
      fail((await this.db.storage.from('cvs').upload(path, file, { contentType: 'application/pdf' })).error);
      row.file_path = path;
      row.file_name = file.name;
    }
    const q = id ? this.db.from('cv_versions').update(row).eq('id', id) : this.db.from('cv_versions').insert(row);
    const { data, error } = await q.select().single();
    fail(error);
    return data as CvVersion;
  }

  async deleteCv(id: string) {
    const { data } = await this.db.from('cv_versions').select('file_path').eq('id', id).maybeSingle();
    const { error } = await this.db.from('cv_versions').delete().eq('id', id);
    if (error) throw new Error(error.code === '23503' ? 'This version has been sent with an application, so it cannot be deleted. Retire it instead.' : error.message);
    if (data?.file_path) await this.db.storage.from('cvs').remove([data.file_path]);
  }

  async cvUrl(cv: CvVersion) {
    if (!cv.file_path) return null;
    const { data, error } = await this.db.storage.from('cvs').createSignedUrl(cv.file_path, 300);
    fail(error);
    return data!.signedUrl;
  }

  async saveInterview(id: string | null, i: InterviewInput) {
    const q = id ? this.db.from('interviews').update(i).eq('id', id) : this.db.from('interviews').insert(i);
    const { data, error } = await q.select().single();
    fail(error);
    return data as Interview;
  }

  async deleteInterview(id: string) {
    fail((await this.db.from('interviews').delete().eq('id', id)).error);
  }

  async saveSettings(patch: Partial<Settings>) {
    const { data, error } = await this.db.from('settings').upsert({ user_id: await this.uid(), ...patch }).select().single();
    fail(error);
    return { ...DEFAULT_SETTINGS, ...data } as Settings;
  }
}

// ---------------------------------------------------------------- Demo mode (this browser only)

const LS_KEY = 'jt.data.v1';
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

const BLANK: Omit<Application, 'id' | 'company' | 'role_title' | 'created_at' | 'updated_at'> = {
  job_url: null, source: 'Indeed', sector: 'Other', location: null, work_mode: null, contract_type: null,
  pay_min: null, pay_max: null, pay_unit: null, date_found: null, date_applied: null, closing_date: null,
  cv_version_id: null, cover_letter: false, status: 'Saved', fit_score: null, conflict_risk: null,
  next_action: null, next_action_date: null, contact_name: null, contact_email: null, rejection_reason: null, notes: null,
};

export class LocalStore implements Store {
  mode = 'local' as const;
  private d: Data = { applications: [], events: [], cvs: [], interviews: [], settings: { ...DEFAULT_SETTINGS } };

  private persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.d));
    } catch {
      throw new Error('This browser is out of storage space. Remove a CV PDF or connect Supabase.');
    }
  }

  async load(): Promise<Data> {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) this.d = JSON.parse(raw);
    if (!this.d.settings.seeded) {
      for (const c of SEED_CVS) this.d.cvs.push({ id: uuid(), file_path: null, created_at: nowIso(), ...c });
      for (const a of SEED_APPLICATIONS) this.insertApp(a);
      this.d.settings.seeded = true;
      this.persist();
    }
    return structuredClone(this.d);
  }

  private insertApp(a: NewApplication, opts?: MoveOpts) {
    const app: Application = { ...BLANK, ...a, id: uuid(), created_at: nowIso(), updated_at: nowIso() };
    this.d.applications.push(app);
    const ev: StatusEvent = { id: uuid(), application_id: app.id, from_status: null, to_status: app.status, changed_at: opts?.changedAt ?? nowIso(), note: opts?.note ?? null };
    this.d.events.push(ev);
    return { app, events: [ev] };
  }

  async createApplication(a: NewApplication, opts?: MoveOpts) {
    assertCv(a.status ?? 'Saved', a.cv_version_id);
    const res = this.insertApp(a, opts);
    this.persist();
    return structuredClone(res);
  }

  async updateApplication(id: string, patch: Partial<Application>, opts?: MoveOpts) {
    const i = this.d.applications.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Application not found.');
    const old = this.d.applications[i];
    const app = { ...old, ...patch, id, created_at: old.created_at, updated_at: nowIso() };
    assertCv(app.status, app.cv_version_id);
    this.d.applications[i] = app;
    if (app.status !== old.status) {
      this.d.events.push({ id: uuid(), application_id: id, from_status: old.status, to_status: app.status, changed_at: opts?.changedAt ?? nowIso(), note: opts?.note ?? null });
    }
    this.persist();
    return structuredClone({ app, events: this.d.events.filter((e) => e.application_id === id) });
  }

  async deleteApplication(id: string) {
    this.d.applications = this.d.applications.filter((a) => a.id !== id);
    this.d.events = this.d.events.filter((e) => e.application_id !== id);
    this.d.interviews = this.d.interviews.filter((e) => e.application_id !== id);
    this.persist();
  }

  async updateEvent(id: string, patch: Pick<StatusEvent, 'changed_at' | 'note'>) {
    const e = this.d.events.find((x) => x.id === id);
    if (!e) throw new Error('Event not found.');
    Object.assign(e, patch);
    this.persist();
    return { ...e };
  }

  async saveCv(id: string | null, cv: CvInput, file?: File | null) {
    const row: CvInput = { ...cv };
    if (file) {
      row.file_path = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('Could not read the file.'));
        r.readAsDataURL(file);
      });
      row.file_name = file.name;
    }
    let out: CvVersion;
    if (id) {
      const existing = this.d.cvs.find((c) => c.id === id);
      if (!existing) throw new Error('CV version not found.');
      out = Object.assign(existing, row);
    } else {
      out = { id: uuid(), file_path: null, file_name: null, created_on: today(), focus: null, change_summary: null, active: true, created_at: nowIso(), ...row };
      this.d.cvs.push(out);
    }
    this.persist();
    return { ...out };
  }

  async deleteCv(id: string) {
    if (this.d.applications.some((a) => a.cv_version_id === id))
      throw new Error('This version has been sent with an application, so it cannot be deleted. Retire it instead.');
    this.d.cvs = this.d.cvs.filter((c) => c.id !== id);
    this.persist();
  }

  async cvUrl(cv: CvVersion) {
    if (!cv.file_path) return null;
    const blob = await (await fetch(cv.file_path)).blob();
    return URL.createObjectURL(blob);
  }

  async saveInterview(id: string | null, i: InterviewInput) {
    let out: Interview;
    if (id) {
      const existing = this.d.interviews.find((x) => x.id === id);
      if (!existing) throw new Error('Interview not found.');
      out = Object.assign(existing, i);
    } else {
      out = { id: uuid(), ...i };
      this.d.interviews.push(out);
    }
    this.persist();
    return { ...out };
  }

  async deleteInterview(id: string) {
    this.d.interviews = this.d.interviews.filter((x) => x.id !== id);
    this.persist();
  }

  async saveSettings(patch: Partial<Settings>) {
    this.d.settings = { ...this.d.settings, ...patch };
    this.persist();
    return { ...this.d.settings };
  }
}

export const store: Store = supabase ? new SupabaseStore(supabase) : new LocalStore();
