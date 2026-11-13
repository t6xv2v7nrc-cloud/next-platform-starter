import { describe, expect, it } from 'vitest';
import { applyFilters, buildRows, byCv, dueToday, funnel, goingQuiet, kpis, NO_FILTERS, rate, replyHistogram, suggestCv, timeInStage, unfairPairs } from './analytics';
import { DEFAULT_SETTINGS, type Application, type CvVersion, type Data, type Sector, type Status, type StatusEvent } from './types';
import { fmtDate, fmtPay, payAnnual, weekStart } from './format';
import { buildMarkdown, toCsv } from './export';

const NOW = '2026-11-30';
const cv = (id: string, active = true): CvVersion => ({ id, name: id, file_path: null, file_name: null, created_on: '2026-11-01', focus: null, change_summary: `${id} summary`, active, created_at: '2026-11-01T09:00:00Z' });

let seq = 0;
/** Build an application from its status path: [status, date][] */
function make(path: [Status, string][], extra: Partial<Application> = {}): { app: Application; events: StatusEvent[] } {
  const id = `a${++seq}`;
  const last = path[path.length - 1][0];
  const applied = path.find(([s]) => s === 'Applied');
  const app = {
    id, company: `Co ${id}`, role_title: 'Role', job_url: null, source: 'Indeed', sector: 'Legal', location: null, work_mode: null, contract_type: null,
    pay_min: null, pay_max: null, pay_unit: null, date_found: path[0][1], date_applied: applied?.[1] ?? null, closing_date: null, cv_version_id: applied ? 'A' : null,
    cover_letter: false, status: last, fit_score: null, conflict_risk: null, next_action: null, next_action_date: null, contact_name: null, contact_email: null,
    rejection_reason: null, notes: null, created_at: `${path[0][1]}T09:00:00Z`, updated_at: `${path[0][1]}T09:00:00Z`, ...extra,
  } as Application;
  const events = path.map(([to, d], i) => ({ id: `${id}e${i}`, application_id: id, from_status: i ? path[i - 1][0] : null, to_status: to, changed_at: `${d}T12:00:00Z`, note: null }));
  return { app, events };
}
function dataOf(items: { app: Application; events: StatusEvent[] }[], cvs = [cv('A'), cv('B')]): Data {
  return { applications: items.map((i) => i.app), events: items.flatMap((i) => i.events), cvs, interviews: [], settings: { ...DEFAULT_SETTINGS } };
}

describe('definitions', () => {
  const items = [
    make([['Saved', '2026-11-01']]),
    make([['Saved', '2026-11-01'], ['Applied', '2026-11-02']]),
    make([['Saved', '2026-11-01'], ['Applied', '2026-11-02'], ['Rejected', '2026-11-06']]),
    make([['Saved', '2026-11-01'], ['Applied', '2026-11-02'], ['Screening', '2026-11-04'], ['Interview', '2026-11-10'], ['Rejected', '2026-11-12']]),
    make([['Saved', '2026-11-01'], ['Applied', '2026-11-02'], ['Interview', '2026-11-20'], ['Offer', '2026-11-28']]),
    make([['Saved', '2026-11-01'], ['Applied', '2026-11-02'], ['No response', '2026-11-25']]),
    make([['Saved', '2026-11-01'], ['Withdrawn', '2026-11-03']]),
  ];
  const rows = buildRows(dataOf(items), NOW);

  it('counts sent as anything that reached Applied or later', () => {
    expect(rows.map((r) => r.sent)).toEqual([false, true, true, true, true, true, false]);
  });
  it('counts a rejection as a response, but not silence', () => {
    expect(rows.map((r) => r.replied)).toEqual([false, false, true, true, true, false, false]);
    const k = kpis(rows, rows, NOW);
    expect([k.response.num, k.response.n]).toEqual([3, 5]);
    expect([k.interview.num, k.interview.n]).toEqual([2, 5]);
    expect([k.offer.num, k.offer.n]).toEqual([1, 5]);
  });
  it('keeps the interview once reached, even after a rejection', () => {
    expect(rows[3].interviewed).toBe(true);
  });
  it('measures days to first reply from the applied date', () => {
    expect(rows.map((r) => r.firstReplyDays)).toEqual([null, null, 4, 2, 18, null, null]);
    expect(kpis(rows, rows, NOW).medianReply).toBe(4);
    expect(replyHistogram(rows).map((b) => b.count)).toEqual([1, 1, 0, 1, 0]);
  });
  it('builds the funnel from the furthest stage, counting skipped stages', () => {
    expect(funnel(rows).map((s) => s.count)).toEqual([5, 2, 2, 1, 1]);
    expect(funnel(rows)[1].carried).toBeCloseTo(0.4);
  });
  it('takes time in stage from completed stays', () => {
    const t = Object.fromEntries(timeInStage(rows).map((s) => [s.stage, [s.median, s.n]]));
    expect(t.Applied).toEqual([11, 4]); // 4, 2, 18, 23 days
    expect(t.Screening).toEqual([6, 1]);
    expect(t.Interview).toEqual([5, 2]); // 2 and 8
  });
  it('marks a rate with n under 5 as too few to tell', () => {
    expect(rate('x', rows.slice(0, 5), (r) => r.replied).tooFew).toBe(true);
    expect(rate('x', rows, (r) => r.replied).tooFew).toBe(false);
  });
  it('filters by date range on the applied date', () => {
    expect(applyFilters(rows, { ...NO_FILTERS, from: '2026-11-02', to: '2026-11-02' }).length).toBe(5);
    expect(applyFilters(rows, { ...NO_FILTERS, sector: 'Operations' }).length).toBe(0);
  });
  it('exports Markdown with rates by CV version, sector and source', () => {
    const md = buildMarkdown(dataOf(items), rows, rows, NO_FILTERS);
    for (const h of ['## Funnel', '## Rates by CV version', '## Rates by sector', '## Rates by source', '## Rejection reasons', '## Interview questions asked', 'A summary'])
      expect(md).toContain(h);
    expect(md).toContain('| A | 5 | 60% (3 of 5, n=5) | 40% (2 of 5, n=5) |');
    expect(md).not.toContain('—');
  });
});

