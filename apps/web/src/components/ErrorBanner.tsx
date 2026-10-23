import { ApiError } from '../lib/api.ts';

export function ErrorBanner({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong';
  const offline = !(error instanceof ApiError) && /fetch|network/i.test(message);
  const unauthorized = error instanceof ApiError && error.statusCode === 401;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
      {message}
      {unauthorized ? ' Add an API token on the Settings page.' : null}
      {offline ? ' Start the API (`npm run dev:api`) or Docker Compose.' : null}
    </div>
  );
}
