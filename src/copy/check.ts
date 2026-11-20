/**
 * Text of the check: /start (consent and background) and /check (the questions).
 *
 * The questions, their answers, the age bands, the situations and the background questions
 * come from the question bank, not from here.
 * Rules (CLAUDE.md): short declarative sentences, concrete numbers, one market vocabulary,
 * no em dashes, no exclamation marks, nothing invented.
 */

/** Page titles, for the browser tab. */
export const pages = {
  start: 'Start the check',
  check: 'The check',
} as const;

/* ------------------------------------------------------------------ /start */

export const start = {
  /** Small labels above the heading of a step. */
  eyebrow: {
    consentOne: 'Consent, 1 of 2',
    consentTwo: 'Consent, 2 of 2',
    about: 'About you',
    ticker: 'Your ticker',
  },
  back: 'Back',

  intro: {
    title: 'Start your check',
    lines: [
      'Standing prices five sectors of your life like stocks: Capability, Wealth, Network, Body and Mind.',
      '100 is the median of people in your age band and situation.',
    ],
    fact: '31 to 34 questions, one tap each. Every question can be skipped.',
    action: 'Begin',
    /** For a person who took the check on another device. Opens the recovery code sheet in Settings. */
    restoreText: 'Took the check on another device?',
    restoreLink: 'Use your recovery code',
  },
  /** The same screen for a person who already has a check. */
  again: {
    title: 'A new check',
    lines: [
      'You answer the questions again and get new prices for your sectors.',
      'Your earlier checks stay in your history, and the change is measured against the last one.',
    ],
    fact: '31 to 34 questions, one tap each. Every question can be skipped.',
    action: 'Begin',
  },

  /** Step one of consent: the general notice. */
  notice: {
    title: 'What Standing collects',
    items: [
      {
        label: 'What is collected',
        text: 'Your age band, your situation and your answer to each question, with the time each answer took. No name, no email address, no phone number, no IP address.',
      },
      {
        label: 'Why',
        text: 'To compute your prices, and to improve the questions from totals such as how many people skip one.',
      },
      {
        label: 'Where it is kept',
        text: 'On our server, under a random id. There is no account. This device keeps a token that links it to that id.',
      },
      {
        label: 'How to delete it',
        text: 'Settings has "Delete my data". It removes your records from the server for good.',
      },
    ],
    more: 'The full text is in the',
    privacy: 'privacy notice',
    and: 'and the',
    terms: 'terms',
    action: 'Agree and continue',
  },

  adult: {
    title: 'Are you 18 or older?',
    lead: 'Standing is for adults.',
    yes: 'Yes, I am 18 or older',
    no: 'No, I am under 18',
  },
  under: {
    title: 'Standing is for people 18 or older',
    text: 'Nothing was saved on this device or on our server.',
    action: 'Back to the front page',
  },

  state: {
    title: 'Which state do you live in?',
    lead: 'Optional. Leave it empty if you live outside the United States or would rather not say.',
    label: 'State',
    none: 'No state',
    action: 'Continue',
    skip: 'Continue without a state',
  },

  ticker: {
    title: 'Pick a ticker',
    lead: 'Your prices are quoted under it, like a stock symbol. It is optional, and two people can have the same one.',
    label: 'Ticker',
    /** Under the field. `suggested` is the code the field starts with. */
    hint: (suggested: string) => `2 to 6 letters or digits. ${suggested} is a suggestion: keep it or type your own.`,
    hintKept: '2 to 6 letters or digits.',
    error: 'A ticker is 2 to 6 letters or digits.',
    action: 'Continue',
    skip: 'Continue without a ticker',
  },

  /** Step two of consent: body and mind answers. */
  health: {
    title: 'May we ask about your body and mind?',
    lines: [
      'Some US states treat answers about body and mind as protected health data. That is why this consent is separate from the first one.',
      'If you say no, you still complete Capability, Wealth and Network. Body and Mind show as "Not listed", and the Daily Open is not available.',
    ],
    yes: 'Yes, include Body and Mind',
    yesHint: 'All five sectors get a price.',
    no: 'No, leave them out',
    noHint: 'Three sectors get a price.',
  },

  starting: 'Setting up your check',
  offline: 'No connection. Nothing was lost. Try again when you are back online.',
  failed: 'That did not work. Nothing was lost. Try again.',
  retry: 'Try again',
  /** The server computes with a newer question bank than the one in this page. */
  stale: 'Standing was updated after this page was opened. Reload it to start your check with the current questions.',
  reload: 'Reload',

  /** The picture next to the steps, read aloud. */
  plot: (lots: number) =>
    lots === 0
      ? 'An empty street by the bay. The horizon is 100.'
      : `A street by the bay with ${lots} of 5 lots marked out. The horizon is 100.`,
} as const;

/** US states and the District of Columbia by postal code, for the optional state. */
export const stateNames: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
};

/* ------------------------------------------------------------------ /check */

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'] as const;

export const check = {
  /** "12 of 33" */
  count: (current: number, total: number) => `${current} of ${total}`,
  /** Read aloud before the count. */
  countPrefix: 'Question',
  skip: 'Skip',
  notApplicable: 'Not applicable',
  /** Accessible name of the two actions under the answers. */
  otherLabel: 'Other ways to answer',
  leave: 'Leave the check',
  loading: 'Loading your check',

  /** The one beat between two sectors. */
  between: {
    /** "Capability is built." */
    built: (sector: string) => `${sector} is built.`,
    next: 'Next',
    /** "6 questions" */
    questions: (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`,
    /** The closing question belongs to no sector. */
    last: 'One last question',
  },

  /** "Pricing your five sectors" */
  pricing: (sectors: number) => `Pricing your ${COUNT_WORDS[sectors] ?? String(sectors)} sectors`,
  pricingNote: 'Every answer is in.',

  /** Under the answers while events could not be sent. */
  offline: 'Your answers are kept on this device. They are sent when the connection returns.',

  waiting: {
    title: 'Waiting for a connection',
    text: 'Your answers are kept on this device. They are sent when the connection returns, and your prices follow.',
  },
  failed: {
    title: 'Your result was not saved yet',
    text: 'Your answers are still on this device. Try again.',
  },
  retry: 'Try again',
} as const;
