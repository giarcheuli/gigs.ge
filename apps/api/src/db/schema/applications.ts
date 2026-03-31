import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { gigs } from './gigs.js';

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  gigId: uuid('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  applicantId: uuid('applicant_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // 'pending'|'accepted'|'rejected'|'closed'|'withdrawn'
  message: text('message'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueGigApplicant: unique().on(t.gigId, t.applicantId),
}));

export const applicationAttachments = pgTable('application_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: text('size_bytes').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
