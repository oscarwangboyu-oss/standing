/**
 * Text of the short public pages: /about, /method, /privacy, /terms.
 * Rules (CLAUDE.md): short declarative sentences, facts and concrete numbers, no em dashes,
 * no exclamation marks, nothing invented, no claim of compliance with a named law.
 *
 * The privacy notice and the terms are drafts. They describe what the app collects as built
 * and they need a lawyer's review before public launch.
 */

export interface PageSection {
  id: string;
  title: string;
  /** Paragraphs. */
  text?: readonly string[];
  /** A plain list after the paragraphs. */
  list?: readonly string[];
}

export const publicNav = {
  label: 'Pages',
  back: 'Standing',
  start: 'Start the check',
  onThisPage: 'On this page',
  links: [
    { href: '/about', label: 'About' },
    { href: '/method', label: 'Method' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
  ],
} as const;

/** The strip above the footer of every public page. */
export const publicClosing = {
  title: 'Take the check and see your own skyline.',
  fact: '31 to 34 questions. No sign-up. Every question can be skipped.',
  cta: 'Start the check',
} as const;

export const draft = {
  tag: 'Draft',
  title: 'Draft, awaiting legal review',
  text: 'This page is a plain-language draft. A lawyer has not reviewed it yet. It will be reviewed before Standing opens to the public, and it may change then.',
  updated: 'Draft of November 19, 2026',
} as const;

/* ------------------------------------------------------------------ about */

export const about = {
  meta: {
    title: 'About',
    description:
      'Standing is built by Bayu Technology, a team of ten students founded in 2026 in Atlanta, Georgia. The plan has four stages: Check, Daily, Report, Prove.',
  },
  title: 'About Standing',
  lead: 'Standing is built by Bayu Technology, a student team founded in 2026 in Atlanta, Georgia.',
  company: {
    title: 'The company',
    text: [
      'Bayu Technology builds backend data systems for small and mid-sized companies. Standing is its first consumer product.',
      'The team is ten students from five universities.',
    ],
    facts: [
      { figure: '2026', text: 'Founded in Atlanta, Georgia' },
      { figure: '10', text: 'Students on the team' },
      { figure: '5', text: 'Universities' },
    ],
  },
  product: {
    title: 'The product',
    method: 'Read how scoring works',
    text: [
      'Standing is a whole-person check. It prices five sectors of a person like stocks: capability, wealth, network, body and mind.',
      'The median of people in the same age band and situation is 100. 15 points is one standard deviation. Prices run from 55 to 145. The overall price is the equal-weighted mean.',
    ],
  },
  plan: {
    title: 'The plan in four stages',
    lead: 'Each stage starts only when the one before it meets its numbers.',
    stage: (n: number) => `Stage ${n}`,
    gateLabel: 'Moves on when',
    startLabel: 'Starts only with',
    sceneLabels: [
      'Five finished towers.',
      'Five towers under scaffolding.',
      'Five fenced lots.',
      'Five marked plots.',
    ],
    stages: [
      {
        name: 'Check',
        when: 'Now',
        text: 'A check anyone can take without signing up, a price for each sector, a result to share and a compare by invite link. This stage is about getting the questions and the scoring right.',
        gate: '70% of people who start the check finish it. No question is skipped by more than 10% of people. Two checks by the same person, 10 to 21 days apart, correlate at 0.75 or better.',
        gateKind: 'gate',
      },
      {
        name: 'Daily',
        when: 'Next',
        text: 'Short records that keep prices current: a Daily Open for body and mind, a Payday Check for wealth, a Weekly Win for capability and a People Nudge for network. The web version is being switched on in steps.',
        gate: '25% of people come back on day 7 and 12% on day 30.',
        gateKind: 'gate',
      },
      {
        name: 'Report',
        when: 'Then',
        text: 'Paid reports and a subscription, written by rules from a person’s own history. Not built yet.',
        gate: '1.5% of people buy a report and subscribers stay three months or longer.',
        gateKind: 'gate',
      },
      {
        name: 'Prove',
        when: 'Later',
        text: 'Read-only bank connections and a verified net worth statement. Not built yet.',
        gate: 'A security audit and a partner accounting firm.',
        gateKind: 'start',
      },
    ] as ReadonlyArray<{ name: string; when: string; text: string; gate: string; gateKind: 'gate' | 'start' }>,
  },
  principles: {
    title: 'How we work',
    list: [
      'We do not collect your name, email or phone number, and we do not sell data.',
      'The numbers about the check come from the question bank and the scoring rules. The baseline is marked provisional until real medians replace it.',
    ],
  },
  contact: {
    title: 'Contact',
    text: 'Bayu Technology, Atlanta, Georgia.',
  },
} as const;

/* ------------------------------------------------------------------ method */

export const method = {
  meta: {
    title: 'Method',
    description:
      'How Standing turns answers into prices: own-sector questions carry two thirds, related questions one third, with a timing weight, consistency checks, versions and a provisional baseline.',
  },
  title: 'How scoring works',
  lead: 'Scoring is done by fixed rules that carry a version number. No AI model takes part in the score.',
  split: {
    label: 'Where a sector’s value comes from: two thirds from its own questions, one third from related questions in other sectors.',
    own: 'Own questions',
    ownShare: 'Two thirds',
    other: 'Related questions',
    otherShare: 'One third',
  },
  rulerLabel: 'The price scale, with the sample at 104.37',
  grades: {
    label: 'The data grade follows the points of the checks that fired.',
    list: [
      { grade: 'A', points: '0 to 1 points' },
      { grade: 'B', points: '2 to 3 points' },
      { grade: 'C', points: '4 or more points' },
    ],
  },
  timing: {
    label:
      'The weight of an answer by the time it took. Up to half the threshold of the question it counts at half weight. From the threshold on it counts in full. The threshold is between 0.6 and 2.0 seconds.',
    half: 'Half weight',
    full: 'Full weight',
    time: 'Time taken',
    halfway: 'Half the threshold',
    threshold: 'The threshold',
    caption: 'A threshold is between 0.6 and 2.0 seconds, set by the length of the question.',
  },
  sections: [
    {
      id: 'value',
      title: 'From answers to a sector',
      text: [
        'Every answer has a fixed score. A sector is a weighted average of the answers that bear on it.',
        'Two thirds come from the sector’s own questions. One third comes from questions in other sectors that also bear on it. The last question of the check, the ten-rung ladder, belongs to no sector and counts only through that one third.',
        'A skipped question and an answer marked not applicable have no score. They are left out of the average. When part of a sector’s weight is missing, the sector is pulled toward the median in proportion.',
      ],
    },
    {
      id: 'price',
      title: 'From a sector to a price',
      text: [
        'The median of your group is set to 100. One standard deviation is 15 points. A price stops at 55, limit down, and at 145, limit up.',
        'The overall price is the equal-weighted mean of the sectors that have a price.',
        'A sector gets a price when at least 60% of its own questions have a score. Below that it shows "Not enough data". An overall price needs at least three priced sectors.',
      ],
    },
    {
      id: 'timing',
      title: 'Timing weight',
      text: [
        'Each question has a time threshold set by the length of its text, between 0.6 and 2.0 seconds. An answer given faster than the threshold counts for less, down to half weight.',
        'Lower weight pulls the price toward 100.',
      ],
    },
    {
      id: 'checks',
      title: 'Consistency checks and the data grade',
      text: [
        'Twelve checks look at the answers as a set. They look for answers that contradict each other, for every answer on the best option, for answers given faster than the text can be read, and for the same position chosen on more than 80% of the questions.',
        'Each check that fires adds points. 0 to 1 points is data grade A. 2 to 3 is B. 4 or more is C. The grade is shown next to the price.',
        'Skipping a question does not lower the grade.',
      ],
    },
    {
      id: 'interest',
      title: 'One question with a right answer',
      text: [
        'One capability question asks what $100 becomes after 5 years at 2% interest a year. A wrong answer moves the capability sector 10% of the way toward the median. A skipped question does not.',
      ],
    },
    {
      id: 'versions',
      title: 'Versions and re-scoring',
      text: [
        'The questions, the scoring rules and the baseline each carry a version number. Every result records all three.',
        'Raw answers are kept as they were given. Results are derived from them and can be computed again.',
        'When a version changes, past answers are scored again with the new version. Both prices stay on record, and the price chart marks the day of the change.',
      ],
    },
    {
      id: 'baseline',
      title: 'The provisional baseline',
      text: [
        'A price compares you with the median of your group. Until enough people have taken the check, every group uses the same stand-in baseline. It is a design setting. No group’s median has been measured yet.',
        'The team replaces it group by group once real medians and head counts are known. Prices are re-based then, and the baseline version goes up. Until then every result says that the baseline is provisional.',
      ],
    },
    {
      id: 'daily',
      title: 'Records after the check',
      text: [
        'The short tools are being switched on in stages. Their rules are fixed in the same versioned config.',
        'A daily record replaces the matching answer of the check only when there are records on 4 of the last 7 days. A sector moves at most 2 points a day from these records. The day of a full check is exempt.',
        'After 14 days without a record, Body and Mind are halted. The price holds until you record again, and the sector is then marked resumed.',
      ],
    },
    {
      id: 'limits',
      title: 'What a price is not',
      text: [
        'Standing is not a medical diagnosis, not financial advice and not a credit score.',
        'The price is a way of showing a personal index. It is not a security and it cannot be traded.',
      ],
    },
  ] as readonly PageSection[],
} as const;

/* ------------------------------------------------------------------ privacy */

export const privacy = {
  meta: {
    title: 'Privacy notice (draft)',
    description: 'A plain-language draft of what Standing collects and what it does not. Awaiting legal review.',
  },
  title: 'Privacy notice',
  lead: 'What Standing collects, what it does not, where it is kept and how you remove it.',
  sections: [
    {
      id: 'who',
      title: 'Who we are',
      text: ['Standing is made by Bayu Technology, Atlanta, Georgia. Write to teambayutech@gmail.com with any question about this notice.'],
    },
    {
      id: 'not',
      title: 'What we do not collect',
      list: [
        'Your name.',
        'Your email address.',
        'Your phone number.',
        'Your IP address. The server does not store it.',
        'Exact amounts of money. Money questions are answered in ranges.',
      ],
      text: ['There is no account and no sign-up.'],
    },
    {
      id: 'collect',
      title: 'What we collect',
      text: ['The server receives the least it needs to compute your prices and to improve the questions.'],
      list: [
        'Your age band and your situation, and the background answers that go with your situation. Your state is optional.',
        'A ticker of 2 to 6 letters or digits, if you choose one. It does not have to be unique.',
        'For each question: that it was shown, the answer you tapped or that you skipped it, the time it took, the order the answers were shown in, and the version of the question.',
        'For the result page: which parts were seen and for how long, whether you shared, and your taps on "Was this part useful?".',
        'The days on which you opened Standing, to measure how many people return.',
        'Records you add after the check, once those tools are on: daily records of sleep, exercise and state as ranges, payday bands, weekly wins and the count of people you reached.',
      ],
    },
    {
      id: 'id',
      title: 'How your records are kept together',
      text: [
        'The first time something is saved, the server creates a random id. Your device keeps a token that links it to that id.',
        'Settings shows a recovery code. Entering it on another device connects that device to the same records.',
        'The server stores only a hash of the token and of the recovery code.',
      ],
    },
    {
      id: 'health',
      title: 'Body and mind answers',
      text: [
        'Answers about your body and your mind are more sensitive than the rest, and some US states treat them as protected health data. We ask for a separate consent before any of them is collected.',
        'If you do not give it, you can still finish the other three sectors. Body and Mind then show "Not listed", and the Daily Open is not available.',
      ],
    },
    {
      id: 'payday',
      title: 'Payday amounts',
      text: [
        'The amounts you type into the Payday Check stay on your device. The device works out which band each amount falls in. The server receives the bands only.',
      ],
    },
    {
      id: 'use',
      title: 'What we use it for',
      list: [
        'To compute your prices and show how they move.',
        'To improve the questions. The team looks at totals per question, such as how many people skip it.',
        'To decide when the next stage of the product opens.',
      ],
      text: ['The team dashboard shows totals only. It has no view of a single person. We do not sell data, and we show no ads.'],
    },
    {
      id: 'others',
      title: 'Other companies',
      text: [
        'Your browser loads nothing from other companies: no analytics script, no ad, no remote font.',
        'The records are kept in a Postgres database hosted by Supabase. The site is served by Vercel.',
        'When usage analytics is turned on, our server sends events such as "question shown" or "question skipped" to PostHog. The answers themselves are never sent there.',
      ],
    },
    {
      id: 'share',
      title: 'What other people can see',
      text: [
        'The share image carries your ticker, your overall price, your five sector prices and your type. It carries none of your answers and not your group.',
        'When you compare by invite link, the friend you invited sees your skyline, your prices and your type, and you see theirs. There is no public ranking.',
      ],
    },
    {
      id: 'rights',
      title: 'Export and delete',
      text: [
        'Settings has "Export my data" and "Delete my data". Delete removes your records from the server for good.',
        'If you lose both your device and your recovery code, we cannot tell which records are yours.',
      ],
    },
    {
      id: 'age',
      title: 'Age',
      text: ['Standing is for people who are 18 or older. The check asks you to confirm this before it starts.'],
    },
    {
      id: 'changes',
      title: 'Changes to this notice',
      text: ['This notice will change after legal review. The date at the top shows which draft you are reading.'],
    },
  ] as readonly PageSection[],
} as const;

/* ------------------------------------------------------------------ terms */

export const terms = {
  meta: {
    title: 'Terms of use (draft)',
    description: 'A plain-language draft of the terms for using Standing. Awaiting legal review.',
  },
  title: 'Terms of use',
  lead: 'The rules for using Standing, in plain words.',
  sections: [
    {
      id: 'what',
      title: 'What Standing is',
      text: [
        'Standing is a check of five sectors of a person: capability, wealth, network, body and mind. It shows each one as a price, with 100 as the median of people in the same age band and situation.',
        'Standing is made by Bayu Technology, Atlanta, Georgia.',
      ],
    },
    {
      id: 'not',
      title: 'What it is not',
      list: [
        'It is not a medical diagnosis. If you are worried about your health or your state of mind, talk to a professional.',
        'It is not financial advice.',
        'It is not a credit score, and it is not meant for decisions about credit, jobs, housing or insurance.',
        'The price is a way of showing a personal index. It is not a security and it cannot be traded.',
      ],
    },
    {
      id: 'who',
      title: 'Who can use it',
      text: ['You need to be 18 or older. The check asks you to confirm this.'],
    },
    {
      id: 'prices',
      title: 'Prices can change',
      text: [
        'The baseline is provisional. 100 stands in for the median of your group until enough people have taken the check, and prices will be re-based when real data replaces it.',
        'The questions and the scoring rules are versioned. When a version changes, past answers are scored again and your price can move. Both prices stay on record.',
      ],
    },
    {
      id: 'cost',
      title: 'Cost',
      text: ['The check, the result, the share image and the compare are free. This version of Standing sells nothing.'],
    },
    {
      id: 'data',
      title: 'Your data',
      text: ['The privacy notice says what is collected and how to export or delete it. Your answers stay yours.'],
    },
    {
      id: 'use',
      title: 'Fair use',
      list: [
        'Answer for yourself.',
        'Do not try to break the service, overload it or reach other people’s records.',
        'Do not present a price or a share image as a verified statement about a person. Nothing in Standing is verified.',
      ],
    },
    {
      id: 'asis',
      title: 'No guarantee',
      text: [
        'Standing is an early product made by a student team. It is offered as it is. It may be wrong, it may change and it may be unavailable at times.',
        'The sections on liability and on which law applies will be written with a lawyer before public launch.',
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      text: ['Write to teambayutech@gmail.com.'],
    },
  ] as readonly PageSection[],
} as const;
