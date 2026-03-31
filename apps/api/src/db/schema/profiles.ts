import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { regions, cities } from './regions.js';

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  avatarUrl: text('avatar_url'),
  shortBio: text('short_bio'),
  country: text('country').notNull().default('GE'),
  regionId: integer('region_id').references(() => regions.id),
  cityId: integer('city_id').references(() => cities.id),
  streetAddress: text('street_address'),
  whatsapp: text('whatsapp'),
  telegram: text('telegram'),
  signal: text('signal'),
  visFirstName: text('vis_first_name').notNull().default('verified'),
  visLastName: text('vis_last_name').notNull().default('post_contract'),
  visAvatar: text('vis_avatar').notNull().default('verified'),
  visRegion: text('vis_region').notNull().default('verified'),
  visWhatsapp: text('vis_whatsapp').notNull().default('on_request'),
  visTelegram: text('vis_telegram').notNull().default('on_request'),
  visSignal: text('vis_signal').notNull().default('on_request'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
