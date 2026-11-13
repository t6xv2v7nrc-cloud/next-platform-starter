import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import {
  applyFilters, byCv, byFit, byRisk, bySector, bySource, daily, dueToday, funnel, goingQuiet, kpis,
  NO_FILTERS, replyHistogram, statusMix, timeInStage, weekly, MIN_N, type Rate,
} from '../lib/analytics';
import { SECTORS, SOURCES } from '../lib/types';
import { fmtDate, pct, plural, today } from '../lib/format';
import { buildMarkdown, download } from '../lib/export';
import { ChartCard, CountBars, CvRates, Funnel, Heatmap, PayDots, RateBars, StatusMix, WeeklyChart } from '../components/charts';
import { Modal, PageHeader, Select } from '../components/ui';

export default function Dashboard() {
  const { data, rows, filtered, filters, setFilters, setDrill, move } = useData();
  const navigate = useNavigate();
  const [stacked, setStacked] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState('');

  const open = (label: string, ids: string[]) => {
    setDrill({ label, ids });
    navigate('/applications');
  };

  const s = useMemo(() => {
    const noDate = applyFilters(rows, { ...filters, from: '', to: '' });
    return {
      k: kpis(filtered, noDate),
      funnel: funnel(filtered),
      cv: byCv(filtered, data.cvs).filter((c) => c.response.n > 0 || c.cv.active),
      weekly: weekly(filtered),
      daily: daily(filtered),
      sector: bySector(filtered),
      source: bySource(filtered),
      fit: byFit(filtered),
      risk: byRisk(filtered),
      hist: replyHistogram(filtered),
      stage: timeInStage(filtered),
      mix: statusMix(filtered),
    };
  }, [rows, filtered, filters, data.cvs]);

  const sentN = s.k.sent.length;
  const needRates = sentN < MIN_N && `Send ${MIN_N} applications to see rates. ${sentN} so far.`;
  const due = useMemo(() => dueToday(rows), [rows]);
  const quiet = useMemo(() => goingQuiet(rows, data.settings.no_response_days), [rows, data.settings.no_response_days]);
  const target = data.settings.weekly_target;
  const filtersOn = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const fitScored = filtered.filter((r) => r.sent && r.app.fit_score).length;
  const riskScored = filtered.filter((r) => r.sent && r.app.conflict_risk).length;

  const rateTile = (r: Rate): ReactNode =>
    r.n === 0 ? <span className="text-muted">No data</span> : r.tooFew ? <span className="text-base text-muted">Too few to tell</span> : pct(r.num, r.n);

  return (
    <>
      <PageHeader title="Dashboard">
        <button className="btn btn-sm" onClick={() => setExporting(true)}>Export for Claude</button>
        <Link className="btn btn-sm btn-primary" to="/add">Quick add</Link>
      </PageHeader>

      <div className="card mb-4 grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs text-muted">From
          <input type="date" className="input mt-1" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label className="text-xs text-muted">To
          <input type="date" className="input mt-1" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <label className="text-xs text-muted">Sector
          <span className="mt-1 block"><Select value={filters.sector} onChange={(v) => setFilters({ ...filters, sector: v })} options={SECTORS} empty="All sectors" /></span>
        </label>
        <label className="text-xs text-muted">Source
          <span className="mt-1 block"><Select value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} options={SOURCES} empty="All sources" /></span>
        </label>
        <label className="text-xs text-muted">CV version
          <span className="mt-1 block"><Select value={filters.cv} onChange={(v) => setFilters({ ...filters, cv: v })} options={data.cvs.map((c) => ({ value: c.id, label: c.name }))} empty="All versions" /></span>
        </label>
        <div className="flex items-end">
          <button className="btn w-full" disabled={!filtersOn} onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Tile label="Sent this week" onClick={() => open('Sent this week', s.k.thisWeek)}
          sub={target ? (s.k.thisWeek.length >= target ? 'Target met' : `${target - s.k.thisWeek.length} to go`) : 'No target set'}>
          {s.k.thisWeek.length}<span className="text-base font-normal text-muted"> of {target}</span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-raised">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${target ? Math.min(100, (s.k.thisWeek.length / target) * 100) : 0}%` }} />
          </span>
        </Tile>
        <Tile label="Total sent" onClick={() => open('Sent', s.k.sent)}>{sentN}</Tile>
        <Tile label="Response rate" sub={`${s.k.response.num} of ${s.k.response.n}, n=${s.k.response.n}`} onClick={() => open('Got a reply', s.k.response.hitIds)}>{rateTile(s.k.response)}</Tile>
        <Tile label="Interview rate" sub={`${s.k.interview.num} of ${s.k.interview.n}, n=${s.k.interview.n}`} onClick={() => open('Reached Interview', s.k.interview.hitIds)}>{rateTile(s.k.interview)}</Tile>
        <Tile label="Offer rate" sub={`${s.k.offer.num} of ${s.k.offer.n}, n=${s.k.offer.n}`} onClick={() => open('Reached Offer', s.k.offer.hitIds)}>{rateTile(s.k.offer)}</Tile>
        <Tile label="Median days to first reply" sub={`n=${s.k.replyIds.length}`} onClick={() => open('Got a first reply', s.k.replyIds)}>
          {s.k.medianReply == null ? <span className="text-muted">No data</span> : s.k.medianReply}
        </Tile>
        <Tile label="Active in pipeline" onClick={() => open('Active in pipeline', s.k.active)}>{s.k.active.length}</Tile>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="card min-w-0 p-4">
          <h2 className="text-sm font-semibold">Due today</h2>
          <p className="mb-2 text-xs text-muted">Next actions, and closing dates within 3 days.</p>
          {due.length === 0 ? <p className="text-sm text-muted">Nothing due.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto pr-1">
              {due.map(({ row, reason, date }) => (
                <li key={row.app.id}>
                  <Link to={`/applications/${row.app.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-raised">
                    <span className="min-w-0"><span className="block truncate font-medium">{row.app.company}</span><span className="block truncate text-xs text-muted">{reason}</span></span>
                    <span className={`shrink-0 text-xs ${date < today() ? 'text-bad' : 'text-muted'}`}>{date < today() ? 'Overdue, ' : ''}{fmtDate(date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card min-w-0 p-4">
          <h2 className="text-sm font-semibold">Going quiet</h2>
          <p className="mb-2 text-xs text-muted">14 or more days in Applied with no reply.</p>
          {quiet.length === 0 ? <p className="text-sm text-muted">Nothing has gone quiet.</p> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto pr-1">
              {quiet.map(({ row, days, stale }) => (
                <li key={row.app.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link to={`/applications/${row.app.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate font-medium">{row.app.company}</span>
                    <span className="block truncate text-xs text-muted">{row.app.role_title}, {days} days</span>
                  </Link>
                  {stale && (
                    <button className="btn btn-sm shrink-0" disabled={busy === row.app.id}
                      onClick={async () => { setBusy(row.app.id); try { await move(row.app, 'No response'); } finally { setBusy(''); } }}>
                      Mark No response
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard wide title="Rates by CV version" question="Which CV gets more replies?" empty={needRates}>
          <CvRates items={s.cv} onPick={open} />
        </ChartCard>
        <ChartCard title="Funnel" question="Where do applications stall?" empty={sentN === 0 && 'Move an application to Applied to see the funnel.'}>
          <Funnel stages={s.funnel} onPick={open} />
        </ChartCard>
        <ChartCard title="Weekly activity" question="Am I sending enough, consistently?" empty={sentN === 0 && 'Send an application to see weekly activity.'}
          action={<label className="flex shrink-0 items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={stacked} onChange={(e) => setStacked(e.target.checked)} />Stack by sector</label>}>
          <WeeklyChart weeks={s.weekly} target={target} stacked={stacked} onPick={open} />
        </ChartCard>
        <ChartCard wide title="Activity calendar" question="Am I keeping a daily habit?" empty={sentN === 0 && 'Send an application to start the calendar.'}>
          <Heatmap days={s.daily} onPick={open} />
        </ChartCard>
        <ChartCard title="Interview rate by sector" question="Which kind of role responds to my profile?" empty={needRates}>
          <RateBars items={s.sector} onPick={open} what="Sent, sector" />
        </ChartCard>
        <ChartCard title="Interview rate by source" question="Is Indeed worth it compared with company sites and recruiters?" empty={needRates}>
          <RateBars items={s.source} onPick={open} what="Sent, source" />
        </ChartCard>
        <ChartCard title="Days to first reply" question="How long before I should chase or give up?" empty={s.k.replyIds.length === 0 && 'Log a first reply (a move to Screening, Interview or Rejected) to see timings.'}>
          <CountBars what="First reply, days" onPick={open} data={s.hist.map((h) => ({ label: h.label, value: h.count, n: h.count, ids: h.ids, text: String(h.count) }))} />
        </ChartCard>
        <ChartCard title="Time in stage" question="Where does the process drag? Median days, completed stays." empty={s.stage.every((x) => x.n === 0) && 'Move an application on from Applied to see how long each stage takes.'}>
          <CountBars what="Passed through" unit="Median days" onPick={open}
            data={s.stage.map((x) => ({ label: x.stage === 'Final interview' ? 'Final' : x.stage, value: x.median, n: x.n, ids: x.ids, text: x.n === 0 ? '' : x.n < MIN_N ? 'too few' : `${x.median} d` }))} />
        </ChartCard>
        <ChartCard wide title="Pay against outcome" question="Am I aiming at the right pay band? One dot per application, by annual pay." empty={!filtered.some((r) => r.payAnnual != null) && 'Add pay to an application to see it here.'}>
          <PayDots rows={filtered} onPick={open} />
        </ChartCard>
        <ChartCard title="Fit score against outcome" question="Does my gut feel predict anything? Interview rate by fit score." empty={fitScored < MIN_N && `Send ${MIN_N} applications with a fit score to see this. ${fitScored} so far.`}>
          <RateBars items={s.fit.map((r) => ({ ...r, label: `Fit ${r.label}` }))} onPick={open} what="Sent" />
        </ChartCard>
        <ChartCard title="Conflict risk against outcome" question="Is running Keel costing me interviews?" empty={riskScored < MIN_N && `Send ${MIN_N} applications with a conflict risk to see this. ${riskScored} so far.`}>
          <RateBars items={s.risk} onPick={open} what="Sent, conflict risk" />
        </ChartCard>
        <ChartCard wide title="Current status mix" question="What does the pipeline look like right now?" empty={filtered.length === 0 && 'Log an application to see the mix.'}>
          <StatusMix mix={s.mix} onPick={open} />
          <p className="mt-2 text-xs text-muted">{plural(filtered.length, 'application')}</p>
        </ChartCard>
      </div>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </>
  );
}

function Tile({ label, sub, onClick, children }: { label: string; sub?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="card cursor-pointer p-3 text-left hover:bg-raised">
      <span className="block text-xs text-muted">{label}</span>
      <span className="mt-1 block text-2xl font-semibold">{children}</span>
      {sub && <span className="mt-0.5 block text-xs text-muted">{sub}</span>}
    </button>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const { data, rows, filtered, filters } = useData();
  const md = useMemo(() => buildMarkdown(data, filtered, applyFilters(rows, { ...filters, from: '', to: '' }), filters), [data, rows, filtered, filters]);
  const [copied, setCopied] = useState('');
  return (
    <Modal title="Export for Claude" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Uses the dashboard filters. Paste it into Claude to decide the next CV edit, then log the result as a new version.</p>
      <textarea readOnly className="input h-56 font-mono text-xs" value={md} aria-label="Export preview" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={async () => {
          try { await navigator.clipboard.writeText(md); setCopied('Copied.'); } catch { setCopied('Copy failed. Select the text above and copy it by hand.'); }
        }}>Copy to clipboard</button>
        <button className="btn" onClick={() => download(`job-tracker-export-${today()}.md`, md, 'text/markdown')}>Download .md</button>
        <span className="self-center text-sm text-muted" role="status">{copied}</span>
      </div>
    </Modal>
  );
}