describe('action lists', () => {
  it('flags Applied with no event for 14 days, and stale at the setting', () => {
    const rows = buildRows(dataOf([
      make([['Applied', '2026-11-20']]),
      make([['Applied', '2026-11-14']]),
      make([['Applied', '2026-11-05']]),
    ]), NOW);
    expect(goingQuiet(rows, 21).map((q) => [q.days, q.stale])).toEqual([[25, true], [16, false]]);
  });
  it('lists next actions due and closing dates within 3 days', () => {
    const rows = buildRows(dataOf([
      make([['Saved', '2026-11-20']], { closing_date: '2026-12-02' }),
      make([['Saved', '2026-11-20']], { closing_date: '2026-12-10' }),
      make([['Applied', '2026-11-20']], { next_action: 'Chase', next_action_date: '2026-11-29' }),
      make([['Applied', '2026-11-20'], ['Rejected', '2026-11-22']], { next_action_date: '2026-11-29' }),
    ]), NOW);
    expect(dueToday(rows, NOW).map((d) => d.reason)).toEqual(['Chase', 'Closes in 2 days']);
  });
});

describe('CV feedback loop', () => {
  const sent = (cvId: string, sector: Sector, d: string) => make([['Applied', d]], { cv_version_id: cvId, sector });
  it('warns when two versions only went to different sectors', () => {
    const d = dataOf([sent('A', 'Legal', '2026-11-02'), sent('B', 'Operations', '2026-11-03')]);
    expect(unfairPairs(buildRows(d, NOW), d.cvs).length).toBe(1);
    const fair = dataOf([sent('A', 'Legal', '2026-11-02'), sent('B', 'Legal', '2026-11-03')]);
    expect(unfairPairs(buildRows(fair, NOW), fair.cvs).length).toBe(0);
  });
  it('suggests alternating when two active versions share a sector', () => {
    const d = dataOf([sent('A', 'Legal', '2026-11-02'), sent('B', 'Legal', '2026-11-03')]);
    const rows = buildRows(d, NOW);
    expect(suggestCv(rows, d.cvs, 'Legal')?.suggest.id).toBe('A');
    expect(suggestCv(rows, d.cvs, 'Operations')).toBeNull();
    expect(suggestCv(rows, [cv('A'), cv('B', false)], 'Legal')).toBeNull();
  });
  it('splits rates by version', () => {
    const d = dataOf([sent('A', 'Legal', '2026-11-02'), sent('B', 'Legal', '2026-11-03')]);
    expect(byCv(buildRows(d, NOW), d.cvs).map((c) => c.response.n)).toEqual([1, 1]);
  });
});

describe('UK formats', () => {
  it('formats dates and pay', () => {
    expect(fmtDate('2026-11-13')).toBe('13/11/2026');
    expect(weekStart('2026-11-13')).toBe('2026-11-09');
    expect(fmtPay({ pay_min: 32000, pay_max: 36000, pay_unit: 'year' })).toBe('£32,000 to £36,000');
    expect(fmtPay({ pay_min: 22.24, pay_max: 36.45, pay_unit: 'hour' })).toBe('£22.24 to £36.45 an hour');
    expect(fmtPay({ pay_min: null, pay_max: null, pay_unit: null })).toBe('Not stated');
  });
  it('annualises day and hourly rates with the Settings multipliers', () => {
    expect(payAnnual({ pay_min: 20, pay_max: 30, pay_unit: 'hour' }, DEFAULT_SETTINGS)).toBe(48750);
    expect(payAnnual({ pay_min: 200, pay_max: 200, pay_unit: 'day' }, DEFAULT_SETTINGS)).toBe(44000);
    expect(payAnnual({ pay_min: 200, pay_max: 200, pay_unit: 'day' }, { day_multiplier: 100, hour_multiplier: 1 })).toBe(20000);
  });
  it('escapes CSV cells', () => {
    expect(toCsv([{ a: 'x, "y"', b: '=SUM(1)', c: -5 }])).toBe('a,b,c\r\n"x, ""y""",\'=SUM(1),-5\r\n');
  });
});
