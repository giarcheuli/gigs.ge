import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { gigs } from './gigs.js';
import { applications } from './applications.js';

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id),
  gigId: uuid('gig_id').notNull().references(() => gigs.id),
  posterId: uuid('poster_id').notNull().references(() => users.id),
  workerId: uuid('worker_id').notNull().references(() => users.id),
  agreedPrice: numeric('agreed_price', { precision: 10, scale: 2 }),
  agreedStartAt: timestamp('agreed_start_at', { withTimezone: true }).notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  status: text('status').notNull().default('draft'),
  // 'draft'|'in_progress'|'pending_completion'|'completed'|'disputed'|'arbitration'|'auto_resolved'|'cancelled'|'quit'
  posterSignedAt: timestamp('poster_signed_at', { withTimezone: true }),
  workerSignedAt: timestamp('worker_signed_at', { withTimezone: true }),
  feeEligible: boolean('fee_eligible').notNull().default(true),
  completionMarkedBy: uuid('completion_marked_by').references(() => users.id),
  completionMarkedAt: timestamp('completion_marked_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  disputedAt: timestamp('disputed_at', { withTimezone: true }),
  quitAt: timestamp('quit_at', { withTimezone: true }),
  arbiterDecision: text('arbiter_decision'), // 'favor_poster' | 'favor_worker' | 'dismiss'
  arbiterNotes: text('arbiter_notes'),
  arbiterDecidedAt: timestamp('arbiter_decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contractAppendices = pgTable('contract_appendices', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  proposedBy: uuid('proposed_by').notNull().references(() => users.id),
  description: text('description').notNull(),
  additionalCompensation: numeric('additional_compensation', { precision: 10, scale: 2 }),
  newDueAt: timestamp('new_due_at', { withTimezone: true }),
  newStartAt: timestamp('new_start_at', { withTimezone: true }),
  status: text('status').notNull().default('proposed'), // 'proposed'|'accepted'|'rejected'
  appendixNumber: integer('appendix_number').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

export const disputeEvidence = pgTable('dispute_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  description: text('description').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const disputeEvidenceFiles = pgTable('dispute_evidence_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  evidenceId: uuid('evidence_id').notNull().references(() => disputeEvidence.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
