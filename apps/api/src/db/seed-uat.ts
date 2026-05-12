/**
 * UAT seed — inserts 3 pre-verified test accounts for stakeholder UAT.
 *
 * Idempotent: uses onConflictDoNothing so re-running is safe.
 * Refuses to run in NODE_ENV=production.
 *
 * Accounts:
 *   poster1@uat.gigs.ge  — posts gigs
 *   worker1@uat.gigs.ge  — applies as worker (scenario A)
 *   worker2@uat.gigs.ge  — applies as worker (scenario B)
 *
 * Password for all: Uat-Demo-2026!
 */

import bcrypt from 'bcryptjs';
import { db } from './index.js';
import { users } from './schema/users.js';
import { userProfiles } from './schema/profiles.js';

const UAT_PASSWORD = 'Uat-Demo-2026!'; // gitguardian:ignore — intentional UAT demo credential, not a real secret
const BCRYPT_ROUNDS = 12;

if (process.env.NODE_ENV === 'production') {
  console.error('❌  seed-uat.ts must not run in production.');
  process.exit(1);
}

async function seed() {
  console.log('Seeding UAT accounts…');

  const hash = await bcrypt.hash(UAT_PASSWORD, BCRYPT_ROUNDS);

  const accounts = [
    {
      email: 'poster1@uat.gigs.ge',
      phone: '+995555001001',
      dateOfBirth: '1990-01-15',
    },
    {
      email: 'worker1@uat.gigs.ge',
      phone: '+995555001002',
      dateOfBirth: '1992-03-20',
    },
    {
      email: 'worker2@uat.gigs.ge',
      phone: '+995555001003',
      dateOfBirth: '1988-07-22',
    },
  ];

  for (const acc of accounts) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: acc.email,
        phone: acc.phone,
        passwordHash: hash,
        dateOfBirth: acc.dateOfBirth,
        emailVerified: true,
        phoneVerified: true,  // ← both verified so accounts can post and apply
        status: 'active',
        role: 'user',
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (inserted) {
      await db
        .insert(userProfiles)
        .values({ userId: inserted.id })
        .onConflictDoNothing({ target: userProfiles.userId });

      console.log(`  ✓ Inserted ${acc.email}`);
    } else {
      console.log(`  · Skipped ${acc.email} (already exists)`);
    }
  }

  console.log('UAT seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
