/**
 * Text of the landing page (app/page.tsx).
 * Rules (CLAUDE.md): short declarative sentences, facts and concrete numbers, one market
 * vocabulary, no em dashes, no exclamation marks, nothing invented. Every number here comes
 * from the question bank (src/engine/bank/v2_1.json), the scoring config or the product brief.
 */
import type { TypeSector } from './types';

type Code = TypeSector;

export const meta = {
  title: 'Standing: see where you stand',
  description:
    'A check of five parts of your life: capability, wealth, network, body and mind. Each one gets a price, like a stock. 100 is the median of people your age in your situation. 31 to 34 questions, no sign-up.',
  ogAlt: 'Standing. A skyline of five towers at dusk, one for each sector: capability, wealth, network, body and mind.',
} as const;

/**
 * Where the primary action goes: consent and background. The guard there sends a person with an
 * unfinished check on to /check, and one with a completed check to /market.
 */
export const START_HREF = '/start';

export const nav = {
  label: 'Sections',
  how: 'How it works',
  sectors: 'Sectors',
  types: 'Types',
  method: 'Method',
  about: 'About',
  start: 'Start the check',
} as const;

/** The sample person. RIVR is not a real person. The five prices average to the overall price. */
export const sample = {
  ticker: 'RIVR',
  cohort: 'Ages 21 to 24, employed full-time',
  price: 104.37,
  prices: { SKIL: 111.2, WLTH: 96.85, NETW: 103.4, BODY: 108.1, MIND: 102.3 } as Record<Code, number>,
  tag: 'Sample data',
} as const;

/** The second sample, for the compare picture. */
export const sampleFriend = {
  ticker: 'MOSS',
  price: 103.9,
  prices: { SKIL: 97.4, WLTH: 112.6, NETW: 109.8, BODY: 94.2, MIND: 105.5 } as Record<Code, number>,
} as const;

export const hero = {
  titleA: 'See where you stand.',
  titleB: 'Five parts of your life, priced like a stock.',
  lead: 'A price for your capability, wealth, network, body and mind. 100 is the median of people your age in your situation.',
  cta: 'Start the check',
  fact: '31 to 34 questions. No sign-up.',
  overall: 'Overall',
} as const;

export const result = {
  title: 'What a result looks like',
  lead: 'This one is a sample. Move a sector and the city follows.',
  hintFine: 'Drag a roof, or move a slider.',
  hintTouch: 'Move a slider.',
  overall: 'Overall price',
  mean: 'The equal-weighted mean of the five sectors.',
  type: 'Type',
  typeNote: 'The two highest sectors.',
  reset: 'Reset the sample',
  slider: (name: string) => `${name} price`,
  sliderValue: (price: string) => `${price}, on a scale from 55 to 145`,
  roof: (code: string, price: string) => `${code} ${price}`,
} as const;

export const reading = {
  title: 'How to read a price',
  /** The one large sentence of the dark band. The facts below it give the rest of the scale. */
  statement: 'A price of 115 is one standard deviation above the median of people like you.',
  facts: [
    { figure: '100', text: 'The median of your group. In every skyline it is the horizon.' },
    { figure: '15', text: 'Points in one standard deviation. 85 is one below the median.' },
    { figure: '55 to 145', text: 'The range. 145 is limit up and 55 is limit down.' },
    { figure: '5', text: 'Sectors, weighted equally. The overall price is their mean.' },
  ],
  baselineTitle: 'The baseline is provisional.',
  baseline: 'Until enough people have taken the check, 100 is a stand-in. Prices will be re-based when real medians replace it.',
  method: 'Read how scoring works',
  figure: {
    label:
      'Drawing of one tower next to a scale from 55 to 145. The horizon is at 100, the median. One standard deviation is 15 points. One floor is 5 points. The sample tower stands at 111.20.',
    median: 'the median of your group',
    sd: '15 points',
    sdNote: 'one standard deviation',
    floor: 'One floor is 5 points',
    limitUp: 'limit up',
    limitDown: 'limit down',
    street: 'street level',
  },
} as const;

export interface SectorCopy {
  code: Code;
  /** What the sector covers, in one sentence. */
  about: string;
  /** The building that stands for it. */
  building: string;
  /** How many questions, from the bank. */
  count: string;
  /** What its questions ask about. Summarised from the items of the sector in bank 2.1. */
  asks: readonly string[];
  /** One real question from the bank, word for word. */
  question: string;
  /** Its answers, first and last as the bank lists them. */
  answers: readonly [string, string];
  /** A fact that applies to this sector only. */
  note?: string;
}

