// What the four micro-app modules share: the view of the full check in force, and the shape
// of what each module hands to compute.

import type { AreaId, Context, Extra, Override, Step } from '../types';

/** The full check in force on a day, as the micro-app rules read it. */
export interface CheckView {
  /** Day number of the check (see days.ts). */
  dayNumber: number;
  bankVersion: string;
  /** Routing context from the background answers. tier and mgr are not set here. */
  context: Context;
  /** Sectors the person did not consent to. */
  excluded: ReadonlySet<AreaId>;
  /** The stored step of a question, or undefined when the check has none. */
  stepOf(id: string): Step | undefined;
}

/** What a micro app adds to the input of compute on one day. */
export interface LiveContribution {
  overrides: Override[];
  extras: Extra[];
}

export function option(value: unknown, count: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;
}
