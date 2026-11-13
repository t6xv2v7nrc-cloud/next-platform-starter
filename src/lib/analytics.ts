import {
  PIPELINE, SECTORS, SOURCES, RISKS, STATUSES, isClosed,
  type Application, type CvVersion, type Data, type Sector, type Source, type Status, type StatusEvent,
} from './types';
import { addDays, daysBetween, payAnnual, today, toISODate, weekStart } from './format';

export const MIN_N = 5;
const idx = (s: Status) => (PIPELINE as readonly string[]).indexOf(s);
const APPLIED = idx('Applied');
const SCREENING = idx('Screening');
const INTERVIEW = idx('Interview');
const OFFER = idx('Offer');

/** One application with everything the charts need, derived from its status events. */
export interface Row {
  app: Application;
  events: StatusEvent[]; // oldest first
  /** Index into PIPELINE of the furthest stage reached (0 = Saved only). */
  furthest: number;
  sent: boolean;
  appliedOn: string | null;
  replied: boolean;
  interviewed: boolean;
  offered: boolean;
  firstReplyDays: number | null;
  payAnnual: number | null;
  /** Date of the most recent status event. */
  lastEventOn: string;
  daysInStage: number;
}

export interface Filters {
  from: string;
  to: string;
  sector: Sector | '';
  source: Source | '';
  cv: string;
}
export const NO_FILTERS: Filters = { from: '', to: '', sector: '', source: '', cv: '' };

export function buildRows(data: Data, now = today()): Row[] {
  const byApp = new Map<string, StatusEvent[]>();
  for (const e of data.events) {
    const list = byApp.get(e.application_id);
    if (list) list.push(e);
    else byApp.set(e.application_id, [e]);
  }
  return data.applications.map((app) => {
    const events = (byApp.get(app.id) ?? []).slice().sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    const seen: Status[] = [app.status];
    for (const e of events) {
      seen.push(e.to_status);
      if (e.from_status) seen.push(e.from_status);
    }
    let furthest = Math.max(0, ...seen.map(idx));
    // A rejection or a silence can only follow an application.
    const rejected = seen.includes('Rejected');
    if ((rejected || seen.includes('No response') || app.date_applied) && furthest < APPLIED) furthest = APPLIED;
    const sent = furthest >= APPLIED;

    const appliedEvent = events.find((e) => idx(e.to_status) >= APPLIED || e.to_status === 'Rejected' || e.to_status === 'No response');
    const appliedOn = sent ? app.date_applied ?? (appliedEvent ? toISODate(new Date(appliedEvent.changed_at)) : toISODate(new Date(app.created_at))) : null;

    const replyEvent = events.find((e) => idx(e.to_status) >= SCREENING || e.to_status === 'Rejected');
    const replied = sent && (furthest >= SCREENING || rejected);
    const firstReplyDays = appliedOn && replyEvent ? Math.max(0, daysBetween(appliedOn, toISODate(new Date(replyEvent.changed_at)))) : null;

    const last = events[events.length - 1];
    const lastEventOn = toISODate(new Date(last ? last.changed_at : app.created_at));
    return {
      app, events, furthest, sent, appliedOn, replied,
      interviewed: sent && furthest >= INTERVIEW,
      offered: sent && furthest >= OFFER,
      firstReplyDays,
      payAnnual: payAnnual(app, data.settings),
      lastEventOn,
      daysInStage: Math.max(0, daysBetween(lastEventOn, now)),
    };
  });
}

/** The date an application is filed under for the date-range filter. */
export function rowDate(r: Row): string {
  return r.appliedOn ?? r.app.date_found ?? toISODate(new Date(r.app.created_at));
}

export function applyFilters(rows: Row[], f: Filters): Row[] {
  return rows.filter((r) => {
    if (f.sector && r.app.sector !== f.sector) return false;
    if (f.source && r.app.source !== f.source) return false;
    if (f.cv && r.app.cv_version_id !== f.cv) return false;
    const d = rowDate(r);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    return true;
  });
}

export interface Rate {
  label: string;
  num: number;
  n: number;
  /** null when n is 0 */
  rate: number | null;
  tooFew: boolean;
  /** Applications counted in the numerator and in the sample. */
  hitIds: string[];
  ids: string[];
}