export const sectors = {
  title: 'Five sectors, five buildings',
  lead: 'Each sector has its own ticker, colour and building. The questions change with your situation. A student is not asked about years of work.',
  /** Names the scrolling row of sector cards on a phone. */
  railLabel: 'The five sectors',
  asksLabel: 'The questions ask about',
  questionLabel: 'One of the questions',
  answersLabel: (first: string, last: string) => `Answers run from "${first}" to "${last}".`,
  list: [
    {
      code: 'SKIL',
      about: 'What you can do, and how far you have taken it.',
      building: 'A workshop tower with a crane on the roof.',
      count: '8 to 10 questions, depending on your situation',
      asks: [
        'Your experience and the level of your work or study',
        'Education, licences and certifications',
        'Hours of courses and training in the past 12 months',
        'The languages you can work in',
        'One question on compound interest',
        'The highest level you have reached in a pursuit of your own',
      ],
      question: 'What is the most advanced thing you can do on a computer without help?',
      answers: ['Use email, apps and web search', 'Build and release software, or lead a technical project'],
    },
    {
      code: 'WLTH',
      about: 'Your cushion and your footing. Every answer is a range. No exact amounts are asked.',
      building: 'A bank with six columns and a vault door.',
      count: '6 questions',
      asks: [
        'The money you have to live on in an average month',
        'How long your savings would last',
        'Savings and investments, minus card balances and personal loans',
        'The share of your pay that goes to debt or to savings',
        'Whether you worry that your money will not last',
      ],
      question: 'Suppose you had an emergency expense of $400. How would you pay for it?',
      answers: ['I could not pay for it right now', 'With cash, money in my account, or a credit card I pay off in full'],
    },
    {
      code: 'NETW',
      about: 'The people you can ask, and how close they are.',
      building: 'Two slim towers joined by skybridges.',
      count: '5 or 6 questions',
      asks: [
        'The kinds of people you could ask for a small favour',
        'Who would recommend you for a job or lend you $500',
        'Groups you take an active part in',
        'A mentor, or people you guide yourself',
        'How often you feel lonely',
      ],
      question: 'How many people could you call at 3 a.m. if you had a serious problem?',
      answers: ['None', '6 or more'],
    },
    {
      code: 'BODY',
      about: 'How your body is doing: health, movement, sleep.',
      building: 'A tower with a climbing wall and a rooftop pool.',
      count: '5 questions',
      asks: [
        'Your health in general',
        'Minutes of activity in a typical week',
        'Hours of sleep',
        'Days when poor health kept you from your usual activities',
      ],
      question: 'Which is the hardest of these you could do today without stopping?',
      answers: ['None of these', 'Run 6 miles (10 km) or more'],
      note: 'Body answers need a separate consent. One answer is "Not applicable because of an injury or a physical condition".',
    },
    {
      code: 'MIND',
      about: 'How settled you feel, and how fast you recover.',
      building: 'A tower with a garden terrace and an observatory dome.',
      count: '6 questions',
      asks: [
        'How satisfied you are with your life',
        'Whether the things you do feel worthwhile',
        'How often you felt nervous or on edge in the last 2 weeks',
        'How often you had little interest or pleasure in things',
        'How often you feel in control of the important things',
      ],
      question: 'When something goes wrong, how long does it usually take you to get back on track?',
      answers: ['I tend to stay stuck', 'A day or less'],
      note: 'Mind answers need a separate consent.',
    },
  ] as readonly SectorCopy[],
} as const;

export const types = {
  title: 'Ten types',
  lead: 'Your type is the pair of your two highest sectors. Five sectors make ten pairs, and each pair has a name. A type says what leads for you today. It changes when your prices change.',
  pick: 'Choose a type',
  label: 'Type',
  pair: (a: string, b: string) => `${a} and ${b} lead.`,
} as const;

export const how = {
  title: 'How a check works',
  steps: [
    {
      title: 'Choose your age band and your situation',
      text: 'Six age bands and eleven situations. Your group is the people who chose the same two. You confirm that you are 18 or older.',
    },
    {
      title: 'Answer one question per screen',
      text: 'Each sector has 5 to 10 questions, one tap each. A last question asks where you place yourself on a ladder of ten rungs. Any question can be skipped or marked not applicable.',
    },
    {
      title: 'See your skyline and your prices',
      text: 'A ticker, an overall price, five sector prices and your type. Strengths come first.',
    },
  ],
  agesLabel: 'Age bands',
  ages: ['18 to 20', '21 to 24', '25 to 29', '30 to 34', '35 to 44', '45 or over'],
  situationsLabel: 'Situations',
  situations: [
    "Bachelor's student",
    'Community college student',
    'Graduate student',
    'Employed full-time',
    'Part-time or gig work',
    'Freelance',
    'Business owner',
    'Looking for work',
    'Caring for family',
    'Retired',
    'Other',
  ],
} as const;

