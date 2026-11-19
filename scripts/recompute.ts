/**
 * npm run recompute -- --algo N [--norm X] [--write] [--json] [--day YYYY-MM-DD] [--set path=value ...]
 *
 * Scores every completed check in the database again with algorithm N (and norm X) and prints
 * the old overall prices against the new ones: how many checks, the rank correlation, the
 * share of people moving more than 5 points, the largest moves. The database is the one in
 * DATABASE_URL, or the local embedded database when it is not set.
 *
 *   --algo N       Algorithm version to score with. Required.
 *   --norm X       Norm version to score with. Default: the norm in force.
 *   --write        Store the new results next to the old ones (never overwriting) and log the
 *                  version change for the chart. Without it nothing is written.
 *   --day D        With --write: the day the change takes effect on the chart. Default today (UTC).
 *   --json         Print the report as JSON.
 *   --set p=v      Try out an altered algorithm without touching the code: registers version N
 *                  as the current parameters with the value at path p replaced by v, for this
 *                  run only. N must not be a registered version. Can be given several times.
 *                  Example: --algo 99 --set timing.multiplierFloor=1
 *                  --write is refused with --set: a version that exists only on a command
 *                  line could not be recomputed later.
 *
 * The comparison itself is src/server/recompute.ts, which has the unit tests.
 */
import { readEnv } from '../src/server/env';
import { isDay } from '../src/server/http';
import { formatRecomputeReport, recompute } from '../src/server/recompute';
import { parseArgs, rejectUnknown } from './lib/args';
import { openScriptDb, runCommand } from './lib/db';
import { registerTrialAlgo } from './lib/variant';

await runCommand(async () => {
  const args = parseArgs(process.argv.slice(2));
  rejectUnknown(args, ['algo', 'norm', 'write', 'json', 'day', 'set']);
  const algo = Number(args.value('algo'));
  if (!args.has('algo') || !Number.isInteger(algo) || algo < 1) {
    throw new Error('usage: npm run recompute -- --algo N [--norm X] [--write] [--json] [--day YYYY-MM-DD] [--set path=value]');
  }
  const day = args.value('day');
  if (day !== undefined && !isDay(day)) throw new Error('--day must be a date written YYYY-MM-DD');
  const write = args.has('write');

  const overrides = args.values('set');
  if (overrides.length > 0) {
    if (write) throw new Error('--write is refused with --set. Add the version to src/engine and register it, then run again.');
    registerTrialAlgo(algo, overrides);
  }

  const opened = await openScriptDb(readEnv());
  try {
    const report = await recompute(opened.db, { algo, norm: args.value('norm'), write, now: new Date(), effectiveDay: day });
    if (args.has('json')) {
      console.log(JSON.stringify({ database: opened.label, overrides, ...report }, null, 2));
    } else {
      console.log(`Database: ${opened.label}`);
      if (overrides.length > 0) console.log(`Trial algorithm ${algo}: current parameters with ${overrides.join(', ')}`);
      console.log(formatRecomputeReport(report));
    }
  } finally {
    await opened.close();
  }
});
