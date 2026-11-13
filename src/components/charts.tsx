import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MIN_N, furthestLabel, type Rate, type Row } from '../lib/analytics';
import { PIPELINE, SECTORS, type CvVersion, type Status } from '../lib/types';
import { addDays, fmtDate, fmtK, fmtMoney, parseDate, pct, plural, today, weekStart } from '../lib/format';

export type Pick = (label: string, ids: string[]) => void;

export function ChartCard({ title, question, empty, action, children, wide }: {
  title: string;
  question: string;
  /** When set, shown instead of the chart: what it needs before it can draw. */
  empty?: string | false;
  action?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`card min-w-0 p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted">{question}</p>
        </div>
        {action}
      </div>
      {empty ? <p className="rounded-lg bg-raised px-3 py-6 text-center text-sm text-muted">{empty}</p> : children}
    </section>
  );
}

const SECTOR_COLOURS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
const axis = { fontSize: 11, fill: 'var(--muted)' };
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' };

/** One horizontal bar per rate. Every bar prints its n; under 5 it turns grey and says so. */
function RateRow({ r, label, onPick, drillLabel }: { r: Rate; label: string; onPick: Pick; drillLabel: string }) {
  const none = r.n === 0;
  const text = none ? 'none sent' : r.tooFew ? 'too few to tell' : `${pct(r.num, r.n)} (${r.num} of ${r.n})`;
  return (
    <button
      type="button"
      disabled={none}
      onClick={() => onPick(drillLabel, r.ids)}
      title={none ? undefined : `${r.num} of ${r.n} sent. Open these ${r.n} in the table.`}
      className="group grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded py-1 text-left disabled:cursor-default sm:grid-cols-[minmax(0,11rem)_1fr_auto]"
    >
      <span className="truncate text-xs text-ink">{label}</span>
      <span className={`text-right text-xs sm:order-3 sm:w-[8.5rem] ${r.tooFew ? 'text-muted' : 'text-ink'}`}>
        {text} <span className="text-muted">n={r.n}</span>
      </span>
      <span className="col-span-2 h-3 min-w-0 sm:order-2 sm:col-span-1 sm:h-4">
        <span
          className={`block h-full rounded-r ${r.tooFew ? 'bg-data-faint' : 'bg-accent group-hover:bg-accent-ink'}`}
          style={{ width: none ? 0 : `${Math.max(1.5, (r.rate ?? 0) * 100)}%` }}
        />
      </span>
    </button>
  );
}

export function RateBars({ items, onPick, what }: { items: Rate[]; onPick: Pick; what: string }) {
  return (
    <div>
      {items.map((r) => (
        <RateRow key={r.label} r={r} label={r.label} onPick={onPick} drillLabel={`${what}: ${r.label}`} />
      ))}
    </div>
  );
}

export function CvRates({ items, onPick }: { items: { cv: CvVersion; response: Rate; interview: Rate }[]; onPick: Pick }) {
  return (
    <div className="space-y-3">
      {items.map(({ cv, response, interview }) => (
        <div key={cv.id}>
          <div className="mb-0.5 text-xs font-semibold">
            {cv.name} <span className="font-normal text-muted">n={response.n}{cv.active ? '' : ', retired'}</span>
          </div>
          <RateRow r={response} label="Response rate" onPick={onPick} drillLabel={`Sent with ${cv.name}`} />
          <RateRow r={interview} label="Interview rate" onPick={onPick} drillLabel={`Sent with ${cv.name}`} />
        </div>
      ))}
    </div>
  );
}

export function Funnel({ stages, onPick }: { stages: { stage: Status; count: number; ids: string[]; carried: number | null }[]; onPick: Pick }) {
  const max = Math.max(1, stages[0].count);
  return (
    <div>
      {stages.map((s, i) => (
        <button
          key={s.stage}
          type="button"
          disabled={!s.count}
          onClick={() => onPick(`Reached ${s.stage}`, s.ids)}
          title={`${plural(s.count, 'application')} reached ${s.stage}`}
          className="group grid w-full cursor-pointer grid-cols-[minmax(0,6.5rem)_1fr] items-center gap-x-3 py-1 text-left disabled:cursor-default"
        >
          <span className="truncate text-xs">{s.stage}</span>
          <span className="flex items-center gap-2">
            <span className="h-6 min-w-0 flex-1">
              <span className={`block h-full rounded-r ${i === 0 ? 'bg-data' : 'bg-accent group-hover:bg-accent-ink'}`} style={{ width: s.count ? `${Math.max(1.5, (s.count / max) * 100)}%` : 0 }} />
            </span>
            <span className="w-24 shrink-0 text-right text-xs">
              <span className="font-semibold">{s.count}</span>
              {s.carried != null && <span className="text-muted"> {Math.round(s.carried * 100)}% carried</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function WeeklyChart({ weeks, target, stacked, onPick }: {
  weeks: { week: string; total: number; ids: string[]; bySector: Record<string, string[]> }[];
  target: number;
  stacked: boolean;
  onPick: Pick;
}) {
  const data = weeks.map((w) => ({
    ...w,
    name: fmtDate(w.week).slice(0, 5),
    ...Object.fromEntries(SECTORS.map((s) => [s, w.bySector[s]?.length ?? 0])),
  }));
  const used = SECTORS.filter((s) => weeks.some((w) => w.bySector[s]?.length));
  const top = Math.max(target, ...weeks.map((w) => w.total));
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -22, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 3" />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, top + 1]} />
          <Tooltip cursor={{ fill: 'var(--raised)' }} contentStyle={tooltipStyle} labelFormatter={(_l, p) => (p[0] ? `Week of ${fmtDate(p[0].payload.week)}` : '')} />
          {stacked ? (
            used.map((s, i) => (
              <Bar key={s} dataKey={s} stackId="a" fill={SECTOR_COLOURS[SECTORS.indexOf(s)]} stroke="var(--surface)" strokeWidth={1}
                radius={i === used.length - 1 ? [3, 3, 0, 0] : 0} cursor="pointer" isAnimationActive={false}
                onClick={(d) => onPick(`Sent week of ${fmtDate(d.week)}: ${s}`, d.bySector[s] ?? [])} />
            ))
          ) : (
            <Bar dataKey="total" name="Sent" fill="var(--accent)" radius={[3, 3, 0, 0]} cursor="pointer" isAnimationActive={false}
              onClick={(d) => onPick(`Sent week of ${fmtDate(d.week)}`, d.ids)} />
          )}
          {stacked && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, color: 'var(--muted)' }} />}
          {target > 0 && (
            <ReferenceLine y={target} stroke="var(--ink)" strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: `Target ${target}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--ink)' }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CountBars({ data, onPick, what, unit }: {
  data: { label: string; value: number | null; n: number; ids: string[]; text: string }[];
  onPick: Pick;
  what: string;
  unit?: string;
}) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -22, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval={0} height={unit ? 34 : 22}
            tick={({ x, y, payload, index }: { x: number; y: number; payload: { value: string }; index: number }) => (
              <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill="var(--muted)">
                {payload.value}
                {unit && <tspan x={x} dy={13}>n={data[index].n}</tspan>}
              </text>
            )} />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'var(--raised)' }} contentStyle={tooltipStyle}
            formatter={(_v, _n, p) => [p.payload.text, unit ?? 'Count']} />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} cursor="pointer" isAnimationActive={false} onClick={(d) => d.ids.length && onPick(`${what}: ${d.label}`, d.ids)}>
            {data.map((d) => <Cell key={d.label} fill={d.n < MIN_N && unit ? 'var(--data-faint)' : 'var(--accent)'} />)}
            <LabelList dataKey="text" position="top" style={{ fontSize: 10, fill: 'var(--muted)' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const HEAT = ['var(--raised)', 'var(--r1)', 'var(--r2)', 'var(--r3)', 'var(--r4)'];
export function Heatmap({ days, onPick, weeks = 26 }: { days: Map<string, string[]>; onPick: Pick; weeks?: number }) {
  const now = today();
  const start = addDays(weekStart(now), -7 * (weeks - 1));
  const max = Math.max(1, ...[...days.values()].map((v) => v.length));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const size = 13;
  const gap = 3;
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const months = cols.map((c, i) => {
    const m = parseDate(c[0]).toLocaleDateString('en-GB', { month: 'short' });
    const prev = i ? parseDate(cols[i - 1][0]).toLocaleDateString('en-GB', { month: 'short' }) : '';
    return m !== prev ? m : '';
  });
  return (
    <div className="overflow-x-auto" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}>
      <svg width={weeks * (size + gap) + 28} height={7 * (size + gap) + 18} role="img" aria-label="Applications sent per day">
        {['Mon', 'Wed', 'Fri'].map((d, i) => (
          <text key={d} x={0} y={18 + (i * 2) * (size + gap) + size - 2} fontSize="10" fill="var(--muted)">{d}</text>
        ))}
        {cols.map((col, w) => (
          <g key={w} transform={`translate(${28 + w * (size + gap)},0)`}>
            {months[w] && <text x={0} y={10} fontSize="10" fill="var(--muted)">{months[w]}</text>}
            {col.map((date, d) => {
              if (date > now) return null;
              const ids = days.get(date) ?? [];
              return (
                <rect key={date} x={0} y={16 + d * (size + gap)} width={size} height={size} rx={3} fill={HEAT[level(ids.length)]}
                  className={ids.length ? 'cursor-pointer' : ''} onClick={() => ids.length && onPick(`Sent on ${fmtDate(date)}`, ids)}>
                  <title>{`${fmtDate(date)}: ${ids.length} sent`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
        Fewer {HEAT.map((c) => <span key={c} className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />)} More
      </div>
    </div>
  );
}

const STAGE_COLOUR: Record<string, string> = {
  Saved: 'var(--data-faint)', Applied: 'var(--data)', Screening: 'var(--r2)', Interview: 'var(--r3)',
  'Final interview': 'var(--r4)', Offer: 'var(--good)', Accepted: 'var(--good)',
};

export function PayDots({ rows, onPick }: { rows: Row[]; onPick: Pick }) {
  const [hover, setHover] = useState<Row | null>(null);
  const W = 640, R = 6, PAD = 24;
  const pts = useMemo(() => {
    const withPay = rows.filter((r) => r.payAnnual != null).sort((a, b) => a.payAnnual! - b.payAnnual!);
    if (!withPay.length) return { dots: [], lo: 0, hi: 1, height: 60 };
    let lo = withPay[0].payAnnual!, hi = withPay[withPay.length - 1].payAnnual!;
    if (lo === hi) { lo -= 5000; hi += 5000; }
    const span = hi - lo;
    lo = Math.max(0, lo - span * 0.05); hi += span * 0.05;
    const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - PAD * 2);
    // Stack dots that would overlap, so each application keeps its own dot.
    const placed: { cx: number; level: number }[] = [];
    const dots = withPay.map((r) => {
      const cx = x(r.payAnnual!);
      let level = 0;
      while (placed.some((p) => p.level === level && Math.abs(p.cx - cx) < R * 2 + 2)) level++;
      placed.push({ cx, level });
      return { r, cx, level };
    });
    return { dots, lo, hi, height: (Math.max(...dots.map((d) => d.level)) + 1) * (R * 2 + 2) + 34 };
  }, [rows]);
  const { dots, lo, hi, height } = pts;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const base = height - 24;
  const stages = PIPELINE.filter((s) => dots.some((d) => furthestLabel(d.r) === s));
  return (
    <div>
      <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full max-w-3xl min-w-[520px]" role="img" aria-label="Annual pay of each application, coloured by furthest stage reached">
        <line x1={PAD} x2={W - PAD} y1={base} y2={base} stroke="var(--line)" />
        {ticks.map((t) => {
          const tx = PAD + ((t - lo) / (hi - lo)) * (W - PAD * 2);
          return <text key={t} x={tx} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmtK(t)}</text>;
        })}
        {dots.map(({ r, cx, level }) => (
          <circle key={r.app.id} cx={cx} cy={base - R - 3 - level * (R * 2 + 2)} r={hover === r ? R + 1.5 : R}
            fill={STAGE_COLOUR[furthestLabel(r)]} stroke="var(--surface)" strokeWidth={2} className="cursor-pointer"
            onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}
            onClick={() => onPick(`${r.app.company}, ${r.app.role_title}`, [r.app.id])}>
            <title>{`${r.app.company}, ${r.app.role_title}: ${fmtMoney(r.payAnnual!)} a year, reached ${furthestLabel(r)}`}</title>
          </circle>
        ))}
      </svg>
      </div>
      <p className="min-h-4 text-xs text-ink" aria-live="polite">
        {hover ? `${hover.app.company}, ${hover.app.role_title}: ${fmtMoney(hover.payAnnual!)} a year, reached ${furthestLabel(hover)}` : ''}
      </p>
      <Legend2 items={stages.map((s) => ({ label: s, colour: STAGE_COLOUR[s] }))} />
    </div>
  );
}

function Legend2({ items }: { items: { label: string; colour: string; count?: number }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.colour }} />
          {i.label}{i.count != null && <span className="text-ink"> {i.count}</span>}
        </span>
      ))}
    </div>
  );
}

const MIX_COLOUR: Record<string, string> = {
  ...STAGE_COLOUR, Applied: 'var(--r1)', Rejected: 'var(--bad)', Withdrawn: 'var(--data)', 'No response': 'var(--muted)',
};

export function StatusMix({ mix, onPick }: { mix: { status: Status; count: number; ids: string[] }[]; onPick: Pick }) {
  const total = mix.reduce((s, m) => s + m.count, 0);
  return (
    <div>
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded">
        {mix.map((m) => (
          <button key={m.status} type="button" onClick={() => onPick(`Status: ${m.status}`, m.ids)}
            title={`${m.status}: ${m.count} (${pct(m.count, total)})`} aria-label={`${m.status}: ${m.count}`}
            className="h-full min-w-1.5 cursor-pointer hover:opacity-80" style={{ flexGrow: m.count, flexBasis: 0, background: MIX_COLOUR[m.status] }} />
        ))}
      </div>
      <Legend2 items={mix.map((m) => ({ label: m.status, colour: MIX_COLOUR[m.status], count: m.count }))} />
    </div>
  );
}
