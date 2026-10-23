import type { JobStatus } from '../lib/types.ts';
import { statusTone } from '../lib/format.ts';

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(status)}`}
    >
      {status}
    </span>
  );
}
