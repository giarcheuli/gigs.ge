import {
  pgTable,
  serial,
  text,
  integer,
} from 'drizzle-orm/pg-core';

export const regions = pgTable('regions', {
  id: serial('id').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameKa: text('name_ka').notNull(),
  code: text('code').unique().notNull(),
});

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  regionId: integer('region_id').notNull().references(() => regions.id),
  nameEn: text('name_en').notNull(),
  nameKa: text('name_ka').notNull(),
});
