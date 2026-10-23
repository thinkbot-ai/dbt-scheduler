import { timestamp } from 'drizzle-orm/pg-core';

export const createdAtColumn = timestamp('created_at', { withTimezone: true, mode: 'date' })
  .notNull()
  .defaultNow();

export const updatedAtColumn = timestamp('updated_at', { withTimezone: true, mode: 'date' })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());
