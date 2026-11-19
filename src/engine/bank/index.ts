// The item banks shipped with the app. A bank is content: question texts, options, scores,
// loads and the question sequence of each role. Old banks stay here so old sessions can be
// recomputed. To change a question, copy the newest file to a new version and register it in
// registry.ts.

import raw21 from './v2_1.json';
import { deepFreeze, parseBank } from './validate';
import type { Bank } from '../types';

/** Bank 2.1: 42 questions, 93 versions, 11 roles. A copy of reference/bank_v2.1.json. */
export const BANK_V2_1: Bank = deepFreeze(parseBank(raw21));

export { parseBank } from './validate';
