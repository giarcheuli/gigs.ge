import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const platformSettings = pgTable('platform_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: text('scope').notNull().default('global').unique(),
  posterFeePercent: numeric('poster_fee_percent', { precision: 5, scale: 2 }).notNull().default('3.00'),
  workerFeePercent: numeric('worker_fee_percent', { precision: 5, scale: 2 }).notNull().default('2.00'),
  cancelGraceHours: integer('cancel_grace_hours').notNull().default(24),
  completionResponseHours: integer('completion_response_hours').notNull().default(48),
  overdueAutoCompleteDays: integer('overdue_auto_complete_days').notNull().default(14),
  disputeArbiterUnlockHours: integer('dispute_arbiter_unlock_hours').notNull().default(24),
  disputeAutoResolveDays: integer('dispute_auto_resolve_days').notNull().default(7),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformSettingsHistory = pgTable('platform_settings_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminId: uuid('admin_id').notNull().references(() => users.id),
  previousValues: jsonb('previous_values').notNull(),
  newValues: jsonb('new_values').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});