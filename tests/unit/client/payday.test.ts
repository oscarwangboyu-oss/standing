// Payday amounts on the device: the four numbers of a payday (take-home pay, money available
// now, debt paid, saved) are kept as typed, an older payday keeps its spending, and what this
// device sends for them is bands under the allowed fields only.

import { describe, expect, it } from 'vitest';
import { createDeviceStore, memoryStore, reviveDevice, type LocalPayday } from '@/client/device';
import { paydayBandsFor, type PaydaySetup } from '@/engine';
import { PAYDAY_ENTRY_FIELDS, type PaydayEntryRequest } from '@/shared/api';

const consent = { general: { version: 'general-1', at: '2026-03-01T00:00:00.000Z' }, health: null };
const setup: PaydaySetup = { frequency: 'biweekly', essentialMonthly: 2468 };
/** Recorded before money now and debt existed. */
const older: LocalPayday = { id: 'payday_older_000001', day: '2026-03-02', income: 4317, spending: 2871, savings: 612 };
const current: LocalPayday = { id: 'payday_current_00001', day: '2026-03-16', income: 4317, balance: 9526, debt: 1183, savings: 1419 };

describe('payday amounts on the device', () => {
  it('keeps the four numbers of a payday and the spending of an older one', () => {
    const store = createDeviceStore(memoryStore());
    store.signIn({ userId: 'u-1', deviceToken: 't-1', recoveryCode: 'R', consent });
    store.patch({ payday: { setup, entries: [older, current] } });
    const revived = reviveDevice(JSON.parse(JSON.stringify(store.get())));
    expect(revived?.payday.setup).toEqual(setup);
    expect(revived?.payday.entries).toEqual([older, current]);
    // The amounts belong to this record: a lost token keeps them.
    store.forgetAccount();
    expect(store.get().payday.entries).toEqual([older, current]);
  });

  it('turns them into bands, and the request holds the allowed fields and no amount', () => {
    const { bands, local } = paydayBandsFor({ setup, entries: [older, current], baseline: { day: '2026-03-01', runwayKey: 'base', runwayOption: 2 } });
    // The runway comes from the money available now, so the request names no baseline day.
    expect(bands.baselineDay).toBeNull();
    expect(local.runwayMonths).toBeCloseTo(9526 / 2468, 12);
    // The older payday has no debt figure: the mean debt share is this payday's alone.
    expect(local.averageDebtShare).toBeCloseTo(1183 / 4317, 12);
    expect(local.averageSaveShare).toBeCloseTo((612 / 4317 + 1419 / 4317) / 2, 12);

    // Built the way the Payday Check screen builds it.
    const request: PaydayEntryRequest = {
      id: current.id,
      localDate: current.day,
      periods: bands.periods,
      saveShare: bands.saveShare,
      debtShare: bands.debtShare ?? null,
      runway: bands.runway,
      baselineDay: bands.baselineDay,
    };
    expect(Object.keys(request).sort()).toEqual([...PAYDAY_ENTRY_FIELDS].sort());
    const body = JSON.stringify(request);
    for (const amount of ['2468', '4317', '9526', '1183', '1419', '2871', '612']) expect(body).not.toContain(amount);
    for (const field of ['saveShare', 'debtShare', 'runway'] as const) {
      const value = request[field];
      expect(Number.isInteger(value), field).toBe(true);
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(4);
    }
    expect(request.periods).toBe(2);
  });
});