/** Three real questions of the Body sector, for the try-it panel. Texts and options are from bank 2.1. */
export const demo = {
  title: 'Try three questions',
  note: 'Real questions from the Body sector. Nothing is saved.',
  skip: 'Skip',
  counter: (n: number) => `Sample question ${n} of 3`,
  /** Body has 5 questions. The panel starts at the second, so one floor already stands. */
  sectorTotal: 5,
  sectorFirst: 2,
  questions: [
    {
      id: 'B2',
      text: 'In a typical week, how many minutes of moderate or vigorous activity do you do (brisk walking, running, cycling, sports, gym)?',
      options: ['Under 30', '30 to 89', '90 to 149', '150 to 299', '300 or more'],
    },
    {
      id: 'B3',
      text: 'On average, how many hours of sleep do you get in a 24-hour period?',
      options: ['Under 5', '5 to 6', '6 to 7', '7 to 9', 'More than 9'],
    },
    {
      id: 'B4',
      text: 'Which is the hardest of these you could do today without stopping?',
      options: [
        'None of these',
        'Walk 1 mile at a normal pace',
        'Walk 1 mile briskly',
        'Jog 1 mile',
        'Run 3 miles (5 km)',
        'Run 6 miles (10 km) or more',
        'Not applicable because of an injury or a physical condition',
      ],
    },
  ],
  /** The title once the three are done. A skipped question adds no floor. */
  doneTitle: (floors: number) => (floors === 0 ? 'No floors added.' : `${['One', 'Two', 'Three'][floors - 1] ?? floors} ${floors === 1 ? 'floor' : 'floors'} added.`),
  doneText: 'The full check covers all five sectors and ends with your skyline and your prices.',
  start: 'Start the check',
  again: 'Try again',
} as const;

export const after = {
  title: 'After the check',
  lead: 'A price is a record of one day. Short records keep it current.',
  items: [
    {
      id: 'open',
      title: 'Daily Open',
      text: 'Three taps, about 15 seconds: last night’s sleep, yesterday’s exercise, how you are now.',
      sectors: ['BODY', 'MIND'],
      rhythm: 'Daily',
    },
    {
      id: 'payday',
      title: 'Payday Check',
      text: 'Three numbers each payday. The amounts stay on your device.',
      sectors: ['WLTH'],
      rhythm: 'Each payday',
    },
    {
      id: 'win',
      title: 'Weekly Win',
      text: 'One entry a week: a course, a certificate or a skill you improved.',
      sectors: ['SKIL'],
      rhythm: 'Weekly',
    },
    {
      id: 'people',
      title: 'People Nudge',
      text: 'Three people to reconnect with each week, and a log of who you reached.',
      sectors: ['NETW'],
      rhythm: 'Weekly',
    },
  ] as ReadonlyArray<{ id: 'open' | 'payday' | 'win' | 'people'; title: string; text: string; sectors: readonly Code[]; rhythm: string }>,
  staged: 'In stages',
  /** When none of the four is switched on. */
  soon: 'Short daily and weekly records come next. They open in stages.',
  /** The phone form when some are on. */
  short: 'Short daily and weekly records keep your prices current. They open in stages.',
  plan: 'See the plan',
} as const;

export const together = {
  title: 'Share it. Compare with a friend.',
  share: {
    title: 'A share image',
    text: 'Your skyline at dusk with your ticker, your prices and your type. None of your answers are on it.',
  },
  compare: {
    title: 'Compare by invite link',
    text: 'Send a friend a link. When both of you have finished the check, both of you see the two skylines side by side. There is no public ranking.',
    note: 'RIVR and MOSS are samples.',
    label: 'Two sample skylines side by side: RIVR at 104.37 and MOSS at 103.90.',
  },
} as const;

export const data = {
  title: 'What is collected, and what is not',
  lead: 'The check works without knowing who you are.',
  notLabel: 'Not collected',
  yesLabel: 'How the rest is handled',
  rows: [
    { item: 'Name', value: 'Not collected', kept: false },
    { item: 'Email address', value: 'Not collected', kept: false },
    { item: 'Phone number', value: 'Not collected', kept: false },
    { item: 'IP address', value: 'Not stored', kept: false },
    { item: 'Other companies’ scripts', value: 'None load in your browser', kept: false },
    { item: 'Your answers', value: 'The ranges you tapped, under a random id on the server', kept: true },
    { item: 'This device', value: 'Keeps a token that links it to that id', kept: true },
    { item: 'Body and mind answers', value: 'Only with a separate consent. Without it you still get the other three sectors', kept: true },
    { item: 'Payday amounts', value: 'Stay on your device. The server receives bands only', kept: true },
    { item: 'Export and delete', value: 'Both are in Settings. Delete removes your records', kept: true },
  ] as ReadonlyArray<{ item: string; value: string; kept: boolean }>,
  more: 'Read the privacy notice',
} as const;

export const team = {
  title: 'Who builds it',
  text: 'Standing is the first consumer product of Bayu Technology, a student team.',
  facts: [
    { figure: '2026', text: 'Founded in Atlanta, Georgia' },
    { figure: '10', text: 'Students on the team' },
    { figure: '5', text: 'Universities' },
  ],
  about: 'About the company and the plan',
} as const;

export const closing = {
  title: 'Take the check and see your own skyline.',
  fact: '31 to 34 questions. No sign-up. Every question can be skipped.',
  cta: 'Start the check',
} as const;

export const sticky = {
  label: 'Start',
  cta: 'Start the check',
  fact: '31 to 34 questions',
} as const;

export const footerLinks = [
  { href: '/about', label: 'About' },
  { href: '/method', label: 'Method' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
] as const;
