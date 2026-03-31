import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { contracts } from './contracts.js';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
  targetId: uuid('target_id').notNull().references(() => users.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  status: text('status').notNull().default('pending'), // 'pending'|'published'|'flagged'|'removed'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (t) => ({
  uniqueContractReviewer: unique().on(t.contractId, t.reviewerId),
}));
