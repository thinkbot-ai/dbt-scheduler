import { cardClass, eyebrowClass, valueTextClass } from './ui.ts';

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={cardClass}>
      <p className={eyebrowClass}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueTextClass}`}>{value}</p>
    </div>
  );
}
