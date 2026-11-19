// Freezing and copying of plain data. The engine keeps its shared tables (bank, parameters,
// norms, bands) frozen, so that one stray write cannot change every later result computed
// under an unchanged version number.

/** Freezes an object and everything inside it. Returns the same object. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** A deep copy of plain data: objects, arrays, numbers, strings, booleans and null. */
export function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map((inner) => deepCopy(inner)) as T;
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) copy[key] = deepCopy(inner);
    return copy as T;
  }
  return value;
}
