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
import { regions, cities } from './regions.js';

export const gigs = pgTable('gigs', {
  id: uuid('id').primaryKey().defaultRandom(),
  posterId: uuid('poster_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  shortDescription: text('short_description').notNull(),
  longDescription: text('long_description'),
  regionId: integer('region_id').notNull().references(() => regions.id),
  cityId: integer('city_id').references(() => cities.id),
  streetAddress: text('street_address'),
  priceType: text('price_type').notNull(), // 'fixed' | 'range' | 'negotiable'
  priceFixed: numeric('price_fixed', { precision: 10, scale: 2 }),
  priceRangeMin: numeric('price_range_min', { precision: 10, scale: 2 }),
  priceRangeMax: numeric('price_range_max', { precision: 10, scale: 2 }),
  availableFrom: timestamp('available_from', { withTimezone: true }),
  availableTo: timestamp('available_to', { withTimezone: true }),
  status: text('status').notNull().default('draft'), // 'draft'|'active'|'shelf'|'expired'|'archived'|'cancelled'
  visImages: text('vis_images').notNull().default('verified'),
  visPrice: text('vis_price').notNull().default('public'),
  visCity: text('vis_city').notNull().default('verified'),
  visAddress: text('vis_address').notNull().default('on_request'),
  visContact: text('vis_contact').notNull().default('on_request'),
  visDates: text('vis_dates').notNull().default('verified'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gigImages = pgTable('gig_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  gigId: uuid('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  isPreview: boolean('is_preview').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
