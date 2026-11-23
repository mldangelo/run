/* The page's filter controls and a typed lookup for elements in index.html. */

/* Default value of every filter control. Non-default values go in the URL. */
export const DEFAULTS = {
  search: '',
  period: 'upcoming',
  month: 'all',
  day: 'all',
  time: 'all',
  status: 'published',
  area: 'all',
  distance: 'all',
  format: 'all',
  registration: 'all',
  run_area: 'all',
  neighborhood: 'all',
  run_distance: 'all',
  beginner: 'all',
};
export type Control = keyof typeof DEFAULTS;
type SelectedElement<S extends string> = S extends '#detail'
  ? HTMLDialogElement
  : S extends '#advanced-filters'
    ? HTMLDetailsElement
    : S extends '#search' | '#calendar-date'
      ? HTMLInputElement
      : S extends `#${Exclude<Control, 'search'>}`
        ? HTMLSelectElement
        : S extends `${string} option${string}`
          ? HTMLOptionElement
          : HTMLElement;
export const $ = <S extends string>(selector: S) =>
  document.querySelector(selector) as SelectedElement<S>;
