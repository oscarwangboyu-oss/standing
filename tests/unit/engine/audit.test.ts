// Acceptance B and C.
// B: the rules of audit() in reference/python/items2.py (auditBank in helpers.ts), run on every
//    registered bank. Every situation is walked with every income answer (and, for employees,
//    with and without managing people). Zero problems. Planted problems prove each rule can fail.
// C: the best option everywhere gives 137.50 in every sector and overall.

import { describe, expect, it } from 'vitest';
import { BANKS, compute, contextOf, progressOf } from '../../../src/engine';
import type { Bank, ItemVersion, RoleId } from '../../../src/engine';
import { AREAS, auditBank, backgroundFor, bank, chooseBest, referenceCount, situations, walk, walkOn } from './helpers';

const STUDENTS: RoleId[] = ['ug4', 'cc', 'grad'];
const EXPECTED_SITUATIONS = 303;
// Printed by `python3 items2.py`: "situations walked: 303 | distinct questionnaires: 465".
const EXPECTED_QUESTIONNAIRES = 465;

/** A copy of the shipped bank that a test may break. */
function copyOfBank(): Bank {
  return JSON.parse(JSON.stringify(bank)) as Bank;
}

const versionOf = (b: Bank, id: string, key: string): ItemVersion => b.items[id].versions.find((v) => v.key === key)!;

describe('audit of every path (items2.py audit)', () => {
  const all = situations();

  it('visits 303 situations', () => {
    expect(all).toHaveLength(EXPECTED_SITUATIONS);
    expect(new Set(all.map((s) => JSON.stringify(s.background))).size).toBe(EXPECTED_SITUATIONS);
    for (const { background, money, field, nowork } of all) {
      expect(contextOf(bank, background)).toEqual({ role: background.role, money, field, nowork, tier: null, mgr: 0 });
    }
  });

  it.each(Object.keys(BANKS))('bank %s: zero problems over every situation and every income answer', (version) => {
    const report = auditBank(BANKS[version]);
    expect(report.problems).toEqual([]);
    expect(report.situations).toBe(EXPECTED_SITUATIONS);
    expect(report.questionnaires).toBe(EXPECTED_QUESTIONNAIRES);
    // 303 situations times 6 or 7 income answers, twice for employees and gig workers.
    expect(report.walks).toBeGreaterThan(EXPECTED_SITUATIONS * 6);
  });

  it('the engine counts the questions the way count() of items2.py does', () => {
    for (const { background } of all) {
      const steps = walk(background, () => 0);
      const result = compute({ bank, background, steps });
      const progress = progressOf(bank, background, steps);
      expect(progress).toEqual({ asked: steps.length, total: steps.length, remaining: 0 });
      expect(result.counts.total).toBe(referenceCount(bank, result.context));
    }
  });

  // The audit must be able to fail. Each planted problem is caught by exactly the rule it is
  // aimed at. The problems live in copies; the shipped bank is frozen.
  const plants: Array<[string, (b: Bank) => void, string[]]> = [
    ['student', (b) => void (versionOf(b, 'N1', 'stu').when = { role: ['ug4'] }), ['student']],
    ['student asked for a degree', (b) => void b.comp.ug4.splice(2, 0, 'C_deg'), ['student']],
    ['retiree', (b) => void (versionOf(b, 'W6', 'ret').when = { role: ['owner'], tier: ['sup'] }), ['retiree']],
    [
      'retiree licence',
      (b) => {
        b.items.C_lic.versions[b.items.C_lic.versions.length - 1].when = {};
        b.comp.ret.splice(2, 0, 'C_lic');
      },
      ['retiree licence'],
    ],
    ['carer', (b) => void b.comp.care.splice(14, 0, 'N5'), ['carer']],
    ['owner credential', (b) => void b.comp.owner.splice(4, 0, 'C_deg'), ['owner credential']],
    ['high tier', (b) => void (versionOf(b, 'W6', 'high').when = { tier: ['low'] }), ['high tier']],
    ['loans', (b) => void versionOf(b, 'W5', 'loans').when.role!.push('emp'), ['loans']],
    ['student N1', (b) => void versionOf(b, 'N1', 'stu').when.role!.push('ret'), ['student N1']],
    ['no work', (b) => void (b.comp.seek[0] = 'C_last'), ['no work']],
    ['incomplete', (b) => void (b.items.B1.versions[0].opts[0].en = ''), ['incomplete']],
    ['score out of range', (b) => void (b.items.B1.versions[0].s[1] = 1.5), ['score out of range']],
    // Math.min() of nothing is Infinity, so this needs its own rule. items2.py raises on min([]).
    ['no scored option', (b) => void (b.items.B4.versions[0].s = b.items.B4.versions[0].s.map(() => null)), ['no scored option']],
  ];

  it.each(plants)('a planted "%s" problem is caught', (_name, plant, expected) => {
    const broken = copyOfBank();
    plant(broken);
    const found = auditBank(broken);
    expect(found.problems.length).toBeGreaterThan(0);
    expect(found.kinds).toEqual(expected);
  });

  it('the count rule catches a skip slot that depends on a later answer (56 problems, as items2.py reports)', () => {
    // tier is set at W1, and C_pur comes before W1. The engine asks C_pur, and the final
    // context says it should have been left out. Patching COMP_C["emp"] the same way in
    // items2.py gives "56 problems, kinds: ['count']". A rule that compares the walk with the
    // engine's own total cannot see this, which is why the count comes from the bank.
    const broken = copyOfBank();
    broken.comp.emp[broken.comp.emp.indexOf('C_pur')] = ['skip', 'tier', 'high', 'C_pur'];
    const found = auditBank(broken);
    expect(found.kinds).toEqual(['count']);
    expect(found.problems).toHaveLength(56);
    // The engine's own view of the same walk is consistent with itself, and so blind to it.
    const background = backgroundFor('emp');
    const steps = walkOn(broken, background, (q) => q.version.opts.length - 1);
    expect(progressOf(broken, background, steps).remaining).toBe(0);
    expect(compute({ bank: broken, background, steps }).context.tier).toBe('high');
    expect(steps.map((s) => s.id)).toContain('C_pur');
  });

  it('what the brief promises each group', () => {
    // Students are not asked years of work, licences or degrees.
    for (const role of STUDENTS) {
      expect(bank.extra[role].map((q) => q.id)).not.toContain('stage');
      expect(bank.extra[role].map((q) => q.id)).not.toContain('exp');
    }
    for (const { background, money } of all) {
      const ids = walk(background, chooseBest).map((s) => s.id);
      const keys = Object.fromEntries(walk(background, chooseBest).map((s) => [s.id, s.key]));
      if (STUDENTS.includes(background.role)) {
        expect(ids).not.toContain('C_lic');
        expect(ids).not.toContain('C_deg');
      }
      // Owners are not asked about degrees.
      if (background.role === 'owner') expect(ids).not.toContain('C_deg');
      // Retirees are asked about guiding younger people, not about having a mentor.
      if (background.role === 'ret') expect(keys.N5).toBe('ret');
      // The best income answer leads to the high tier (unless money is support): saving share, not debt share.
      if (background.role !== 'ret' && !STUDENTS.includes(background.role) && money !== 'sup') {
        expect(keys.W5).toBe('save');
      }
      // Questionnaires have 31 to 34 questions.
      expect(ids.length).toBeGreaterThanOrEqual(31);
      expect(ids.length).toBeLessThanOrEqual(34);
    }
  });
});

