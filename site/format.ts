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
export function dateInfo(
  localDate: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = new Date(`${localDate.slice(0, 10)}T12:00:00Z`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  });
}
export function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
/* A check date as "Nov 8", with the year when it is not this year. */
export function shortDate(isoDate: string | null | undefined) {
  if (!isoDate) return 'date unknown';
  const thisYear = RunData.localMinute(new Date()).slice(0, 4);
  return dateInfo(isoDate, {
    weekday: undefined,
    year: isoDate.startsWith(thisYear) ? undefined : 'numeric',
  });
}
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
