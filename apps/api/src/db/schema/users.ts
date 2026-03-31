import {
  pgTable,
  uuid,
  text,
  boolean,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  phone: text('phone').unique().notNull(),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  passwordHash: text('password_hash').notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  status: text('status').notNull().default('active'), // 'active' | 'restricted' | 'suspended' | 'banned'
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  markedForDeletionAt: timestamp('marked_for_deletion_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
