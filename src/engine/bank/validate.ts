// Checks that a parsed bank JSON has the shape the engine relies on, so the Bank type is a
// fact and not a cast. It never changes the data: the object returned is the object passed in.

import {
  AREA_IDS,
  CONTEXT_KEYS,
  EngineError,
  FIELD_IDS,
  MONEY_IDS,
  ROLE_IDS,
  SECTION_IDS,
  TIER_IDS,
} from '../types';
import type { Bank } from '../types';

type Obj = Record<string, unknown>;

function fail(path: string, problem: string): never {
  throw new EngineError(`bank: ${path} ${problem}`);
}

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function obj(x: unknown, path: string): Obj {
  if (!isObj(x)) fail(path, 'must be an object');
  return x;
}

function arr(x: unknown, path: string): unknown[] {
  if (!Array.isArray(x)) fail(path, 'must be an array');
  return x;
}

function str(x: unknown, path: string): string {
  if (typeof x !== 'string' || x.length === 0) fail(path, 'must be a non-empty string');
  return x;
}

function num(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(path, 'must be a finite number');
  return x;
}

function oneOf(x: unknown, allowed: readonly string[], path: string): string {
  if (typeof x !== 'string' || !allowed.includes(x)) fail(path, `must be one of ${allowed.join(', ')}`);
  return x;
}

function bilingual(x: unknown, path: string): void {
  const o = obj(x, path);
  str(o.zh, `${path}.zh`);
  str(o.en, `${path}.en`);
}

function sameKeys(o: Obj, keys: readonly string[], path: string): void {
  const have = Object.keys(o);
  if (have.length !== keys.length || !keys.every((k) => have.includes(k))) {
    fail(path, `must have exactly the keys ${keys.join(', ')}`);
  }
}

function loads(x: unknown, path: string): Obj {
  const o = obj(x, path);
  for (const [a, w] of Object.entries(o)) {
    oneOf(a, AREA_IDS, `${path} key`);
    if (num(w, `${path}.${a}`) <= 0) fail(`${path}.${a}`, 'must be positive');
  }
  return o;
}

function options(x: unknown, path: string): number {
  const list = arr(x, path);
  if (list.length < 2) fail(path, 'must have at least two options');
  list.forEach((o, i) => bilingual(o, `${path}[${i}]`));
  return list.length;
}

function version(x: unknown, area: string, itemLoad: Obj, path: string): string {
  const v = obj(x, path);
  const key = str(v.key, `${path}.key`);
  const when = obj(v.when, `${path}.when`);
  for (const [k, allowed] of Object.entries(when)) {
    oneOf(k, CONTEXT_KEYS, `${path}.when key`);
    if (arr(allowed, `${path}.when.${k}`).length === 0) fail(`${path}.when.${k}`, 'must not be empty');
  }
  bilingual(v.q, `${path}.q`);
  const n = options(v.opts, `${path}.opts`);

  const scores = arr(v.s, `${path}.s`);
  if (scores.length !== n) fail(`${path}.s`, 'must have one score per option');
  let scored = 0;
  scores.forEach((s, i) => {
    if (s === null) return;
    const value = num(s, `${path}.s[${i}]`);
    if (value < 0 || value > 1) fail(`${path}.s[${i}]`, 'must be between 0 and 1');
    scored++;
  });
  if (scored === 0) fail(`${path}.s`, 'must score at least one option');

  const pin = arr(v.pin, `${path}.pin`);
  pin.forEach((k, i) => {
    const index = num(k, `${path}.pin[${i}]`);
    if (!Number.isInteger(index) || index < 0 || index >= n) fail(`${path}.pin[${i}]`, 'must be an option index');
    if (pin.indexOf(k) !== i) fail(`${path}.pin`, 'must not repeat an option');
  });

  const effective = v.load === undefined ? itemLoad : loads(v.load, `${path}.load`);
  if (area !== 'G' && !Object.hasOwn(effective, area)) fail(`${path}.load`, `must load on its own sector ${area}`);

  if (v.tier !== undefined) {
    const tier = arr(v.tier, `${path}.tier`);
    if (tier.length !== n) fail(`${path}.tier`, 'must have one tier per option');
    tier.forEach((t, i) => oneOf(t, TIER_IDS, `${path}.tier[${i}]`));
  }
  if (v.mgr !== undefined) {
    const mgr = arr(v.mgr, `${path}.mgr`);
    if (mgr.length !== n) fail(`${path}.mgr`, 'must have one value per option');
    mgr.forEach((m, i) => {
      if (m !== 0 && m !== 1) fail(`${path}.mgr[${i}]`, 'must be 0 or 1');
    });
  }
  return key;
}

