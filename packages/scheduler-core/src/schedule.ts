export function isScheduleDue(nextRunAt: Date, now: Date): boolean {
  return nextRunAt.getTime() <= now.getTime();
}

export function buildScheduleExecutionKey(scheduleId: string, scheduledFor: Date): string {
  return `${scheduleId}:${scheduledFor.toISOString()}`;
}

export const CRON_PRESETS = {
  every_5_minutes: '*/5 * * * *',
  every_15_minutes: '*/15 * * * *',
  every_30_minutes: '*/30 * * * *',
  every_hour: '0 * * * *',
  every_6_hours: '0 */6 * * *',
  daily: '0 0 * * *',
  weekly: '0 0 * * 0',
} as const;

export type CronPresetName = keyof typeof CRON_PRESETS;
