/**
 * What this device keeps: the device token, the recovery code as the server showed it once,
 * the cached profile and consent, and the things that NEVER leave the device (payday amounts
 * and setup, the titles of weekly wins, the names of people).
 *
 * Storage is localStorage with a safe in-memory fallback (private mode, quota, no window).
 * Every key carries a version: "standing.v1.<name>". When a shape changes, raise the version
 * of that slot and add a migration from the old version; an old key is read once, migrated,
 * written under the new key and removed.
 *
 * No React in this file. Hooks over the device record are in ./api.ts.
 */
import type { ConsentState, CreateUserResponse, UserProfile } from '../shared/api';
import type { CertificateLevel, NudgeCategory, PaydayAmounts, PaydaySetup, WeeklyWinKind } from '../engine';

// ---------------------------------------------------------------- storage

/** The part of the Web Storage API this app uses. localStorage fits; so does a test double. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A store that lives in memory only. Used on the server, in tests and when localStorage fails. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/**
 * localStorage when it works, memory otherwise. Every call is guarded: a browser that refuses
 * storage (private mode, a full quota, a blocked origin) keeps the values for the life of the
 * page and nothing throws.
 */
export function browserStore(): KeyValueStore {
  const memory = memoryStore();
  let local: Storage | null = null;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const probe = 'standing.probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      local = window.localStorage;
    }
  } catch {
    local = null;
  }
  if (!local) return memory;
  const storage = local;
  /** Keys whose last write did not reach localStorage: memory holds the newer value. */
  const stale = new Set<string>();
  return {
    getItem(key) {
      if (stale.has(key)) return memory.getItem(key);
      try {
        return storage.getItem(key);
      } catch {
        return memory.getItem(key);
      }
    },
    setItem(key, value) {
      memory.setItem(key, value);
      try {
        storage.setItem(key, value);
        stale.delete(key);
      } catch {
        stale.add(key);
      }
    },
    removeItem(key) {
      memory.removeItem(key);
      stale.delete(key);
      try {
        storage.removeItem(key);
      } catch {
        // Nothing to do: the value is gone from memory, which is what this page reads.
      }
    },
  };
}

let defaultStorage: KeyValueStore | null = null;

/** The one store of this page. Memory on the server, where nothing is ever written. */
export function deviceStorage(): KeyValueStore {
  if (!defaultStorage) defaultStorage = browserStore();
  return defaultStorage;
}

// ---------------------------------------------------------------- versioned slots

export const STORAGE_PREFIX = 'standing';

/** "standing.v1.device" */
export function storageKey(name: string, version: number): string {
  return `${STORAGE_PREFIX}.v${version}.${name}`;
}

/** Turns the value stored under version n into the shape of version n + 1. */
export type Migration = (old: unknown) => unknown;

export interface SlotOptions<T> {
  storage: KeyValueStore;
  /** Name of the slot inside the prefix, for example "device". */
  name: string;
  /** Current version of the shape. Starts at 1. */
  version: number;
  /** The value when nothing is stored. */
  empty: T;
  /** Checks a parsed value and returns it in the current shape, or null to fall back to `empty`. */
  revive?: (value: unknown) => T | null;
  /** migrations[n] upgrades version n to n + 1. Needed for every version below `version` that shipped. */
  migrations?: Record<number, Migration>;
}

/** One persisted value with a stable snapshot, so it can back useSyncExternalStore. */
export interface Slot<T> {
  readonly key: string;
  get(): T;
  set(next: T): void;
  update(change: (current: T) => T): T;
  /** Removes the stored value. get() returns `empty` again. */
  clear(): void;
  /** Reads storage again, for a change made in another tab. */
  reload(): void;
  subscribe(listener: () => void): () => void;
}

const allSlots = new Set<Slot<unknown>>();

