/**
 * UAT seed — pre-verified accounts for stakeholder walkthroughs.
 *
 * Inserts three accounts (1 poster, 2 workers) that are already email-verified
 * so reviewers can sign in directly without going through registration or OTP entry.
 *
 * Safety rules:
 *   - Idempotent: onConflictDoNothing so double-running is harmless.
 *   - Dev/UAT only: refuses to run in production.
 *
 * Credentials are documented in docs/guides/uat-test-accounts.md.
 *
 * Run with: pnpm --filter @gigs/api db:seed:uat
 */

import { db } from './index.js';
import { users, userProfiles } from './schema/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/auth.js';

const UAT_PASSWORD = 'Uat-Demo-2026!';

const UAT_ACCOUNTS = [
  {
    email: 'poster1@uat.gigs.ge',
    phone: '+995555001001',
    dateOfBirth: '1990-01-15',
    role: 'user' as const,
    description: 'UAT Poster — creates gigs and accepts applications',
  },
  {
    email: 'worker1@uat.gigs.ge',
    phone: '+995555001002',
    dateOfBirth: '1992-03-20',
    role: 'user' as const,
    description: 'UAT Worker 1 — browses gigs and applies',
  },
  {
    email: 'worker2@uat.gigs.ge',
    phone: '+995555001003',
    dateOfBirth: '1988-07-22',
    role: 'user' as const,
    description: 'UAT Worker 2 — second applicant for multi-applicant scenarios',
  },
] as const;

async function seedUat() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run UAT seed in production.');
    process.exit(1);
  }

  console.log('Seeding UAT accounts…');

  const passwordHash = await hashPassword(UAT_PASSWORD);

  let created = 0;
  let skipped = 0;

  for (const account of UAT_ACCOUNTS) {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, account.email),
    });

    if (existing) {
      console.log(`  ⟳ ${account.email} — already exists, skipping`);
      skipped++;
      continue;
    }

    const [newUser] = await db
      .insert(users)
      .values({
        email: account.email,
        phone: account.phone,
        passwordHash,
        dateOfBirth: account.dateOfBirth,
        role: account.role,
        emailVerified: true,   // pre-verified so reviewers can sign in directly
        phoneVerified: false,  // phone OTP is deferred to a follow-up UAT slice
        status: 'active',
      })
      .returning();

    // Create an empty profile row
    await db.insert(userProfiles).values({ userId: newUser.id });

    console.log(`  ✓ ${account.email} (${account.description})`);
    created++;
  }

  console.log(`\nUAT seed complete — ${created} created, ${skipped} skipped.`);
  process.exit(0);
}

seedUat().catch((err) => {
  console.error('UAT seed failed:', err);
  process.exit(1);
});
