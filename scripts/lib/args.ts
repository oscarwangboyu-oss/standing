/**
 * Command line flags for the scripts in this directory. `--name value` and `--name=value` set
 * a value, a bare `--name` is a switch, and a flag given several times keeps every value.
 */
export interface Args {
  /** True when the switch was given (with or without a value). */
  has(name: string): boolean;
  /** The last value given for a flag, or undefined. */
  value(name: string): string | undefined;
  /** Every value given for a flag. */
  values(name: string): string[];
  /** Flags that are not in the list of known names. */
  unknown(known: readonly string[]): string[];
}

export function parseArgs(argv: readonly string[]): Args {
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const name = eq < 0 ? arg.slice(2) : arg.slice(2, eq);
    const list = flags.get(name) ?? [];
    if (eq >= 0) {
      list.push(arg.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      list.push(argv[i + 1]);
      i += 1;
    }
    flags.set(name, list);
  }
  return {
    has: (name) => flags.has(name),
    value: (name) => flags.get(name)?.at(-1),
    values: (name) => flags.get(name) ?? [],
    unknown: (known) => [...flags.keys()].filter((name) => !known.includes(name)),
  };
}

/** Stops the script with a message when a flag is not known, so a typo is not silently ignored. */
export function rejectUnknown(args: Args, known: readonly string[]): void {
  const unknown = args.unknown(known);
  if (unknown.length > 0) {
    throw new Error(`unknown option ${unknown.map((n) => `--${n}`).join(', ')}. Known: ${known.map((n) => `--${n}`).join(', ')}`);
  }
}
