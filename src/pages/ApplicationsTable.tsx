import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { rowDate, type Row } from '../lib/analytics';
import { SECTORS, SOURCES, STATUSES, type Sector, type Source, type Status } from '../lib/types';
import { fmtDate, fmtPay, plural, today } from '../lib/format';
import { download, toCsv } from '../lib/export';
import { CvBadge, PageHeader, RiskBadge, Select, StatusBadge } from '../components/ui';

type SortKey = 'company' | 'role' | 'status' | 'sector' | 'date' | 'pay' | 'days';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'date', label: 'Date' }, { value: 'company', label: 'Company' }, { value: 'role', label: 'Role' }, { value: 'status', label: 'Status' },
  { value: 'sector', label: 'Sector' }, { value: 'pay', label: 'Annual pay' }, { value: 'days', label: 'Days in stage' },
];

export default function ApplicationsTable() {
  const { rows, data, drill, setDrill, cvName } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [sector, setSector] = useState<Sector | ''>('');
  const [source, setSource] = useState<Source | ''>('');
  const [cv, setCv] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [desc, setDesc] = useState(true);

  const shown = useMemo(() => {
    const ids = drill ? new Set(drill.ids) : null;
    const needle = q.trim().toLowerCase();
    const val = (r: Row): string | number =>
      sort === 'company' ? r.app.company.toLowerCase()
      : sort === 'role' ? r.app.role_title.toLowerCase()
      : sort === 'status' ? STATUSES.indexOf(r.app.status)
      : sort === 'sector' ? r.app.sector
      : sort === 'pay' ? r.payAnnual ?? -1
      : sort === 'days' ? r.daysInStage
      : rowDate(r);
    return rows
      .filter((r) => {
        const a = r.app;
        if (ids && !ids.has(a.id)) return false;
        if (status && a.status !== status) return false;
        if (sector && a.sector !== sector) return false;
        if (source && a.source !== source) return false;
        if (cv && a.cv_version_id !== cv) return false;
        const d = rowDate(r);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (needle && ![a.company, a.role_title, a.location, a.notes, a.contact_name, a.next_action].some((x) => x?.toLowerCase().includes(needle))) return false;
        return true;
      })
      .sort((a, b) => {
        const x = val(a), y = val(b);
        const c = x < y ? -1 : x > y ? 1 : a.app.company.localeCompare(b.app.company);
        return desc ? -c : c;
      });
  }, [rows, drill, q, status, sector, source, cv, from, to, sort, desc]);

  function exportCsv() {
    const out = shown.map((r) => ({
      company: r.app.company, role_title: r.app.role_title, status: r.app.status, sector: r.app.sector, source: r.app.source,
      location: r.app.location, work_mode: r.app.work_mode, contract_type: r.app.contract_type,
      pay_min: r.app.pay_min, pay_max: r.app.pay_max, pay_unit: r.app.pay_unit, pay_annual: r.payAnnual,
      date_found: fmtDate(r.app.date_found), date_applied: fmtDate(r.appliedOn), closing_date: fmtDate(r.app.closing_date),
      cv_version: cvName(r.app.cv_version_id), cover_letter: r.app.cover_letter ? 'Yes' : 'No', fit_score: r.app.fit_score, conflict_risk: r.app.conflict_risk,
      days_in_stage: r.daysInStage, next_action: r.app.next_action, next_action_date: fmtDate(r.app.next_action_date),
      rejection_reason: r.app.rejection_reason, job_url: r.app.job_url,
    }));
    download(`applications-${today()}.csv`, toCsv(out), 'text/csv');
  }

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`px-3 py-2 text-left font-medium ${cls}`} aria-sort={sort === key ? (desc ? 'descending' : 'ascending') : undefined}>
      <button className="cursor-pointer hover:text-ink" onClick={() => (sort === key ? setDesc(!desc) : (setSort(key), setDesc(false)))}>
        {label}{sort === key ? (desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <>
      <PageHeader title="Applications">
        <button className="btn btn-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
        <Link className="btn btn-sm btn-primary" to="/add">Quick add</Link>
      </PageHeader>

      {drill && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
          <span>From the dashboard: <strong>{drill.label}</strong> ({plural(drill.ids.length, 'application')})</span>
          <button className="btn btn-sm ml-auto" onClick={() => setDrill(null)}>Show all</button>
        </div>
      )}

      <div className="card mb-3 grid grid-cols-2 gap-2 p-3 md:grid-cols-4 xl:grid-cols-8">
        <input className="input col-span-2" type="search" placeholder="Search company, role, notes" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={setStatus} options={STATUSES} empty="All statuses" />
        <Select value={sector} onChange={setSector} options={SECTORS} empty="All sectors" />
        <Select value={source} onChange={setSource} options={SOURCES} empty="All sources" />
        <Select value={cv} onChange={setCv} options={data.cvs.map((c) => ({ value: c.id, label: c.name }))} empty="All CV versions" />
        <label className="text-xs text-muted">From<input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted">To<input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="col-span-2 flex gap-2 md:hidden">
          <Select<SortKey> value={sort} onChange={(v) => v && setSort(v)} options={SORTS.map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))} />
          <button className="btn shrink-0" onClick={() => setDesc(!desc)} aria-label="Reverse sort order">{desc ? '↓' : '↑'}</button>
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">{plural(shown.length, 'application')}</p>

      {shown.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">No applications match.</p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => (
              <li key={r.app.id}>
                <Link to={`/applications/${r.app.id}`} className="card block p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.app.company}</span><span className="block truncate text-xs text-muted">{r.app.role_title}</span></span>
                    <StatusBadge status={r.app.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
                    <span>{fmtDate(rowDate(r))}</span><span>·</span><span>{fmtPay(r.app)}</span>
                    <CvBadge id={r.app.cv_version_id} /><RiskBadge risk={r.app.conflict_risk} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  {th('company', 'Company')}{th('role', 'Role')}{th('status', 'Status')}{th('sector', 'Sector')}
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  {th('pay', 'Pay')}<th className="px-3 py-2 text-left font-medium">CV</th>
                  {th('date', 'Date')}{th('days', 'Days in stage')}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.app.id} className="cursor-pointer hover:bg-raised" onClick={() => navigate(`/applications/${r.app.id}`)}>
                    <td className="px-3 py-2 font-medium"><Link to={`/applications/${r.app.id}`} onClick={(e) => e.stopPropagation()}>{r.app.company}</Link></td>
                    <td className="px-3 py-2">{r.app.role_title}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.app.status} /></td>
                    <td className="px-3 py-2">{r.app.sector}</td>
                    <td className="px-3 py-2">{r.app.source}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtPay(r.app)}</td>
                    <td className="px-3 py-2"><CvBadge id={r.app.cv_version_id} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(rowDate(r))}</td>
                    <td className="px-3 py-2">{r.daysInStage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
