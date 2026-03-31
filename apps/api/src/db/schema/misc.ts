import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { gigs } from './gigs.js';

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(), // 'email' | 'sms'
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const infoRequests = pgTable('info_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  gigId: uuid('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  field: text('field').notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'granted'|'denied'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => ({
  uniqueGigRequesterField: unique().on(t.gigId, t.requesterId, t.field),
}));

export const gigFlags = pgTable('gig_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  gigId: uuid('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'reviewed'|'dismissed'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
}, (t) => ({
  uniqueGigReporter: unique().on(t.gigId, t.reporterId),
}));
