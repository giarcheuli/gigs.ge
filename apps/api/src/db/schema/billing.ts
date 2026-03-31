import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { contracts } from './contracts.js';

export const billingLedger = pgTable('billing_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  type: text('type').notNull(), // 'poster_fee' | 'worker_fee'
  status: text('status').notNull().default('pending'), // 'pending'|'invoiced'|'paid'
  carryOver: boolean('carry_over').notNull().default(false),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  invoiceNumber: text('invoice_number').unique().notNull(),
  billingPeriod: text('billing_period').notNull(), // e.g. '2026-03'
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull().default('unpaid'), // 'unpaid' | 'paid'
  pdfUrl: text('pdf_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  markedPaidBy: uuid('marked_paid_by').references(() => users.id),
});
