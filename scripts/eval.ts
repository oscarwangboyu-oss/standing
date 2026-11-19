/**
 * npm run eval -- [--algo N] [--norm X] [--set path=value ...] [--json]
 *
 * Prints the seven scoring tests over the data in the database in DATABASE_URL, or the local
 * embedded database when it is not set: range, stability, response, validity, fairness, gaming,
 * version effect. Reads only.
 *
 *   --algo N       Version effect: compare the versions in force with algorithm N, computed
 *                  now and not stored. Without it, stored results under another version are
 *                  used when there are any.
 *   --norm X       With --algo: the norm version to compare with. Default: the norm in force.
 *   --set p=v      With --algo: try an altered algorithm, as in `npm run recompute`.
 *   --json         Print the data counts and the seven results as JSON.
 *
 * A verdict is "pass", "warn" with the thresholds that were missed, or "insufficient_data"
 * below the minimum number of records. The thresholds are EVALUATION in src/engine/config.ts.
 * The tests are src/engine/evaluation.ts; the loading is scripts/lib/eval.ts.
 */
import { readEnv } from '../src/server/env';
import { parseArgs, rejectUnknown } from './lib/args';
import { openScriptDb, runCommand } from './lib/db';
import { formatSevenTests, loadEvalData, runSevenTests } from './lib/eval';
import { registerTrialAlgo } from './lib/variant';

await runCommand(async () => {
  const args = parseArgs(process.argv.slice(2));
  rejectUnknown(args, ['algo', 'norm', 'set', 'json']);
  let against: { algo: number; norm?: string } | undefined;
  if (args.has('algo')) {
    const algo = Number(args.value('algo'));
    if (!Number.isInteger(algo) || algo < 1) throw new Error('--algo must be an algorithm version number');
    const overrides = args.values('set');
    if (overrides.length > 0) registerTrialAlgo(algo, overrides);
    against = { algo, norm: args.value('norm') };
  } else if (args.has('norm') || args.has('set')) {
    throw new Error('--norm and --set need --algo');
  }

  const opened = await openScriptDb(readEnv());
  try {
    const data = await loadEvalData(opened.db, { against, now: new Date() });
    const results = runSevenTests(data);
    if (args.has('json')) {
      const { records: _records, retestPairs, consecutivePairs, versionPairs, ...counts } = data;
      console.log(
        JSON.stringify(
          {
            database: opened.label,
            ...counts,
            retestPairs: retestPairs.length,
            consecutivePairs: consecutivePairs.length,
            versionPairs: versionPairs.length,
            results,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`Database: ${opened.label}`);
      console.log(formatSevenTests(data, results));
    }
  } finally {
    await opened.close();
  }
});
