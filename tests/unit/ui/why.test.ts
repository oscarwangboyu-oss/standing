/**
 * "Why it moved" after a retake in another situation: the line that no single answer accounts
 * for says what changed and comes last, and a question asked in another wording before shows
 * "Asked another way" in place of an option of that other wording. Both sheets: the result's
 * (between two checks) and the market's (between two days).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CURRENT, breakdown, getBank, type Breakdown, type ComputeInput } from '@/engine';
import type { BreakdownResponse, DayBreakdownResponse } from '@/shared/api';
import { moved, roleNames } from '@/copy/market';
import { why } from '@/copy/result';
import { MoveBreakdown, situationNote as daySituation } from '@/ui/market/MoveBreakdown';
import { WhySheet, orderLines, situationNote } from '@/ui/result/WhySheet';
import { backgroundFor, walk } from '../engine/helpers';

const bank = getBank();
const emp = backgroundFor('emp', {}, 2);
const ug4 = backgroundFor('ug4', {}, 0);
const middle = walk(emp, () => 2);
const before: ComputeInput = { bank, background: emp, steps: walk(emp, (q) => q.index % q.version.opts.length) };
const after: ComputeInput = { bank, background: ug4, steps: walk(ug4, (q) => (q.index + 1) % q.version.opts.length) };
const retake = breakdown(before, after);

const end = (sessionId: string, at: string) => ({ sessionId, at, versions: { ...CURRENT }, overall: null });
const response = (b: Breakdown): BreakdownResponse => ({ from: end('a', '2026-11-01T12:00:00.000Z'), to: end('b', '2026-11-19T12:00:00.000Z'), breakdown: b });

/** The text of every line of the sheet, in order, tags removed. */
function lineTexts(html: string): string[] {
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

const unescape = (text: string) => text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function option(id: string, key: string, k: number): string {
  return bank.items[id].versions.find((v) => v.key === key)!.opts[k].en;
}

describe('the line "other" after a retake in another situation', () => {
  it('says what changed, then why part of the move has no single answer', () => {
    const note = situationNote(retake.cohorts, retake.overall.lines, bank, bank);
    expect(note).toEqual({
      title: "Your situation changed from employed full-time to bachelor's student. Your age band was 25 to 29 and is now 18 to 20.",
      detail: 'Some questions were asked another way, so part of the move cannot be put on one answer.',
    });
    expect(daySituation(retake.cohorts, retake.overall.lines)).toEqual(note);
  });

  it('names the age band alone when only that changed, and says nothing when neither did', () => {
    const older = breakdown({ bank, background: emp, steps: middle }, { bank, background: { ...emp, age: 3 }, steps: middle });
    expect(situationNote(older.cohorts, older.overall.lines, bank, bank)).toEqual({ title: why.ageBand('25 to 29', '30 to 34'), detail: why.unassigned });
    const same = breakdown({ bank, background: emp, steps: middle }, { bank, background: emp, steps: middle, excludedAreas: ['B'] });
    expect(situationNote(same.cohorts, same.overall.lines, bank, bank)).toBeNull();
    expect(daySituation(same.cohorts, same.overall.lines)).toBeNull();
  });

  it('every situation has a short name', () => {
    for (const role of bank.roles) expect(roleNames[role.id], role.id).toMatch(/^[a-z]/);
  });

  it('orders answer lines largest first and the line "other" last', () => {
    const ordered = orderLines(retake.overall.lines);
    expect(ordered.at(-1)?.kind).toBe('other');
    const rest = ordered.slice(0, -1).map((l) => Math.abs(l.points));
    expect(rest).toEqual([...rest].sort((x, y) => y - x));
  });
});

describe('the result sheet', () => {
  const html = unescape(renderToStaticMarkup(createElement(WhySheet, { target: 'W', onClose: () => {}, state: 'ready', data: response(retake), onRetry: () => {} })));
  const lines = lineTexts(html);

  it('lists the situation change last, with what it means', () => {
    expect(lines.length).toBe(retake.sectors.W.lines.length);
    const last = lines.at(-1) as string;
    expect(last).toContain("Your situation changed from employed full-time to bachelor's student.");
    expect(last).toContain('Your age band was 25 to 29 and is now 18 to 20.');
    expect(last).toContain(why.reworded);
    expect(html).not.toContain(why.kinds.other);
  });

  it('shows "Asked another way" for an answer of another wording, and the new answer', () => {
    const w5 = retake.sectors.W.lines.find((l) => l.id === 'W5')!;
    expect(w5.before?.key).toBe('debt');
    expect(w5.after?.key).toBe('loans');
    const text = lines.find((l) => l.includes(bank.items.W5.versions.find((v) => v.key === 'loans')!.q.en)) as string;
    expect(text).toContain(`${why.before} ${why.askedAnotherWay}`);
    expect(text).toContain(`${why.now} ${option('W5', 'loans', w5.after!.k!)}`);
    expect(text).not.toContain(option('W5', 'debt', w5.before!.k!));
  });

  it('keeps the old option when the wording is the same', () => {
    const plain = breakdown({ bank, background: emp, steps: middle }, { bank, background: emp, steps: middle.map((s) => (s.id === 'B1' ? { ...s, k: 4 } : s)) });
    const body = unescape(renderToStaticMarkup(createElement(WhySheet, { target: 'B', onClose: () => {}, state: 'ready', data: response(plain), onRetry: () => {} })));
    expect(body).toContain(option('B1', 'base', 2));
    expect(body).not.toContain(why.askedAnotherWay);
    expect(body).not.toContain('Your situation changed');
  });

  it('keeps the plain line "other" when the two checks differ in something else', () => {
    const plain = breakdown({ bank, background: emp, steps: middle }, { bank, background: emp, steps: middle.map((s) => (s.id === 'B1' ? { ...s, k: 4 } : s)), excludedAreas: ['C'] });
    expect(plain.overall.lines.some((l) => l.kind === 'other')).toBe(true);
    const body = unescape(renderToStaticMarkup(createElement(WhySheet, { target: 'overall', onClose: () => {}, state: 'ready', data: response(plain), onRetry: () => {} })));
    expect(lineTexts(body).at(-1)).toContain(why.kinds.other);
  });
});

describe('the market sheet', () => {
  const data: DayBreakdownResponse = { from: '2026-11-18', to: '2026-11-19', breakdown: retake, prices: null };
  const html = unescape(renderToStaticMarkup(createElement(MoveBreakdown, { data, loading: false, error: false, onRetry: () => {}, areas: ['W'], limit: 5 })));
  const lines = lineTexts(html);

  it('lists the situation change last, and "Asked another way" for another wording', () => {
    const last = lines.at(-1) as string;
    expect(last).toContain(moved.situation("employed full-time", "bachelor's student"));
    expect(last).toContain(moved.reworded);
    expect(html).not.toContain(moved.other);
    const w5 = retake.sectors.W.lines.find((l) => l.id === 'W5')!;
    const text = lines.find((l) => l.includes(bank.items.W5.versions.find((v) => v.key === 'loans')!.q.en)) as string;
    expect(text).toContain(`${moved.before} ${moved.askedAnotherWay}`);
    expect(text).toContain(`${moved.after} ${option('W5', 'loans', w5.after!.k!)}`);
    expect(text).not.toContain(option('W5', 'debt', w5.before!.k!));
  });
});
