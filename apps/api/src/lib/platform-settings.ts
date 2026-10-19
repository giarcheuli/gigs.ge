import { eq } from 'drizzle-orm';
import type { PlatformSettingsInput } from '@gigs/shared';
import { db } from '../db/index.js';
import { platformSettings, platformSettingsHistory } from '../db/schema/platform-settings.js';

const GLOBAL_SCOPE = 'global';

type PlatformSettingsRow = typeof platformSettings.$inferSelect;

const settingsValues = (row: PlatformSettingsRow): PlatformSettingsInput => ({
  posterFeePercent: Number(row.posterFeePercent),
  workerFeePercent: Number(row.workerFeePercent),
  cancelGraceHours: row.cancelGraceHours,
  completionResponseHours: row.completionResponseHours,
  overdueAutoCompleteDays: row.overdueAutoCompleteDays,
  disputeArbiterUnlockHours: row.disputeArbiterUnlockHours,
  disputeAutoResolveDays: row.disputeAutoResolveDays,
});

export async function getPlatformSettings() {
  let row = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.scope, GLOBAL_SCOPE),
  });

  if (!row) {
    await db.insert(platformSettings)
      .values({ scope: GLOBAL_SCOPE })
      .onConflictDoNothing({ target: platformSettings.scope });
    row = await db.query.platformSettings.findFirst({
      where: eq(platformSettings.scope, GLOBAL_SCOPE),
    });
  }

  if (!row) throw new Error('Platform settings could not be initialized');

  return {
    ...settingsValues(row),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function updatePlatformSettings(adminId: string, values: PlatformSettingsInput) {
  await getPlatformSettings();

  return db.transaction(async (transaction) => {
    const [current] = await transaction.select()
      .from(platformSettings)
      .where(eq(platformSettings.scope, GLOBAL_SCOPE))
      .for('update');

    if (!current) throw new Error('Platform settings could not be initialized');

    const [updated] = await transaction.update(platformSettings)
      .set({
        ...values,
        posterFeePercent: values.posterFeePercent.toFixed(2),
        workerFeePercent: values.workerFeePercent.toFixed(2),
        updatedBy: adminId,
        updatedAt: new Date(),
      })
      .where(eq(platformSettings.id, current.id))
      .returning();

    if (!updated) throw new Error('Platform settings update failed');

    await transaction.insert(platformSettingsHistory).values({
      adminId,
      previousValues: settingsValues(current),
      newValues: settingsValues(updated),
    });

    return {
      ...settingsValues(updated),
      updatedAt: updated.updatedAt.toISOString(),
      updatedBy: updated.updatedBy,
    };
  });
}