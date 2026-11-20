/**
 * Text of the team dashboard (/team). Read by the team only.
 * Rules (CLAUDE.md): short declarative sentences, concrete numbers, no em dashes,
 * no exclamation marks, nothing invented. Every share is printed with its counts.
 */
import type { RoleId } from '@/engine';
import type { MicroApp, ReportSection, TeamGateId } from '@/shared/api';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const team = {
  metaTitle: 'Team dashboard',
  title: 'Team dashboard',
  lead: 'Read only. Totals only: no screen here shows one person.',

  gate: {
    title: 'Team dashboard',
    lead: 'Read only, totals only. Enter the team passphrase to open it.',
    label: 'Team passphrase',
    hint: 'Kept in memory only. Reloading the page asks for it again.',
    submit: 'Open the dashboard',
    checking: 'Checking',
    empty: 'Enter the passphrase.',
    wrong: 'That passphrase is not right.',
    closedTitle: 'The dashboard is closed',
    closed: 'No team passphrase is set on this server. Set ADMIN_PASSPHRASE and restart to open it.',
    offline: 'No connection. Try again when you are back online.',
    failed: 'The server did not answer. Try again in a minute.',
    lock: 'Lock',
  },

  demo: {
    title: 'Simulated data',
    /** "These numbers include 330 simulated people and 393 simulated checks ..." */
    text: (people: number, checks: number | null) =>
      `These numbers include ${plural(people, 'simulated person', 'simulated people')}${
        checks === null ? '' : ` and ${plural(checks, 'simulated check', 'simulated checks')}`
      } made by the local demo script. Do not read them as real.`,
  },

  meta: {
    /** "Read Nov 19, 2026, 1:38 PM" */
    generated: (at: string) => `Read ${at}`,
    versions: (algo: number, bank: string, norm: string) => `Algorithm ${algo}. Question bank ${bank}. Norm ${norm}.`,
    refresh: 'Read again',
    sections: 'Sections',
  },

  common: {
    csv: 'CSV',
    /** Accessible name of a CSV button. */
    csvFor: (table: string) => `Download ${table} as CSV`,
    csvFailed: 'The CSV could not be downloaded.',
    loading: 'Loading',
    failed: 'This table could not be loaded.',
    retry: 'Try again',
    noData: 'No data',
    noRows: 'No rows yet.',
    /** "276 of 330" */
    of: (count: number, of: number) => `${count} of ${of}`,
    /** Under a table with figures drawn lighter. */
    smallNote: (n: number) => `Lighter figures rest on fewer than ${n} records. They are printed count first and never marked red.`,
    /** "+25", "−3", "+2.1". A plain sign: these are counts and shares, not prices. */
    signed: (delta: number, digits = 0) =>
      delta > 0 ? `+${delta.toFixed(digits)}` : delta < 0 ? `\u2212${Math.abs(delta).toFixed(digits)}` : (0).toFixed(digits),
    /** In place of the figures of a cohort that is too small to show. */
    heldBack: (n: number) => `Fewer than ${n} people. The figures are held back, so that no one person can be read from them.`,
    heldBackShort: 'Held back',
    allRoles: 'All roles',
    allAges: 'All ages',
    everyone: 'Everyone',
    role: 'Role',
    age: 'Age band',
    total: 'Total',
    on: 'On',
    off: 'Off',
    ladder: 'Ladder',
    /** Under a table that scrolls sideways on a narrow screen. */
    scroll: 'The table scrolls sideways.',
  },

  /** Short role names for table rows. The full wording of each role is in the question bank. */
  roles: {
    ug4: "Bachelor's student",
    cc: 'Community college',
    grad: 'Graduate student',
    emp: 'Employed full-time',
    gig: 'Part-time or gig work',
    free: 'Freelance',
    owner: 'Business owner',
    seek: 'Looking for work',
    care: 'Caring for family',
    ret: 'Retired',
    oth: 'Other',
  } satisfies Record<RoleId, string>,

  nav: {
    attention: 'Attention',
    gates: 'Gates',
    overview: 'Overview',
    items: 'Questions',
    prices: 'Prices',
    norms: 'Norms',
    returns: 'Returns',
    apps: 'Micro apps',
    tests: 'Scoring tests',
    report: 'Result page',
  },

  attention: {
    title: 'Needs attention',
    /** "1 gate not met. 46 question versions over a red line. No scoring test warns." */
    summary: (gates: number, versions: number, tests: number) =>
      [
        gates === 0 ? 'Every gate with data is met.' : `${plural(gates, 'gate', 'gates')} not met.`,
        versions === 0
          ? 'No question version is over a red line.'
          : `${plural(versions, 'question version', 'question versions')} over a red line.`,
        tests === 0 ? 'No scoring test warns.' : `${plural(tests, 'scoring test warns', 'scoring tests warn')}.`,
      ].join(' '),
    gates: 'Gates not met',
    gatesNone: 'Every gate with data is met.',
    /** "12.7% against 10% or less" */
    against: (actual: string, line: string) => `${actual} against ${line}`,
    questions: 'Question versions with the most breaches',
    /** "Top 5 of 46 over a red line. All roles." */
    questionsLead: (shown: number, red: number) => `${shown} of the ${plural(red, 'version', 'versions')} over a red line, all roles.`,
    questionsNone: 'No question version is over a red line.',
    /** Link to the question table. */
    questionsAll: (n: number) => `All ${n} in the question table`,
    tests: 'Scoring tests that warn',
    testsNone: 'No scoring test warns.',
    /** "4 of 7 tests have too little data for a verdict." */
    testsShort: (n: number, of: number) => `${n} of ${of} tests ${n === 1 ? 'has' : 'have'} too little data for a verdict.`,
    failed: 'This part could not be loaded.',
  },

  gates: {
    title: 'Stage gates',
    table: 'the gates',
    stage1: 'Stage 1, Check',
    stage1Rule: 'Move on when 70% finish, no question is skipped by over 10% and the retest correlation is 0.75 or more.',
    stage2: 'Stage 2, Daily',
    stage2Rule: 'Move on when 25% come back on day 7 and 12% on day 30.',
    met: 'Met',
    notMet: 'Not met',
    noData: 'No data yet',
    /** Next to "2 of 3 met" in a stage header. */
    notMetCount: (n: number) => `${n} not met`,
    /** Under the skip-rate gate. */
    skipRule: (n: number) => `Only versions shown to ${n} or more checks count.`,
    skipNone: (n: number) => `No version has been shown to ${n} checks yet.`,
    actual: 'Actual',
    gate: 'Gate',
    /** "70% or more", "10% or less" */
    atLeast: (value: string) => `${value} or more`,
    atMost: (value: string) => `${value} or less`,
    fromBrief: 'From the brief, not the roadmap deck.',
    /** "Most skipped: C_lic/oth" */
    mostSkipped: (id: string) => `Most skipped: ${id}`,
    /** "C_lic/oth, skipped in 2 of 7 checks". A small second number makes the share noisy. */
    skippedIn: (id: string, count: number, of: number) => `${id}, skipped in ${count} of ${of} ${of === 1 ? 'check' : 'checks'}`,
    pairs: (n: number) => plural(n, 'pair', 'pairs'),
    names: {
      completion_rate: 'Finish rate',
      max_item_skip_rate: 'Highest skip rate of one question',
      retest_correlation: 'Retest correlation',
      day7_return: 'Back on day 7',
      day30_return: 'Back on day 30',
      payday_share: 'Payday Check share',
    } satisfies Record<TeamGateId, string>,
    details: {
      completion_rate: 'People who completed a check, of people who started one.',
      max_item_skip_rate: 'The most skipped question version, over all roles.',
      retest_correlation: 'Overall price of the same person in two checks 10 to 21 days apart.',
      day7_return: 'People with a visit on day 7 after their first check, of those whose day 7 has passed.',
      day30_return: 'People with a visit on day 30 after their first check, of those whose day 30 has passed.',
      payday_share: 'Active people the Payday Check is offered to who recorded one in the last 30 days.',
    } satisfies Record<TeamGateId, string>,
  },

  overview: {
    title: 'Overview',
    table: 'started and completed',
    checksStarted: 'Checks started',
    checksCompleted: 'Checks completed',
    checkRate: 'Completion rate, checks',
    peopleStarted: 'People who started',
    peopleCompleted: 'People who completed',
    peopleRate: 'Completion rate, people',
    retestPairs: 'Retest pairs',
    retest: 'Retest correlation',
    /** "One pair per person, 10 to 21 days apart." */
    retestWindow: (min: number, max: number) => `One pair per person, ${min} to ${max} days apart.`,
    recentTitle: (days: number) => `Last ${days} days`,
    recentLead: (days: number) =>
      `Checks started in the last ${days} days, against the ${days} days before. Completed counts those finished by now.`,
    finishRate: 'Finish rate',
    /** "30 of 31 people" */
    ofPeople: (count: number, of: number) => `${count} of ${of} ${of === 1 ? 'person' : 'people'}`,
    /** "+25 from 6" */
    from: (delta: string, before: string) => `${delta} from ${before}`,
    /** "+13.5 points from 83.3%" */
    pointsFrom: (delta: string, before: string) => `${delta} points from ${before}`,
    sameAs: (before: string) => `Same as before, ${before}`,
    noneBefore: (days: number) => `None in the ${days} days before`,
    allTime: 'All time',
    byRole: 'By role',
    caption: 'Checks and people, started and completed, by role',
    started: 'Started',
    completed: 'Completed',
    rate: 'Rate',
    checks: 'Checks',
    people: 'People',
  },

  items: {
    title: 'Questions',
    table: 'the question table',
    /** "Bank 2.1. One row per question version that was shown at least once." */
    lead: (bank: string) => `Question bank ${bank}. One row per question version that was shown at least once.`,
    filter: 'Role',
    onlyRed: 'Only rows over a red line',
    order: 'Most breaches first.',
    /** Under the first rows of a long table. */
    showAll: (n: number) => `Show all ${n} rows`,
    showFirst: (n: number) => `Show the first ${n} rows`,
    showing: (shown: number, of: number) => `Showing ${shown} of ${of}.`,
    /** On a phone card of a row under every line. */
    clear: 'Under every red line.',
    /** "55 question versions. 12 are over a red line." */
    summary: (rows: number, red: number) =>
      `${plural(rows, 'question version', 'question versions')}. ${red === 1 ? '1 is' : `${red} are`} over a red line.`,
    caption: 'Skip rate, drop-off, time, option spread, not applicable and retest change per question version',
    question: 'Question',
    shown: 'Shown',
    skip: 'Skip rate',
    dropOff: 'Drop-off',
    time: 'Median time',
    options: 'Option spread',
    notApplicable: 'Not applicable',
    retest: 'Retest change',
    seconds: (s: string) => `${s} s`,
    /** "Similar stems: 5.5 s (21)" */
    similar: (s: string, n: number) => `Similar stems: ${s} s (${n})`,
    noSimilar: (n: number) => `Too few similar stems (${n})`,
    answered: (n: number) => `${n} answered`,
    /** "1 marked, 0 by option" */
    naSplit: (marked: number, option: number) => `${marked} marked, ${option} by option`,
    optionLabel: (index: number, label: string, share: string, count: number) => `Option ${index}, ${label}: ${share}, ${count}`,
    stemMissing: 'Not in this bank',
    /** The words on a breach tag. A tag always carries a word. */
    red: {
      skip: (line: string) => `Over ${line}`,
      dropOff: (line: string) => `Over ${line}`,
      time: (times: number) => `Over ${times} times similar`,
      options: 'Uneven',
      notApplicable: (line: string) => `Over ${line}`,
      retest: (line: string) => `Over ${line}`,
    },
    linesTitle: 'Red lines',
    lines: (l: { skip: string; dropOff: string; times: number; max: string; min: string; na: string; retest: string }) => [
      `Skip rate over ${l.skip} of those who saw the question.`,
      `Drop-off over ${l.dropOff}: saw the question and never went on.`,
      `Median time over ${l.times} times that of questions with a stem of similar length.`,
      `One option over ${l.max}, or any option under ${l.min}.`,
      `Not applicable over ${l.na}: marked, or an option that is not scored.`,
      `Retest change over ${l.retest}: a different option in the second of two checks.`,
    ],
    definitions: (d: { idle: number; band: number; minSimilar: number; min: number; max: number }) =>
      `A check counts as dropped after ${d.idle} idle minutes. Stems within ${d.band} times each other in reading time count as similar, and at least ${d.minSimilar} are needed. Retests are ${d.min} to ${d.max} days apart.`,
    minRecords: (n: number) =>
      `A value is marked red only with ${n} or more records behind it: checks shown the question, answers, or retest pairs. Below that it is printed count first and lighter.`,
    /** What a breach says in the attention list. */
    breach: {
      /** The words of the option-spread tag in the attention list. */
      options: 'Uneven option spread',
      /** "One option at 95.0% of 296 answered": the share past its line, the largest or the smallest. */
      option: (share: string, answered: number) => `One option at ${share} of ${answered} answered`,
      pairs: (count: number, of: number) => `${count} of ${of} pairs`,
      /** "Similar stems 5.1 s" */
      similar: (s: string) => `Similar stems ${s} s`,
    },
  },

  prices: {
    title: 'Sector prices',
    table: 'the price distributions',
    lead: 'Each person counts once, with the latest completed check. A sector without a price is left out of its row.',
    n: 'n',
    median: 'Median',
    min: 'Low',
    max: 'High',
    empty: 'No one in this cohort has a price yet.',
    /** Accessible name of a histogram. */
    chart: (sector: string, n: number, parts: readonly string[]) => `${sector}, ${plural(n, 'person', 'people')}. ${parts.join(', ')}.`,
    bin: (from: number, to: number, count: number) => `${from} to ${to}: ${count}`,
    issue: '100',
  },

  norms: {
    title: 'Norms',
    table: 'the norm table',
    lead: 'Median, standard deviation and head count of the internal 0 to 1 sector values, per cohort. Read these before setting real norms. These values are never shown to users.',
    /** "Norm in force: provisional-1" */
    inForce: (version: string) => `Norm in force: ${version}`,
    provisional: 'Provisional',
    compare: 'Rows',
    byRole: 'Roles',
    byAge: 'Age bands',
    within: 'Within',
    caption: 'Median, standard deviation and n of the sector values per cohort',
    cohort: 'Cohort',
    median: 'Median',
    sd: 'SD',
    n: 'n',
    current: 'Norm in force',
    /** Under the table. */
    smallNote: (n: number, min: number) =>
      `An outlined n marks a cohort of fewer than ${n} people. Its median and standard deviation are printed lighter, and left blank under ${min} people so that no one person can be read from them.`,
  },

  returns: {
    title: 'Return rates',
    table: 'the return rates',
    lead: 'By the calendar week of the first completed check, Monday to Sunday. A day counts once it has fully passed.',
    caption: 'People who came back on day N after their first check, by the week of that check',
    firstDay: 'First check, week of',
    people: 'People',
    day: (n: number) => `Day ${n}`,
    all: 'All weeks',
    csvNote: 'The CSV has one row per day of the first check.',
  },

  apps: {
    title: 'Micro apps',
    summaryTable: 'the micro-app summary',
    weeksTable: 'the weekly apps',
    dailyTable: 'the Daily Open table',
    lead: 'An active person has a completed check and opened Standing or recorded an entry that day.',
    summaryCaption: 'Participation per micro app',
    app: 'App',
    flag: 'Switch',
    window: 'Window',
    days: (n: number) => plural(n, 'day', 'days'),
    active: 'Active',
    participated: 'Took part',
    entries: 'Entries',
    names: {
      daily_open: 'Daily Open',
      payday: 'Payday Check',
      weekly_win: 'Weekly Win',
      people_nudge: 'People Nudge',
    } satisfies Record<MicroApp, string>,
    weeks: 'Weekly apps, week by week',
    weeksCaption: 'Weekly Win and People Nudge per calendar week',
    week: 'Week of',
    daily: 'Daily Open, week by week',
    /** "... Weeks from Oct 5. ..." The first week listed, not the first week of the window. */
    dailyLead: (from: string) =>
      `Active people with the Body and Mind consent who recorded the Daily Open, in person-days: one active person on one day. Weeks from ${from}. A week with no active person is left out.`,
    dailyCaption: 'Daily Open participation per calendar week, in person-days',
    weekCol: 'Week of',
    people: 'People',
    personDays: 'Person-days',
    allWeeks: 'All weeks',
    dailyCsvNote: 'The CSV has one row per day.',
  },

  tests: {
    title: 'Scoring tests',
    table: 'the scoring tests',
    /** "339 checks by 276 people. 63 retest pairs, 63 consecutive pairs, 0 version pairs." */
    counts: (c: { checks: number; people: number; retest: number; consecutive: number; version: number }) =>
      `${plural(c.checks, 'check', 'checks')} by ${plural(c.people, 'person', 'people')}. ${plural(c.retest, 'retest pair', 'retest pairs')}, ${plural(c.consecutive, 'consecutive pair', 'consecutive pairs')}, ${plural(c.version, 'version pair', 'version pairs')}.`,
    minRecords: (n: number) => `A test gives a verdict from ${n} records.`,
    verdicts: { pass: 'Pass', warn: 'Warn', insufficient_data: 'Not enough data' },
    n: (n: number) => `n ${n}`,
    names: {
      range: 'Range',
      stability: 'Stability',
      response: 'Response',
      validity: 'Validity',
      fairness: 'Fairness',
      gaming: 'Gaming',
      versionEffect: 'Version effect',
    },
    asks: {
      range: 'Do prices spread, and do they pile up at the limits?',
      stability: 'Does the same person get about the same price again?',
      response: 'Does the price move when answers change?',
      validity: 'Do the prices relate to each other the way they should?',
      fairness: 'Does one role or one age band get higher prices?',
      gaming: 'How many checks look like they were not answered in earnest?',
      versionEffect: 'What does a change of version do to prices already given?',
    },
    reasons: {
      narrow_spread: 'The overall price spreads too little.',
      at_limits: 'Too many sector prices sit on a limit.',
      low_retest_correlation: 'The retest correlation is under the threshold.',
      unresponsive: 'The price hardly moves when answers change.',
      jumpy: 'Single answers move the price too much.',
      ladder_unrelated: 'Objective position and the ladder answer are unrelated.',
      sectors_overlap: 'Two sectors measure nearly the same thing.',
      role_gap: 'The gap between two roles is over the threshold.',
      age_gap: 'The gap between two age bands is over the threshold.',
      all_best: 'Too many checks have every answer on the best option.',
      fast_answers: 'Too many checks were answered faster than the stems can be read.',
      grade_c: 'Too many checks have data grade C.',
      ranks_reordered: 'The ranking of people changes between the two versions.',
      many_moved: 'Too many overall prices move.',
    } as Record<string, string>,
    labels: {
      sd: 'SD of the overall price',
      median: 'Median',
      p5p95: '5th to 95th percentile',
      minMax: 'Lowest to highest',
      limitDown: 'Sector prices at limit down',
      limitUp: 'Sector prices at limit up',
      sectorPrices: 'Sector prices read',
      correlation: 'Retest correlation',
      meanAbs: 'Mean absolute change',
      changedAnswers: 'Changed answers',
      perAnswer: 'Points per changed answer',
      unmoved: 'Pairs that did not move',
      ladder: 'Ladder rank correlation',
      ladderRecords: 'Records with a ladder answer',
      highestSector: 'Highest sector correlation',
      roleGap: 'Largest gap between roles',
      ageGap: 'Largest gap between age bands',
      allBest: 'Every answer on the best option',
      fast: 'Answered faster than readable',
      gradeC: 'Data grade C',
      rank: 'Rank correlation',
      moved: 'Prices that moved',
      meanShift: 'Mean shift',
      largestMove: 'Largest move',
    },
    points: (v: string) => `${v} points`,
    /** "at least 5", "at most 5%" */
    atLeast: (v: string) => `at least ${v}`,
    atMost: (v: string) => `at most ${v}`,
    atMostTogether: (v: string) => `at most ${v} at both limits together`,
    between: (a: string, b: string) => `${a} to ${b}`,
    groups: 'Medians by group',
    groupsCaption: 'Median overall price per role and per age band',
    group: 'Group',
    groupMedian: 'Median',
    notCounted: 'Under the minimum group size',
    nothingToCompare: 'Results exist under one version only. Nothing to compare.',
  },

  report: {
    title: 'Result page',
    table: 'the result page table',
    lead: 'How the result page is read, section by section. These events never enter scoring.',
    caption: 'Views, dwell time, shares and usefulness per section of the result page',
    section: 'Section',
    seen: 'Seen',
    dwell: 'Median dwell',
    shares: 'Shares',
    useful: 'Useful',
    notUseful: 'Not useful',
    sections: {
      mind_notice: 'Mind notice',
      header: 'Quote head',
      key_stats: 'Key figures',
      chart: 'Price history',
      commentary: 'Market comment',
      timing_note: 'Timing note',
      sector_table: 'Sector board',
      radar: 'Pentagon',
      type: 'Type',
      social_position: 'Social position',
      contrasts: 'Contrasts',
      checks: 'Consistency checks',
      norm_note: 'Baseline note',
      share: 'Share',
    } satisfies Record<ReportSection, string>,
  },
} as const;
