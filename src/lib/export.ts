import type { CvVersion, Data } from './types';
import { byCv, bySector, bySource, funnel, kpis, type Filters, type Rate, type Row } from './analytics';
import { fmtDate, today } from './format';

function rateLine(r: Rate): string {
  if (r.n === 0) return 'no applications sent';
  const base = `${Math.round(r.rate! * 100)}% (${r.num} of ${r.n}, n=${r.n})`;
  return r.tooFew ? `${base}, too few to tell` : base;
}

export function buildMarkdown(data: Data, rows: Row[], unfilteredRows: Row[], f: Filters): string {
  const cvName = (id: string) => data.cvs.find((c) => c.id === id)?.name ?? 'Unknown';
  const k = kpis(rows, unfilteredRows);
  const L: string[] = [];
  L.push('# Job application tracker export', '');
  L.push(`Exported ${fmtDate(today())}.`, '');
  L.push('## Date range and filters', '');
  L.push(`- Date range: ${f.from ? fmtDate(f.from) : 'start'} to ${f.to ? fmtDate(f.to) : 'today'}`);
  L.push(`- Sector: ${f.sector || 'All'}`);
  L.push(`- Source: ${f.source || 'All'}`);
  L.push(`- CV version: ${f.cv ? cvName(f.cv) : 'All'}`, '');
  L.push('Definitions: sent = reached Applied or later. Response rate = sent applications that got any reply, a rejection included, divided by sent. Interview rate = reached Interview or later, divided by sent. Rates with n under 5 are too few to tell.', '');

  L.push('## Headline', '');
  L.push(`- Total sent: ${k.sent.length}`);
  L.push(`- Response rate: ${rateLine(k.response)}`);
  L.push(`- Interview rate: ${rateLine(k.interview)}`);
  L.push(`- Offer rate: ${rateLine(k.offer)}`);
  L.push(`- Median days to first reply: ${k.medianReply == null ? 'no replies yet' : `${k.medianReply} (n=${k.replyIds.length})`}`, '');

  L.push('## Funnel', '', '| Stage | Reached | Carried from previous stage |', '| --- | --- | --- |');
  for (const s of funnel(rows)) L.push(`| ${s.stage} | ${s.count} | ${s.carried == null ? '' : Math.round(s.carried * 100) + '%'} |`);
  L.push('');

  const table = (title: string, first: string, items: { label: string; response?: Rate; interview: Rate }[]) => {
    L.push(`## ${title}`, '', `| ${first} | n (sent) | Response rate | Interview rate |`, '| --- | --- | --- | --- |');
    for (const it of items) L.push(`| ${it.label} | ${it.interview.n} | ${it.response ? rateLine(it.response) : ''} | ${rateLine(it.interview)} |`);
    L.push('');
  };
  const withResponse = (group: Rate[], keyOf: (r: Row) => string) =>
    group.map((g) => {
      const mine = rows.filter((r) => r.sent && keyOf(r) === g.label);
      const hits = mine.filter((r) => r.replied);
      const response: Rate = { ...g, num: hits.length, rate: mine.length ? hits.length / mine.length : null, hitIds: hits.map((r) => r.app.id) };
      return { label: g.label, response, interview: g };
    });
  table('Rates by CV version', 'CV version', byCv(rows, data.cvs).map((c) => ({ label: c.cv.name, response: c.response, interview: c.interview })));
  table('Rates by sector', 'Sector', withResponse(bySector(rows), (r) => r.app.sector));
  table('Rates by source', 'Source', withResponse(bySource(rows), (r) => r.app.source));

  L.push('## Rejection reasons', '');
  const rejections = rows.filter((r) => r.app.rejection_reason?.trim());
  if (!rejections.length) L.push('None recorded.');
  for (const r of rejections) L.push(`- ${r.app.company}, ${r.app.role_title} (${r.app.sector}, ${r.app.cv_version_id ? cvName(r.app.cv_version_id) : 'no CV'}): ${r.app.rejection_reason!.trim()}`);
  L.push('');

  L.push('## Interview questions asked', '');
  const ids = new Set(rows.map((r) => r.app.id));
  const ivs = data.interviews.filter((i) => ids.has(i.application_id) && i.questions_asked?.trim());
  if (!ivs.length) L.push('None recorded.');
  for (const i of ivs) {
    const a = data.applications.find((x) => x.id === i.application_id)!;
    L.push(`### ${a.company}, ${a.role_title} (${i.type}, ${fmtDate(i.date_time)}${i.how_it_went ? `, went ${i.how_it_went}/5` : ''})`, '', i.questions_asked!.trim(), '');
  }
  L.push('');

  L.push('## CV versions', '');
  for (const c of data.cvs) L.push(...cvBlock(c));
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function cvBlock(c: CvVersion): string[] {
  return [
    `### ${c.name}${c.active ? '' : ' (retired)'}`,
    '',
    `- Created: ${fmtDate(c.created_on)}`,
    `- Focus: ${c.focus || 'not recorded'}`,
    `- What changed: ${c.change_summary || 'not recorded'}`,
    '',
  ];
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const cell = (v: unknown) => {
    if (v == null) return '';
    let s = String(v);
    // Stop spreadsheet apps treating a cell as a formula.
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
