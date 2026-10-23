import { useState } from 'react';
import type { FormEvent } from 'react';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  buttonClass,
  cardClass,
  eyebrowClass,
  inputClass,
  labelClass,
  mutedTextClass,
  secondaryButtonClass,
  valueTextClass,
} from '../components/ui.ts';
import { getApiToken, setApiToken } from '../lib/api.ts';
import { useHealth, useSystemStatus } from '../lib/queries.ts';

export function SettingsPage() {
  const health = useHealth();
  const status = useSystemStatus();
  const [token, setToken] = useState(getApiToken() ?? '');
  const [saved, setSaved] = useState(false);

  function onSave(event: FormEvent): void {
    event.preventDefault();
    setApiToken(token.trim().length === 0 ? undefined : token.trim());
    setSaved(true);
  }

  function onClear(): void {
    setToken('');
    setApiToken(undefined);
    setSaved(true);
  }

  return (
    <section>
      <PageHeader
        title="Settings"
        summary="Local API bearer token for this browser. GitHub tokens and other secrets are never displayed."
      />
      {health.error ? (
        <div className="mb-4">
          <ErrorBanner error={health.error} />
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className={cardClass}>
          <p className={eyebrowClass}>API health</p>
          <p className={`mt-1 text-lg font-semibold ${valueTextClass}`}>
            {health.data?.status === 'ok' ? 'ok' : health.isLoading ? '…' : 'unreachable'}
          </p>
          <p className={`mt-1 ${mutedTextClass}`}>{health.data?.service ?? 'dbt-scheduler'}</p>
        </div>
        <div className={cardClass}>
          <p className={eyebrowClass}>Max concurrent jobs</p>
          <p className={`mt-1 text-lg font-semibold ${valueTextClass}`}>
            {status.data?.maxConcurrentJobs ?? '—'}
          </p>
          <p className={`mt-1 ${mutedTextClass}`}>
            Global cap from GET /api/system/status. Per-project caps are on the Projects page.
            CRITICAL work jumps the queue; it does not cancel a running job.
          </p>
        </div>
      </div>

      <form onSubmit={onSave} className={`max-w-xl space-y-3 ${cardClass}`}>
        <label className={`block ${labelClass}`}>
          API token
          <input
            className={`${inputClass} mt-1`}
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => {
              setSaved(false);
              setToken(e.target.value);
            }}
            placeholder="Leave empty when API_AUTH_TOKEN is unset"
          />
        </label>
        <p className={mutedTextClass}>
          Stored only in this browser as <code>dbt-scheduler.api-token</code>. It is sent as{' '}
          <code>Authorization: Bearer</code> on API calls except health.
        </p>
        <div className="flex gap-2">
          <button className={buttonClass} type="submit">
            Save token
          </button>
          <button className={secondaryButtonClass} type="button" onClick={onClear}>
            Clear token
          </button>
        </div>
        {saved ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Saved. Refresh data on other pages if you were unauthorized.
          </p>
        ) : null}
      </form>
    </section>
  );
}
