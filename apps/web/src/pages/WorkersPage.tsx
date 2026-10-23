import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.tsx';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { linkClass, panelClass, tableClass, tdClass, thClass } from '../components/ui.ts';
import { formatAgo, formatDateTime, isWorkerOnline } from '../lib/format.ts';
import { useWorkers } from '../lib/queries.ts';

export function WorkersPage() {
  const workers = useWorkers();

  return (
    <section>
      <PageHeader
        title="Workers"
        summary="Registered workers, heartbeats, and current jobs. Online means a heartbeat within 90 seconds."
      />
      {workers.error ? (
        <div className="mb-4">
          <ErrorBanner error={workers.error} />
        </div>
      ) : null}
      {(workers.data ?? []).length === 0 && !workers.isLoading ? (
        <EmptyState
          title="No workers"
          body="Start `npm run dev:worker` so a process can register and claim jobs."
        />
      ) : (
        <div className={panelClass}>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Host</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Reachability</th>
                <th className={thClass}>Current job</th>
                <th className={thClass}>Concurrency</th>
                <th className={thClass}>Heartbeat</th>
                <th className={thClass}>Started</th>
              </tr>
            </thead>
            <tbody>
              {(workers.data ?? []).map((worker) => {
                const online = isWorkerOnline(worker.status, worker.lastHeartbeat);
                return (
                  <tr key={worker.id}>
                    <td className={tdClass}>{worker.workerName}</td>
                    <td className={tdClass}>{worker.hostname}</td>
                    <td className={tdClass}>{worker.status}</td>
                    <td className={tdClass}>{online ? 'Online' : 'Offline'}</td>
                    <td className={tdClass}>
                      {worker.currentJobId ? (
                        <Link className={linkClass} to={`/jobs/${worker.currentJobId}`}>
                          {worker.currentJobId.slice(0, 8)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={tdClass}>{worker.concurrency}</td>
                    <td className={tdClass}>{formatAgo(worker.lastHeartbeat)}</td>
                    <td className={tdClass}>{formatDateTime(worker.startedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