export function rate(label: string, rows: Row[], pred: (r: Row) => boolean): Rate {
  const sent = rows.filter((r) => r.sent);
  const hits = sent.filter(pred);
  return {
    label,
    num: hits.length,
    n: sent.length,
    rate: sent.length ? hits.length / sent.length : null,
    tooFew: sent.length < MIN_N,
    hitIds: hits.map((r) => r.app.id),
    ids: sent.map((r) => r.app.id),
  };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function kpis(rows: Row[], allRowsNoDate: Row[], now = today()) {
  const sent = rows.filter((r) => r.sent);
  const wk = weekStart(now);
  const thisWeek = allRowsNoDate.filter((r) => r.sent && r.appliedOn! >= wk && r.appliedOn! <= addDays(wk, 6));
  const replyDays = sent.filter((r) => r.firstReplyDays != null);
  const active = rows.filter((r) => r.sent && !isClosed(r.app.status) && r.app.status !== 'Accepted');
  return {
    thisWeek: thisWeek.map((r) => r.app.id),
    sent: sent.map((r) => r.app.id),
    response: rate('Response rate', rows, (r) => r.replied),
    interview: rate('Interview rate', rows, (r) => r.interviewed),
    offer: rate('Offer rate', rows, (r) => r.offered),
    medianReply: median(replyDays.map((r) => r.firstReplyDays!)),
    replyIds: replyDays.map((r) => r.app.id),
    active: active.map((r) => r.app.id),
  };
}

export const FUNNEL_STAGES: Status[] = ['Applied', 'Screening', 'Interview', 'Final interview', 'Offer'];

export function funnel(rows: Row[]) {
  return FUNNEL_STAGES.map((stage, i, all) => {
    const reached = rows.filter((r) => r.sent && r.furthest >= idx(stage));
    const prev = i === 0 ? null : rows.filter((r) => r.sent && r.furthest >= idx(all[i - 1])).length;
    return { stage, count: reached.length, ids: reached.map((r) => r.app.id), carried: prev ? reached.length / prev : null };
  });
}

export function ratesBy<K extends string>(rows: Row[], keys: readonly K[], keyOf: (r: Row) => K | null, pred: (r: Row) => boolean): Rate[] {
  return keys.map((k) => rate(k, rows.filter((r) => keyOf(r) === k), pred));
}

export const bySector = (rows: Row[]) => ratesBy(rows, SECTORS, (r) => r.app.sector, (r) => r.interviewed);
export const bySource = (rows: Row[]) => ratesBy(rows, SOURCES, (r) => r.app.source, (r) => r.interviewed);
export const byRisk = (rows: Row[]) => ratesBy(rows, RISKS, (r) => r.app.conflict_risk, (r) => r.interviewed);
export const byFit = (rows: Row[]) =>
  ratesBy(rows, ['1', '2', '3', '4', '5'], (r) => (r.app.fit_score ? String(r.app.fit_score) : null), (r) => r.interviewed);

export function byCv(rows: Row[], cvs: CvVersion[]) {
  return cvs.map((cv) => {
    const mine = rows.filter((r) => r.app.cv_version_id === cv.id);
    return { cv, response: rate(cv.name, mine, (r) => r.replied), interview: rate(cv.name, mine, (r) => r.interviewed) };
  });
}

export function weekly(rows: Row[], weeks = 12, now = today()) {
  const end = weekStart(now);
  const out: { week: string; total: number; ids: string[]; bySector: Record<string, string[]> }[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ week: addDays(end, -7 * i), total: 0, ids: [], bySector: {} });
  const at = new Map(out.map((w) => [w.week, w]));
  for (const r of rows) {
    if (!r.sent) continue;
    const w = at.get(weekStart(r.appliedOn!));
    if (!w) continue;
    w.total++;
    w.ids.push(r.app.id);
    (w.bySector[r.app.sector] ??= []).push(r.app.id);
  }
  return out;
}

/** Sent applications per day, for the activity calendar. */
export function daily(rows: Row[]) {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.sent) continue;
    const list = m.get(r.appliedOn!);
    if (list) list.push(r.app.id);
    else m.set(r.appliedOn!, [r.app.id]);
  }
  return m;
}

export const REPLY_BUCKETS = [
  { label: '0 to 3', max: 3 },
  { label: '4 to 7', max: 7 },
  { label: '8 to 14', max: 14 },
  { label: '15 to 21', max: 21 },
  { label: '22+', max: Infinity },
];
export function replyHistogram(rows: Row[]) {
  const out = REPLY_BUCKETS.map((b) => ({ label: b.label, count: 0, ids: [] as string[] }));
  for (const r of rows) {
    if (!r.sent || r.firstReplyDays == null) continue;
    const i = REPLY_BUCKETS.findIndex((b) => r.firstReplyDays! <= b.max);
    out[i].count++;
    out[i].ids.push(r.app.id);
  }
  return out;
}

