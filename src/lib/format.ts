import type { Application, Settings } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function today(): string {
  return toISODate(new Date());
}
/** Parse YYYY-MM-DD (or the date part of a timestamp, in local time) to a local midnight Date. */
export function parseDate(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** DD/MM/YYYY */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseDate(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  return `${fmtDate(s)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Whole days from a to b (b minus a), by calendar date. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}
export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
/** Monday of the week containing the date. */
export function weekStart(s: string): string {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}
/** Value for a datetime-local input, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMoney(n: number, decimals = false): string {
  return '£' + n.toLocaleString('en-GB', decimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
}
export function fmtK(n: number): string {
  return n >= 1000 ? `£${Math.round(n / 100) / 10}k` : fmtMoney(n);
}
export function fmtPay(a: Pick<Application, 'pay_min' | 'pay_max' | 'pay_unit'>): string {
  const { pay_min, pay_max } = a;
  if (pay_min == null && pay_max == null) return 'Not stated';
  const unit = a.pay_unit ?? 'year';
  const dec = unit === 'hour';
  const lo = pay_min ?? pay_max!;
  const hi = pay_max ?? pay_min!;
  const range = lo === hi ? fmtMoney(lo, dec) : `${fmtMoney(lo, dec)} to ${fmtMoney(hi, dec)}`;
  return unit === 'year' ? range : `${range} a${unit === 'hour' ? 'n' : ''} ${unit}`;
}
/** Annualised pay: midpoint of the range, day and hourly rates scaled by the Settings multipliers. */
export function payAnnual(
  a: Pick<Application, 'pay_min' | 'pay_max' | 'pay_unit'>,
  s: Pick<Settings, 'day_multiplier' | 'hour_multiplier'>,
): number | null {
  if (a.pay_min == null && a.pay_max == null) return null;
  const mid = ((a.pay_min ?? a.pay_max!) + (a.pay_max ?? a.pay_min!)) / 2;
  const mult = a.pay_unit === 'day' ? s.day_multiplier : a.pay_unit === 'hour' ? s.hour_multiplier : 1;
  return Math.round(mid * mult);
}
export function pct(num: number, den: number): string {
  return den === 0 ? '0%' : `${Math.round((num / den) * 100)}%`;
}
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
