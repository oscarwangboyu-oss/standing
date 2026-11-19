/**
 * A trial algorithm for the recompute command: the parameters in force with a few values
 * replaced, registered under an unused version number for one run. This is how the team sees
 * what a change would do to all past results before it is written into src/engine/config.ts.
 */
import { ALGO_PARAMS, ALGOS, CURRENT, createAlgoV1, registerAlgo, type Algo } from '../../src/engine';

/** Replaces the value at a dotted path of a parameter object. The path must hold a number or a switch. */
export function setAtPath(target: Record<string, unknown>, path: string, raw: string): void {
  const keys = path.split('.');
  let node: Record<string, unknown> = target;
  for (const key of keys.slice(0, -1)) {
    const next = Object.hasOwn(node, key) ? node[key] : undefined;
    if (typeof next !== 'object' || next === null) throw new Error(`--set ${path}: "${key}" is not a group of parameters`);
    node = next as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  const before = Object.hasOwn(node, last) ? node[last] : undefined;
  if (typeof before === 'number') {
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) throw new Error(`--set ${path}: "${raw}" is not a number`);
    node[last] = value;
  } else if (typeof before === 'boolean') {
    if (raw !== 'true' && raw !== 'false') throw new Error(`--set ${path}: use true or false`);
    node[last] = raw === 'true';
  } else {
    throw new Error(`--set ${path}: no number or switch at this path`);
  }
}

/**
 * Registers algorithm `version` as the parameters in force with each `path=value` applied.
 * The version number must be unused. The registration lasts for this process only.
 */
export function registerTrialAlgo(version: number, overrides: readonly string[]): Algo {
  if (Object.hasOwn(ALGOS, version)) throw new Error(`--set needs an unused version number. Algorithm ${version} is registered.`);
  const params = structuredClone(ALGO_PARAMS[CURRENT.algo]);
  for (const override of overrides) {
    const eq = override.indexOf('=');
    if (eq < 1) throw new Error(`--set takes path=value, got "${override}"`);
    setAtPath(params as unknown as Record<string, unknown>, override.slice(0, eq), override.slice(eq + 1));
  }
  return registerAlgo(createAlgoV1(version, params));
}