export const TIMED_STAGES: Status[] = ['Applied', 'Screening', 'Interview', 'Final interview', 'Offer'];
/** Median days spent in each stage, from completed stays only (entered, then moved on). */
export function timeInStage(rows: Row[]) {
  const acc = new Map<Status, { days: number[]; ids: Set<string> }>(TIMED_STAGES.map((s) => [s, { days: [], ids: new Set() }]));
  for (const r of rows) {
    for (let i = 0; i < r.events.length - 1; i++) {
      const slot = acc.get(r.events[i].to_status);
      if (!slot) continue;
      const ms = new Date(r.events[i + 1].changed_at).getTime() - new Date(r.events[i].changed_at).getTime();
      slot.days.push(Math.max(0, ms / 86400000));
      slot.ids.add(r.app.id);
    }
  }
  return TIMED_STAGES.map((stage) => {
    const s = acc.get(stage)!;
    const m = median(s.days);
    return { stage, median: m == null ? null : Math.round(m * 10) / 10, n: s.days.length, ids: [...s.ids] };
  });
}

export function statusMix(rows: Row[]) {
  return STATUSES.map((status) => {
    const ids = rows.filter((r) => r.app.status === status).map((r) => r.app.id);
    return { status, count: ids.length, ids };
  }).filter((s) => s.count > 0);
}

/** Label for the furthest stage reached, used to colour the pay dot plot. */
export function furthestLabel(r: Row): Status {
  return PIPELINE[r.furthest];
}

// ---------- Action lists ----------

export function dueToday(rows: Row[], now = today()) {
  const out: { row: Row; reason: string; date: string }[] = [];
  for (const r of rows) {
    const a = r.app;
    if (isClosed(a.status) || a.status === 'Accepted') continue;
    if (a.next_action_date && a.next_action_date <= now) {
      out.push({ row: r, reason: a.next_action || 'Next action', date: a.next_action_date });
    } else if (a.status === 'Saved' && a.closing_date && a.closing_date >= now && daysBetween(now, a.closing_date) <= 3) {
      const d = daysBetween(now, a.closing_date);
      out.push({ row: r, reason: d === 0 ? 'Closes today' : `Closes in ${d} day${d === 1 ? '' : 's'}`, date: a.closing_date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const QUIET_DAYS = 14;
/** In Applied with no event for 14+ days. `stale` marks those past the No response setting. */
export function goingQuiet(rows: Row[], noResponseDays: number) {
  return rows
    .filter((r) => r.app.status === 'Applied' && r.daysInStage >= QUIET_DAYS)
    .map((r) => ({ row: r, days: r.daysInStage, stale: r.daysInStage >= noResponseDays }))
    .sort((a, b) => b.days - a.days);
}

// ---------- CV feedback loop ----------

/** Pairs of CV versions that were only ever sent to different sectors, so cannot be compared fairly. */
export function unfairPairs(rows: Row[], cvs: CvVersion[]) {
  const sectors = new Map<string, Set<Sector>>();
  for (const r of rows) {
    if (!r.sent || !r.app.cv_version_id) continue;
    const s = sectors.get(r.app.cv_version_id) ?? new Set<Sector>();
    s.add(r.app.sector);
    sectors.set(r.app.cv_version_id, s);
  }
  const used = cvs.filter((c) => sectors.has(c.id));
  const out: { a: CvVersion; b: CvVersion; aSectors: Sector[]; bSectors: Sector[] }[] = [];
  for (let i = 0; i < used.length; i++)
    for (let j = i + 1; j < used.length; j++) {
      const sa = sectors.get(used[i].id)!;
      const sb = sectors.get(used[j].id)!;
      if (![...sa].some((x) => sb.has(x))) out.push({ a: used[i], b: used[j], aSectors: [...sa], bSectors: [...sb] });
    }
  return out;
}

/**
 * When two or more active versions have been sent in this sector, suggest the one
 * sent least recently there, so the versions alternate and the comparison stays fair.
 */
export function suggestCv(rows: Row[], cvs: CvVersion[], sector: Sector): { suggest: CvVersion; last: CvVersion } | null {
  const active = new Set(cvs.filter((c) => c.active).map((c) => c.id));
  const lastSent = new Map<string, string>();
  for (const r of rows) {
    const id = r.app.cv_version_id;
    if (!r.sent || !id || !active.has(id) || r.app.sector !== sector) continue;
    const key = `${r.appliedOn} ${r.app.created_at}`;
    if (!lastSent.has(id) || lastSent.get(id)! < key) lastSent.set(id, key);
  }
  if (lastSent.size < 2) return null;
  const order = [...lastSent.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const byId = new Map(cvs.map((c) => [c.id, c]));
  return { suggest: byId.get(order[0][0])!, last: byId.get(order[order.length - 1][0])! };
}
