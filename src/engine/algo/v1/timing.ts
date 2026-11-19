// Answer time. An answer counts in full unless it came faster than a person could glance at
// the stem. The caller measures the seconds; the engine never reads a clock.

import type { Lang, TimingParams } from '../../types';

// CJK Unified Ideographs, U+4E00 to U+9FFF, the range the reference counts.
const HAN_CHARACTER = /[\u4e00-\u9fff]/g;
const LATIN_RUN = /[A-Za-z0-9$,.%]+/g;
const WHITESPACE = /\s+/;
const SECONDS_PER_MINUTE = 60;

/**
 * Reading units of a stem. English: words. Chinese: Han characters plus runs of Latin letters,
 * digits and the signs $ , . % (so "$2,000" is one unit).
 *
 * A blank English string has 0 units, as in read_units of reference/python/items2.py (the
 * test page gives 1; the threshold is the minimum either way). Words are split on JavaScript
 * whitespace, as on the test page. Python's str.split differs from it on a few control
 * characters (U+001C to U+001F, U+0085) and on U+FEFF; no stem of the bank contains one.
 */
export function readUnits(text: string, lang: Lang): number {
  if (lang === 'en') {
    const trimmed = text.trim();
    return trimmed === '' ? 0 : trimmed.split(WHITESPACE).length;
  }
  return (text.match(HAN_CHARACTER) ?? []).length + (text.match(LATIN_RUN) ?? []).length;
}

/** Seconds below which an answer to this stem counts at reduced weight. */
export function thresholdFor(text: string, lang: Lang, params: TimingParams): number {
  const perSecond = params.scanPerMinute[lang] / SECONDS_PER_MINUTE;
  return Math.max(params.thresholdMinSeconds, Math.min(params.thresholdMaxSeconds, readUnits(text, lang) / perSecond));
}

/** Weight multiplier of an answer given in `secs` seconds. An answer that was not timed counts in full. */
export function multiplierFor(secs: number | null, threshold: number, params: TimingParams): number {
  if (secs === null) return 1;
  return Math.max(params.multiplierFloor, Math.min(1, secs / threshold));
}
