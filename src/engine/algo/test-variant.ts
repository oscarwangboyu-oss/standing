// TEST ONLY. Not a release, never registered by the app, never CURRENT.
//
// A copy of algorithm version 1 with one value changed (see TEST_VARIANT in config.ts): a
// sector takes half of its value from its own questions and half from the others. Tests and a
// dry run of the recompute command register it to prove two things: two algorithm versions
// give different results on the same stored steps, and registering a new version leaves the
// results of every old version exactly as they were.

import { ALGO_PARAMS, TEST_VARIANT } from '../config';
import { deepCopy } from '../freeze';
import type { Algo } from '../types';
import { createAlgoV1 } from './v1';

/** The test-only variant under the given version number (9001 unless told otherwise). Register it with registerAlgo. */
export function createTestVariantAlgo(version: number = TEST_VARIANT.version): Algo {
  const params = deepCopy(ALGO_PARAMS[1]);
  params.sector.ownShare = TEST_VARIANT.ownShare;
  params.sector.otherShare = TEST_VARIANT.otherShare;
  return createAlgoV1(version, params);
}