/** Validates a parsed bank and returns the same object, typed. Throws EngineError on the first problem. */
export function parseBank(raw: unknown): Bank {
  const b = obj(raw, 'root');
  str(b.name, 'name');
  str(b.bank_version, 'bank_version');
  str(b.status, 'status');

  const areas = obj(b.areas, 'areas');
  sameKeys(areas, AREA_IDS, 'areas');
  for (const a of AREA_IDS) {
    bilingual(areas[a], `areas.${a}`);
    str(obj(areas[a], `areas.${a}`).tick, `areas.${a}.tick`);
  }

  const order = arr(b.order, 'order');
  if (order.length !== AREA_IDS.length || !AREA_IDS.every((a) => order.includes(a))) {
    fail('order', 'must list each of the five sectors once');
  }

  const section = obj(b.section, 'section');
  sameKeys(section, SECTION_IDS, 'section');
  for (const s of SECTION_IDS) bilingual(section[s], `section.${s}`);

  const roles = arr(b.roles, 'roles');
  const roleIds = roles.map((r, i) => {
    bilingual(r, `roles[${i}]`);
    return oneOf(obj(r, `roles[${i}]`).id, ROLE_IDS, `roles[${i}].id`);
  });
  if (new Set(roleIds).size !== roleIds.length) fail('roles', 'must not repeat a role');

  const ages = arr(b.ages, 'ages');
  if (ages.length === 0) fail('ages', 'must not be empty');
  ages.forEach((a, i) => bilingual(a, `ages[${i}]`));

  const baseQ = obj(b.baseQ, 'baseQ');
  bilingual(baseQ.age, 'baseQ.age');
  bilingual(baseQ.role, 'baseQ.role');

  const fieldIds = arr(b.fieldIds, 'fieldIds');
  fieldIds.forEach((f, i) => oneOf(f, FIELD_IDS, `fieldIds[${i}]`));
  const moneyIds = arr(b.moneyIds, 'moneyIds');
  moneyIds.forEach((m, i) => oneOf(m, MONEY_IDS, `moneyIds[${i}]`));

  const extra = obj(b.extra, 'extra');
  sameKeys(extra, roleIds, 'extra');
  for (const role of roleIds) {
    arr(extra[role], `extra.${role}`).forEach((q, i) => {
      const path = `extra.${role}[${i}]`;
      const question = obj(q, path);
      const id = str(question.id, `${path}.id`);
      bilingual(question.q, `${path}.q`);
      const n = options(question.opts, `${path}.opts`);
      if (id === 'field' && n !== fieldIds.length) fail(`${path}.opts`, 'must match fieldIds');
      if (id === 'money' && n !== moneyIds.length) fail(`${path}.opts`, 'must match moneyIds');
    });
  }

  const items = obj(b.items, 'items');
  for (const [id, rawItem] of Object.entries(items)) {
    const path = `items.${id}`;
    const item = obj(rawItem, path);
    const area = oneOf(item.area, SECTION_IDS, `${path}.area`);
    const itemLoad = loads(item.load, `${path}.load`);
    const versions = arr(item.versions, `${path}.versions`);
    if (versions.length === 0) fail(`${path}.versions`, 'must not be empty');
    const keys = versions.map((v, i) => version(v, area, itemLoad, `${path}.versions[${i}]`));
    if (new Set(keys).size !== keys.length) fail(`${path}.versions`, 'must not repeat a key');
  }

  const comp = obj(b.comp, 'comp');
  sameKeys(comp, roleIds, 'comp');
  const known = (id: unknown, path: string): void => {
    if (typeof id !== 'string' || !Object.hasOwn(items, id)) fail(path, 'must be the id of a question');
  };
  for (const role of roleIds) {
    const seen = new Set<string>();
    const once = (id: unknown, path: string): void => {
      known(id, path);
      if (seen.has(id as string)) fail(path, 'appears twice in the same questionnaire');
      seen.add(id as string);
    };
    arr(comp[role], `comp.${role}`).forEach((slot, i) => {
      const path = `comp.${role}[${i}]`;
      if (!Array.isArray(slot)) return once(slot, path);
      oneOf(slot[1], CONTEXT_KEYS, `${path}[1]`);
      if (slot[0] === 'alt' && slot.length === 5) {
        once(slot[3], `${path}[3]`);
        once(slot[4], `${path}[4]`);
        // Both branches must sit in the same sector, so the sector's question count is the
        // same whichever branch is asked.
        const areaOf = (id: string): unknown => obj(items[id], `items.${id}`).area;
        if (areaOf(slot[3]) !== areaOf(slot[4])) fail(path, 'must choose between two questions of one sector');
      } else if (slot[0] === 'skip' && slot.length === 4) {
        once(slot[3], `${path}[3]`);
      } else {
        fail(path, 'must be a question id, an alt slot or a skip slot');
      }
    });
  }

  const timing = obj(b.timing, 'timing');
  for (const k of ['en', 'zh', 'tmin', 'tmax', 'floor']) num(timing[k], `timing.${k}`);

  return raw as Bank;
}

// deepFreeze lives in ../freeze. It is exported from here too because the bank was its first user.
export { deepFreeze } from '../freeze';
