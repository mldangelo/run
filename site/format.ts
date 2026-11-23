/* Text and markup helpers shared by rows, dialogs and the page. DOM-free. */
import type { Area } from '../scripts/types.mts';
import * as RunData from './model.js';

export const escapeHTML = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as Record<string, string>
      )[char],
  );
export const shorten = (value: string, max = 100) =>
  value && value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
/* San Francisco is primary; Marin County is featured; 'bay' is elsewhere. */
// Typed against the shared vocabulary so a new area cannot go unlabeled.
export const AREA_NAMES: Record<Area, string> = {
  sf: 'San Francisco',
  marin: 'Marin County',
  bay: 'Bay Area',
};
export const showDays = (values: string[]) =>
  values.map((day) => day.slice(0, 3).toUpperCase()).join(' / ');
export function timeLabel(time: string | null) {
  if (!time) return 'Time unknown';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
};
const noon = (localDate: string) =>
  new Date(`${localDate.slice(0, 10)}T12:00:00Z`);
export function dateInfo(
  localDate: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return noon(localDate).toLocaleDateString('en-US', {
    ...DATE_FORMAT,
    ...options,
  });
}
/* Two local dates as one range that states a shared month or year once, such
   as "Sat, Nov 28 – Sun, Nov 29, 2026". */
export function dateRange(
  start: string,
  end: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat('en-US', {
    ...DATE_FORMAT,
    ...options,
  }).formatRange(noon(start), noon(end));
}
export function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
/* Check dates as "Nov 8" or "Nov 8 – 23", with the year when either date is
   not this year. */
export function shortRange(start: string, end = start) {
  const thisYear = RunData.localMinute(new Date()).slice(0, 4);
  return dateRange(start, end, {
    weekday: undefined,
    year: [start, end].every((date) => date.startsWith(thisYear))
      ? undefined
      : 'numeric',
  });
}
export const shortDate = (isoDate: string | null | undefined) =>
  isoDate ? shortRange(isoDate) : 'date unknown';
/* The arrow is decoration; screen readers hear whether a link opens a new
   tab instead. Every new-tab link must include NEW_TAB. */
export const ARROW = '<span aria-hidden="true"> ↗</span>';
export const NEW_TAB = '<span class="sr-only"> (opens in a new tab)</span>';
export const external = (url: string, label = url, className = '') =>
  `<a${className ? ` class="${className}"` : ''} href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}${ARROW}${NEW_TAB}</a>`;
/* A detail dialog section. Its heading keeps the dialog navigable by
   headings. */
export function detailRow(label: string, contents: string) {
  return `<div class="detail-row"><h3 class="detail-key">${escapeHTML(label)}</h3>${contents}</div>`;
}
/* Evidence detail stays available without crowding what a runner needs. */
export const researchNotes = (notes: string | undefined) =>
  notes
    ? `<details class="detail-more"><summary>Research notes</summary><p>${escapeHTML(notes)}</p></details>`
    : '';
export const tableHead = (labels: string[], className = 'table-head') =>
  `<div class="${className}" aria-hidden="true">${labels.map((label) => `<span>${label}</span>`).join('')}<span></span></div>`;
