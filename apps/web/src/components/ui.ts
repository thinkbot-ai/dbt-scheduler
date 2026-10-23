export const tableClass = 'min-w-full text-left text-sm';
export const thClass =
  'border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400';
export const tdClass =
  'border-b border-slate-100 px-3 py-2 text-slate-800 dark:border-slate-800 dark:text-slate-200';
export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
export const buttonClass =
  'rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';
export const secondaryButtonClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
export const checkboxClass =
  'h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800';

// State-changing action buttons (enable/disable-style toggles): colored so the
// action's effect is visible at a glance, not just its label.
export const enableButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20';
export const disableButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20';

// Card/panel chrome and text tokens shared across pages, kept small and
// composable (extra layout classes are appended by callers via template
// literals, same convention as inputClass/buttonClass above).
export const cardClass =
  'rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';
export const panelClass =
  'overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
export const labelClass = 'text-sm font-medium text-slate-700 dark:text-slate-300';
export const headingClass = 'text-sm font-semibold text-slate-900 dark:text-slate-100';
export const mutedTextClass = 'text-sm text-slate-600 dark:text-slate-400';
export const subtleTextClass = 'text-xs text-slate-500 dark:text-slate-500';
export const eyebrowClass =
  'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-500';
export const valueTextClass = 'text-slate-900 dark:text-slate-100';
export const linkClass = 'text-blue-700 underline-offset-2 hover:underline dark:text-blue-400';
