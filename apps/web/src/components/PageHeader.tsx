import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  summary: string;
  actions?: ReactNode;
}

export function PageHeader({ title, summary, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">{summary}</p>
      </div>
      {actions}
    </div>
  );
}
