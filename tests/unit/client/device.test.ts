// What never leaves the device (payday amounts, win titles, names of people) belongs to one
// record. It survives a lost token, and it is cleared when another record signs in.

import { describe, expect, it } from 'vitest';
import { createDeviceStore, memoryStore, reviveDevice, type LocalWin } from '@/client/device';

const consent = { general: { version: 'general-1', at: '2026-03-01T00:00:00.000Z' }, health: null };
const win: LocalWin = { id: 'win_abcdefghijklmnop', day: '2026-03-01', kind: 'skill', title: 'Learned SQL joins' };

describe('private data on the device', () => {
  it('stays with its own record through a lost token and a restore', () => {
    const store = createDeviceStore(memoryStore());
    store.signIn({ userId: 'u-1', deviceToken: 't-1', recoveryCode: 'R', consent });
    store.patch({ wins: [win] });
    expect(store.get().localOwner).toBe('u-1');
    // The server no longer accepts the token: the account fields go, the private ones stay.
    store.forgetAccount();
    expect(store.get().wins).toEqual([win]);
    // The same person connects again with their recovery code.
    store.restore({ userId: 'u-1', deviceToken: 't-2' });
    expect(store.get().wins).toEqual([win]);
  });

  it('is cleared when another record signs in, or connects with a code', () => {
    const store = createDeviceStore(memoryStore());
    store.signIn({ userId: 'u-1', deviceToken: 't-1', recoveryCode: 'R', consent });
    store.patch({ wins: [win], people: [{ id: 'p', name: 'Sam', category: 'friend', pickedOn: '2026-03-01', reachedOn: null } as never] });
    store.forgetAccount();
    store.signIn({ userId: 'u-2', deviceToken: 't-3', recoveryCode: 'S', consent });
    expect(store.get().wins).toEqual([]);
    expect(store.get().people).toEqual([]);
    expect(store.get().localOwner).toBe('u-2');

    store.patch({ wins: [win] });
    store.restore({ userId: 'u-3', deviceToken: 't-4' });
    expect(store.get().wins).toEqual([]);
    expect(store.get().localOwner).toBe('u-3');
  });

  it('a record stored before the owner field belongs to the record the device holds', () => {
    const revived = reviveDevice({ userId: 'u-9', deviceToken: 't', wins: [win] });
    expect(revived?.localOwner).toBe('u-9');
  });
});