describe('best option everywhere', () => {
  // The situations of extremes() in items2.py: students supported by family, everyone else on own earnings.
  const extremes = bank.roles.map((role) => {
    const money = STUDENTS.includes(role.id) ? 'sup' : 'own';
    return situations().find((s) => s.background.role === role.id && s.money === money)!;
  });

  it.each(extremes.map((s) => [s.background.role, s] as const))('%s: 137.50 in every sector and overall', (_role, s) => {
    const steps = walk(s.background, chooseBest);
    const result = compute({ bank, background: s.background, steps });
    for (const a of AREAS) {
      expect(result.sectors[a].status).toBe('listed');
      expect(result.sectors[a].price).toBeCloseTo(137.5, 9);
      expect(result.sectors[a].raw).toBeCloseTo(1, 12);
    }
    expect(result.overall).toBeCloseTo(137.5, 9);
    expect(result.overallFullWeight).toBeCloseTo(137.5, 9);
    expect((result.overall as number).toFixed(2)).toBe('137.50');
    expect(result.flags).toEqual([{ id: 'f9', points: 1 }]);
  });

  it('covers all 11 roles', () => {
    expect(extremes.map((s) => s.background.role).sort()).toEqual([...bank.roles.map((r) => r.id)].sort());
  });

  it('"best" is the highest score, not the last option', () => {
    const sleep = bank.items.B3.versions[0];
    expect(chooseBest({ id: 'B3', key: 'base', version: sleep, section: 'B', index: 0, total: 1 }, [])).toBe(3);
    expect(sleep.s[3]).toBe(1);
    expect(sleep.s[4]).toBeLessThan(1);
    const interest = bank.items.C_int.versions[0];
    expect(interest.pin).toEqual([0]);
    expect(interest.s[0]).toBe(0);
    // Choosing the last option everywhere is not the best result.
    const s = extremes[0];
    const last = compute({ bank, background: s.background, steps: walk(s.background, (q) => q.version.opts.length - 1) });
    expect(last.sectors.B.price as number).toBeLessThan(137.5);
  });

  it('holds in every situation except non-students who live on support (bank 2.1)', () => {
    const below: string[] = [];
    for (const s of situations()) {
      const result = compute({ bank, background: s.background, steps: walk(s.background, chooseBest) });
      const top = AREAS.every((a) => Math.abs((result.sectors[a].price as number) - 137.5) <= 1e-9);
      const exception = s.money === 'sup' && !STUDENTS.includes(s.background.role);
      // In bank 2.1 a non-student on support stays in the "sup" tier, where the best wealth
      // options score below 1. Reported to the team; see the engine report.
      if (top === exception) below.push(`${s.background.role}/${s.money}/${s.field}: ${result.overall}`);
    }
    expect(below).toEqual([]);
  });
});