function parse(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * A slot under a versioned key. On the first read it looks for the current key; when that is
 * missing it walks back through older versions, runs the migrations and moves the value.
 */
export function createSlot<T>(options: SlotOptions<T>): Slot<T> {
  const { storage, name, version, empty, revive, migrations = {} } = options;
  const key = storageKey(name, version);
  const listeners = new Set<() => void>();
  let loaded = false;
  let value: T = empty;

  const read = (): T => {
    let raw = parse(storage.getItem(key));
    if (raw === undefined) {
      for (let old = version - 1; old >= 1 && raw === undefined; old -= 1) {
        const oldKey = storageKey(name, old);
        let found = parse(storage.getItem(oldKey));
        if (found === undefined) continue;
        try {
          for (let v = old; v < version; v += 1) {
            const migrate = migrations[v];
            if (!migrate) throw new Error(`no migration from version ${v}`);
            found = migrate(found);
          }
          raw = found;
          storage.setItem(key, JSON.stringify(raw));
        } catch {
          raw = undefined;
        }
        storage.removeItem(oldKey);
      }
    }
    if (raw === undefined) return empty;
    if (!revive) return raw as T;
    try {
      return revive(raw) ?? empty;
    } catch {
      return empty;
    }
  };

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  const slot: Slot<T> = {
    key,
    get() {
      if (!loaded) {
        value = read();
        loaded = true;
      }
      return value;
    },
    set(next) {
      value = next;
      loaded = true;
      storage.setItem(key, JSON.stringify(next));
      emit();
    },
    update(change) {
      const next = change(slot.get());
      if (next !== value) slot.set(next);
      return next;
    },
    clear() {
      value = empty;
      loaded = true;
      storage.removeItem(key);
      emit();
    },
    reload() {
      const before = JSON.stringify(slot.get());
      const next = read();
      if (JSON.stringify(next) === before) return;
      value = next;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  allSlots.add(slot as Slot<unknown>);
  return slot;
}

/**
 * Empties every slot made on this page: the device record, the check in progress, the event
 * queue. Call it after the server confirmed "delete my data", and for "forget this device".
 */
export function clearAllSlots(): void {
  for (const slot of allSlots) slot.clear();
}

/** Keeps the slots of this page in step with changes made in another tab. Returns the undo. */
export function followOtherTabs(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  const onStorage = (event: Event) => {
    const changed = (event as StorageEvent).key;
    for (const slot of allSlots) if (changed === null || changed === slot.key) slot.reload();
  };
  target.addEventListener('storage', onStorage);
  return () => target.removeEventListener('storage', onStorage);
}

// ---------------------------------------------------------------- the device record

/** One payday as the person typed it. NEVER sent: the server takes bands only (paydayBandsFor). */
export interface LocalPayday extends PaydayAmounts {
  /** The id the bands of this payday were sent under (PaydayEntryRequest.id). */
  id: string;
}

/** One weekly win. The title NEVER leaves the device: the server takes the kind and counts. */
export interface LocalWin {
  /** The id the entry was sent under (WeeklyWinRequest.id). */
  id: string;
  /** The day it was logged, YYYY-MM-DD. */
  day: string;
  kind: WeeklyWinKind;
  /** What the person called it. On the device only. */
  title: string;
  hours?: number | null;
  exam?: boolean;
  level?: CertificateLevel;
}

/** One person picked to reconnect with. The name NEVER leaves the device: the server takes categories and counts. */
export interface LocalPerson {
  id: string;
  /** On the device only. */
  name: string;
  category: NudgeCategory;
  /** The day the person was picked, YYYY-MM-DD. The week it belongs to follows from it. */
  pickedOn: string;
  /** The day the person was reached, or null while that is still open. */
  reachedOn: string | null;
}

export interface DeviceRecord {
  /** Sent as the bearer token. null: this device has no record on the server yet. */
  deviceToken: string | null;
  /** As the server showed it once. null after a restore: the server cannot show it again (rotate to get a new one). */
  recoveryCode: string | null;
  userId: string | null;
  /** The ticker of the latest check, in upper case. */
  ticker: string | null;
  /** The profile as GET /api/me last returned it. */
  profile: UserProfile | null;
  /** The consent state as the server last confirmed it. */
  consent: ConsentState | null;
  /** True once this person has a completed check. Cached so the route guards work before the network answers. */
  hasCheck: boolean;
  /** The local day of the last visit the server took, so the ping goes out once a day. */
  lastVisitDay: string | null;
  /** Payday Check. Amounts and setup stay here. */
  payday: { setup: PaydaySetup | null; entries: LocalPayday[] };
  /** Weekly Win, with titles. */
  wins: LocalWin[];
  /** People Nudge, with names. */
  people: LocalPerson[];
  /**
   * The record the payday amounts, win titles and names above belong to. They stay on the device
   * when it loses its token, and are cleared when another record signs in on it.
   */
  localOwner: string | null;
}

export const EMPTY_DEVICE: DeviceRecord = Object.freeze({
  deviceToken: null,
  recoveryCode: null,
  userId: null,
  ticker: null,
  profile: null,
  consent: null,
  hasCheck: false,
  lastVisitDay: null,
  payday: Object.freeze({ setup: null, entries: [] as LocalPayday[] }),
  wins: [] as LocalWin[],
  people: [] as LocalPerson[],
  localOwner: null,
}) as DeviceRecord;

export const DEVICE_VERSION = 1;

/**
 * Migrations of the device record. DEVICE_MIGRATIONS[n] turns version n into n + 1. Empty
 * while version 1 is the only one. When a field changes meaning: raise DEVICE_VERSION and add
 * the function here.
 */
export const DEVICE_MIGRATIONS: Record<number, Migration> = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Reads a stored record leniently: a missing or damaged field falls back to its empty value. */
export function reviveDevice(value: unknown): DeviceRecord | null {
  if (!isRecord(value)) return null;
  const payday = isRecord(value.payday) ? value.payday : {};
  return {
    deviceToken: text(value.deviceToken),
    recoveryCode: text(value.recoveryCode),
    userId: text(value.userId),
    ticker: text(value.ticker),
    profile: isRecord(value.profile) ? (value.profile as unknown as UserProfile) : null,
    consent: isRecord(value.consent) && isRecord(value.consent.general) ? (value.consent as unknown as ConsentState) : null,
    hasCheck: value.hasCheck === true,
    lastVisitDay: text(value.lastVisitDay),
    payday: {
      setup: isRecord(payday.setup) ? (payday.setup as unknown as PaydaySetup) : null,
      entries: Array.isArray(payday.entries) ? (payday.entries.filter(isRecord) as unknown as LocalPayday[]) : [],
    },
    wins: Array.isArray(value.wins) ? (value.wins.filter(isRecord) as unknown as LocalWin[]) : [],
    people: Array.isArray(value.people) ? (value.people.filter(isRecord) as unknown as LocalPerson[]) : [],
    // Records kept before this field existed belong to the record the device holds.
    localOwner: text(value.localOwner) ?? text(value.userId),
  };
}

/**
 * The private fields for `userId`: kept when they are that record's, emptied when they belong to
 * another record or to nobody known.
 */
function privateFor(current: DeviceRecord, userId: string): Pick<DeviceRecord, 'payday' | 'wins' | 'people' | 'localOwner'> {
  if (current.localOwner === userId) return { payday: current.payday, wins: current.wins, people: current.people, localOwner: userId };
  return { payday: { setup: null, entries: [] }, wins: [], people: [], localOwner: userId };
}

export interface DeviceStore extends Slot<DeviceRecord> {
  /** Merges fields into the record. */
  patch(fields: Partial<DeviceRecord>): DeviceRecord;
  /** Keeps what POST /api/users returned: the token and the recovery code are shown only once. */
  signIn(created: Pick<CreateUserResponse, 'userId' | 'deviceToken' | 'recoveryCode' | 'consent'>): DeviceRecord;
  /** Keeps a token issued by POST /api/restore. The recovery code is not known on this device. */
  restore(restored: { userId: string; deviceToken: string }): DeviceRecord;
  /**
   * Drops the account fields and keeps what never left the device. For a token the server no
   * longer accepts, and for signing out.
   */
  forgetAccount(options?: { keepRecoveryCode?: boolean }): DeviceRecord;
}

export function createDeviceStore(storage: KeyValueStore, migrations: Record<number, Migration> = DEVICE_MIGRATIONS): DeviceStore {
  const slot = createSlot<DeviceRecord>({
    storage,
    name: 'device',
    version: DEVICE_VERSION,
    empty: EMPTY_DEVICE,
    revive: reviveDevice,
    migrations,
  });
  const patch = (fields: Partial<DeviceRecord>) => slot.update((current) => ({ ...current, ...fields }));
  return Object.assign(slot, {
    patch,
    signIn: (created: Pick<CreateUserResponse, 'userId' | 'deviceToken' | 'recoveryCode' | 'consent'>) =>
      patch({
        ...privateFor(slot.get(), created.userId),
        userId: created.userId,
        deviceToken: created.deviceToken,
        recoveryCode: created.recoveryCode,
        consent: created.consent,
        hasCheck: false,
        profile: null,
        lastVisitDay: null,
      }),
    restore: (restored: { userId: string; deviceToken: string }) =>
      patch({
        ...privateFor(slot.get(), restored.userId),
        userId: restored.userId,
        deviceToken: restored.deviceToken,
        recoveryCode: null,
        consent: null,
        profile: null,
        hasCheck: false,
        lastVisitDay: null,
      }),
    forgetAccount: (options: { keepRecoveryCode?: boolean } = {}) =>
      slot.update((current) => ({
        ...current,
        // The private fields stay, and remember whose they are.
        localOwner: current.localOwner ?? current.userId,
        deviceToken: null,
        userId: null,
        recoveryCode: options.keepRecoveryCode ? current.recoveryCode : null,
        ticker: null,
        profile: null,
        consent: null,
        hasCheck: false,
        lastVisitDay: null,
      })),
  });
}

let defaultDevice: DeviceStore | null = null;

/** The device record of this page. */
export function device(): DeviceStore {
  if (!defaultDevice) defaultDevice = createDeviceStore(deviceStorage());
  return defaultDevice;
}

/** A random id of 22 URL-safe characters (128 bits), for sessions, entries and report events (CLIENT_ID_PATTERN). */
export function newClientId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
