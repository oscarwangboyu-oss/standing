/**
 * Text of the four micro apps and of the log hub: Daily Open (/open), Payday Check
 * (/log/payday), Weekly Win (/log/win), People Nudge (/log/people), the hub (/log).
 * Rules (CLAUDE.md): short declarative sentences with concrete numbers, one market vocabulary,
 * no em dashes, no exclamation marks, nothing invented. Every rule stated here is a rule of the
 * engine (src/engine/config.ts, src/engine/live).
 */

/** States every micro app has. */
export const shared = {
  back: 'Log',
  backLabel: 'Back to the log',
  closedTitle: (app: string) => `${app} is not open yet`,
  closed:
    'The team opens each part of Standing in turn. This one is still switched off. Nothing is recorded here, and your prices stay as they are.',
  toMarket: 'Back to the market',
  loadError: 'This screen could not be loaded.',
  retry: 'Try again',
  saving: 'Saving',
  /** After a write. */
  movedTitle: 'What it moved',
  priceNow: 'Price now',
  noChangeToday: 'No move today.',
  catchingUp: (code: string, target: string, limit: number) =>
    `${code} is still catching up. Today's data points to ${target}, and a sector moves at most ${limit} points a day.`,
  limit: (limit: number) => `A sector moves at most ${limit} points a day. A larger move carries over to the next days.`,
  resumed: (name: string) => `${name} resumed today.`,
  haltedTitle: (name: string) => `${name} is halted`,
  errors: {
    network: 'The server did not answer. Nothing was lost. Check the connection and try again.',
    feature_off: 'This part of Standing is switched off for now. Nothing was recorded.',
    check_required: 'A full check comes first. The price starts from it.',
    day_closed: 'That day is closed. A Daily Open can be recorded for today or filled in for yesterday.',
    health_consent_required: 'Daily Open needs your consent for Body and Mind answers. You can give it in Settings.',
    payday_not_eligible: 'Payday Check is offered to people who live on their own earnings.',
    entry_limit: 'This takes at most 10 entries a day. Try again tomorrow.',
    unauthorized: 'This device is no longer connected to a record. Open Settings to restore it.',
    fallback: 'That was not saved. Try again.',
  },
} as const;

// ---------------------------------------------------------------- Daily Open

export const open = {
  name: 'Daily Open',
  title: 'Daily Open',
  lead: 'Three taps. About 15 seconds.',
  /** Which day the three taps describe. */
  dayLabel: 'Which day',
  today: 'Today',
  yesterday: 'Yesterday',
  yesterdayOpen: 'Yesterday was missed. It can still be filled in today.',
  fillYesterday: 'Fill in yesterday',
  skip: 'Skip this one',
  needOne: 'Answer at least one of the three.',
  thenToday: 'Yesterday is filled in. Now today.',
  step: (n: number, total: number) => `Step ${n} of ${total}`,
  questions: {
    today: {
      sleep: 'How long did you sleep last night?',
      exercise: 'How many minutes of moderate or harder exercise did you do yesterday?',
      state: 'How do you feel right now?',
    },
    yesterday: {
      sleep: 'How long did you sleep the night before last?',
      exercise: 'How many minutes of moderate or harder exercise did you do the day before yesterday?',
      state: 'How did you feel yesterday?',
    },
  },
  /** The five bands of the sleep question of the check. */
  sleep: ['Under 5 hours', '5 to 6 hours', '6 to 7 hours', '7 to 9 hours', 'More than 9 hours'],
  exercise: ['None', '1 to 19 minutes', '20 to 39 minutes', '40 to 59 minutes', '60 minutes or more'],
  state: ['Very bad', 'Bad', 'Okay', 'Good', 'Very good'],
  exerciseHint: 'Brisk walking, running, cycling, sports, gym.',

  doneToday: "Today's open",
  doneYesterday: 'Yesterday is filled in',
  recorded: 'Recorded.',
  alreadyRecorded: 'That day was already recorded. The first record stands.',
  priceToday: "Today's price",
  sinceYesterday: 'since yesterday',
  bodyMind: 'Body and Mind today',
  bodyMindLabel: 'Body and Mind prices',
  litLine: 'The lights are on in Body and Mind.',
  yourTaps: 'What you recorded',
  tapsLabels: { sleep: 'Sleep', exercise: 'Exercise', state: 'How you feel' },
  tapSkipped: 'Skipped',
  /** The two rules that explain a price that has not moved, or has not finished moving. */
  rules: (limit: number, minDays: number, windowDays: number) =>
    `Prices move at most ${limit} points a day, so a larger move carries over to the next days. Daily records replace your check answers once ${minDays} of the last ${windowDays} days are recorded.`,
  streakTitle: 'Streak',
  streakRule: 'One missed day does not reset the streak. Two missed days in a row do.',

  haltedTitle: 'Body and Mind are halted',
  haltedBody: (day: string, days: number) =>
    `Body and Mind have been halted since ${day}: no Daily Open for ${days} days. Their prices hold still. Record today to resume.`,

  consentTitle: 'Daily Open needs your consent for Body and Mind',
  consent:
    'It records sleep, exercise and how you feel. Some states treat answers like these as protected health data, so Standing asks for them separately. Without that consent Body and Mind stay not listed and Daily Open stays closed.',
  consentAfter: 'After you give consent, a retake of the check lists Body and Mind. Daily Open keeps them current from then on.',
  consentAction: 'Open Settings',
  unlistedTitle: 'Body and Mind are not listed yet',
  unlisted:
    'Your last full check left out Body and Mind. Daily Open can record from today, and the two sectors get a price after a retake that includes them.',

  calendar: {
    title: 'Add to calendar',
    lead: 'A reminder that repeats every day at the time you pick. It is a calendar file, saved from this page. Standing sends no notifications.',
    time: 'Time of day',
    action: 'Add to calendar',
    saved: 'Calendar file saved. Open it to add the reminder.',
    failed: 'The calendar file could not be made.',
    /** Inside the file. */
    summary: 'Standing: Daily Open',
    description: (url: string) => `Three taps, about 15 seconds. ${url}`,
    fileName: 'standing-daily-open.ics',
  },
} as const;

// ---------------------------------------------------------------- Payday Check

export const payday = {
  name: 'Payday Check',
  title: 'Payday Check',
  lead: 'Three numbers each payday. No bank link.',
  privacyTitle: 'Amounts stay on this device',
  privacy:
    'The amounts you type are stored only in this browser. This device turns them into bands, the same kind of ranges the check uses, and sends only the bands. The server never receives an amount, and it refuses a request that carries one.',

  setupTitle: 'Set up once',
  setupLead: 'Two facts about how you are paid. Both stay on this device.',
  frequency: 'How often are you paid?',
  frequencies: {
    weekly: 'Every week',
    biweekly: 'Every two weeks',
    semimonthly: 'Twice a month',
    monthly: 'Once a month',
  },
  essential: 'Essential spending in a month',
  essentialHint: 'Rent, food, transport, insurance and minimum debt payments. A round figure is fine.',
  saveSetup: 'Continue',
  changeSetup: 'Change the setup',
  setupSummary: (frequency: string, essential: string) => `Paid ${frequency.toLowerCase()}. Essential spending ${essential} a month.`,

  entryTitle: 'This payday',
  correctTitle: "Correct today's payday",
  income: 'Take-home income this pay period',
  incomeHint: 'After taxes. Filled in from last time. Change it if it differs.',
  incomeHintFirst: 'After taxes.',
  spending: 'Spending this pay period',
  spendingHint: 'Everything that went out, saving left aside.',
  savings: 'Saved or invested this pay period',
  currency: '$',
  save: 'Save this payday',
  correct: "Correct today's numbers",
  errors: {
    required: 'Enter an amount of 0 or more.',
    essential: 'Enter your essential spending in a month. It must be above 0.',
    frequency: 'Choose how often you are paid.',
  },

  savedTitle: 'Payday recorded',
  wealthNow: 'Wealth now',
  sinceYesterday: 'since yesterday',
  sentTitle: 'What was sent',
  sentShare: (band: string, periods: number) =>
    `Share saved: the band "${band}", from ${periods} ${periods === 1 ? 'payday' : 'paydays'}.`,
  sentNoShare: 'Share saved: nothing, because the take-home income was 0.',
  sentShareUnused: 'The share is stored and does not move your price: your check asked about debt payments, which it cannot answer.',
  sentRunway: (band: string) => `Months of savings: the band "${band}".`,
  sentNoRunway: 'Months of savings: nothing. Your check answer still stands.',
  sentNothingElse: 'No amount was sent.',

  compareTitle: 'This payday against the last',
  compareNote: 'Computed on this device.',
  compareFirst: 'This is your first payday here. The comparison starts with the next one.',
  saveShare: 'Share saved',
  spendShare: 'Share spent',
  averageShare: (periods: number) => `Mean share saved, last ${periods} ${periods === 1 ? 'payday' : 'paydays'}`,
  monthsSinceCheck: 'Months of essential spending added since the check',
  last: 'Last',
  now: 'Now',
  noShare: 'No income',
  points: (value: string) => `${value} points`,

  updatesTitle: 'What this updates',
  updates: {
    shareSave: (periods: number) =>
      `Share of income saved. The mean of your last ${periods} paydays replaces your check answer.`,
    shareDebt:
      'Share of income that goes to debt payments. Your check asked for this, and the three numbers hold no debt payment. It stays as answered in the check.',
    runway:
      'Months of savings. Your check answer is the starting range. Savings and shortfalls since the check move that range. The answer is replaced only when the whole range has left the band you answered.',
    runwayStays: 'Months of savings stays as answered in the check.',
    stays:
      'Income before taxes, how you would pay an emergency expense, net worth and how tight money feels stay as answered in the check.',
    halt: (days: number) => `Wealth is halted after ${days} days without a Payday Check.`,
  },

  historyTitle: 'On this device',
  historyNote: 'Only this browser has these amounts. Clearing its data removes them.',
  historyLabel: 'Paydays stored on this device',
  historyRow: (income: string, spending: string, savings: string) => `In ${income}, out ${spending}, saved ${savings}`,

  notEligibleTitle: 'Payday Check is not offered for your situation',
  notEligible:
    'It is offered to people who live on their own earnings and are employed full-time, in part-time or gig work, freelance, or business owners. Your Wealth price stays as answered in the check.',
  halted: (day: string, days: number) =>
    `Wealth has been halted since ${day}: no Payday Check for ${days} days. Its price holds still. Record a payday to resume.`,
  doneToday: 'Recorded today.',
} as const;

// ---------------------------------------------------------------- Weekly Win

export const win = {
  name: 'Weekly Win',
  title: 'Weekly Win',
  lead: 'One entry a week: a course, a certificate or a skill you improved.',
  kindQuestion: 'What was it?',
  kinds: {
    course: { label: 'A course or training', hint: 'Structured learning: a class, a workshop, an online course.' },
    certificate: { label: 'A licence or certificate', hint: 'One you gained this week.' },
    skill: { label: 'A skill', hint: 'Something you got better at through practice.' },
  },
  hoursQuestion: 'How many hours this week?',
  hours: ['About 1 hour', '2 to 4 hours', '5 to 9 hours', '10 to 19 hours', '20 hours or more'],
  examQuestion: 'Did it require an exam?',
  exam: { yes: 'Yes', no: 'No' },
  levelQuestion: 'What level is it?',
  levels: { entry: 'Entry level', advanced: 'Advanced, or a state licence' },
  titleLabel: 'A name for it (optional)',
  titleHint: 'Stays on this device. The server receives the kind and the choices above, never this name.',
  save: 'Log this win',
  incomplete: 'Answer the questions above first.',

  doneTitle: 'Logged this week',
  doneNoLocal: 'This week has an entry. Its name is kept only on the device that entered it.',
  nextDue: (day: string) => `The next week starts on ${day}.`,
  replace: "Replace this week's entry",
  replaceNote: 'One entry a week counts. A new one replaces the earlier one of the same week.',
  sentTitle: 'What was sent',
  sent: {
    course: (hours: string) => `A course, ${hours.toLowerCase()}.`,
    courseNoHours: 'A course.',
    certificate: (level: string, exam: boolean) => `A certificate, ${level.toLowerCase()}, ${exam ? 'with an exam' : 'without an exam'}.`,
    skill: 'A skill.',
    noTitle: 'The name was not sent.',
  },
  rulesTitle: 'How it counts',
  rules: {
    regularity: (minWeeks: number, windowWeeks: number) =>
      `Weeks with a win enter Capability once ${minWeeks} of the last ${windowWeeks} weeks have one.`,
    course: (minWeeks: number) =>
      `Course hours add up over the past 12 months. Once courses are logged in ${minWeeks} different weeks, the total replaces your check answer on learning hours when it reaches a higher band.`,
    certificateExam: 'A certificate with an exam counts as one more than you answered in the check.',
    certificateNoExam: 'A certificate without an exam does not change your answer on licences. It counts as the win of this week.',
    skill: 'A skill counts as the win of this week.',
    halt: (days: number) => `Capability is halted after ${days} days without a Weekly Win.`,
  },
  halted: (day: string, days: number) =>
    `Capability has been halted since ${day}: no Weekly Win for ${days} days. Its price holds still. Log a win to resume.`,
  historyTitle: 'On this device',
  historyLabel: 'Wins stored on this device',
  untitled: {
    course: 'A course',
    certificate: 'A certificate',
    skill: 'A skill',
  },
} as const;

// ---------------------------------------------------------------- People Nudge

export const people = {
  name: 'People Nudge',
  title: 'People Nudge',
  lead: 'Three people to reconnect with this week, and a log of who you reached.',
  privacyTitle: 'Names stay on this device',
  privacy:
    'The names are stored only in this browser. When you save the log, the server receives how many people you picked and what each person you reached is to you. It never receives a name.',

  pickTitle: 'Pick three people for this week',
  pickLead: 'One to three people you have not been in touch with lately.',
  person: (n: number) => `Person ${n}`,
  namePlaceholder: 'A name or a nickname',
  category: 'Who they are to you',
  categories: {
    family: 'Family',
    friend: 'Friend',
    mentor: 'Mentor',
    work: 'Work or school',
    other: 'Other',
  },
  mentorHint: 'A mentor is someone more experienced who actively helps your studies or career.',
  savePicks: 'Keep these for the week',
  picksSavedHere: 'Kept on this device. Nothing was sent.',
  pickError: 'Add at least one name.',
  categoryError: 'Choose who each person is to you.',
  changePicks: 'Change the people',

  logTitle: 'Who did you reach?',
  logLead: 'Tick each person once you have been in touch.',
  reached: 'Reached',
  notYet: 'Not yet',
  markReached: (name: string) => `Mark ${name} as reached`,
  save: "Save this week's log",
  saveAgain: 'Update the log',
  nothingNew: 'The log is up to date.',

  doneTitle: 'Logged this week',
  doneNoLocal: 'This week has a log. The names are kept only on the device that entered them.',
  summary: (reached: number, planned: number) => `${reached} of ${planned} reached this week.`,
  nextDue: (day: string) => `The next week starts on ${day}.`,
  sentTitle: 'What was sent',
  sentPlanned: (planned: number) => `${planned} ${planned === 1 ? 'person' : 'people'} picked.`,
  sentReached: (parts: readonly string[]) => (parts.length ? `Reached: ${parts.join(', ')}.` : 'Nobody reached yet.'),
  sentCount: (count: number, category: string) => `${count} ${category.toLowerCase()}`,
  sentNoNames: 'No name was sent.',
  rulesTitle: 'How it counts',
  rules: {
    reach: (max: number, minWeeks: number, windowWeeks: number) =>
      `People reached out of ${max} enter Network once ${minWeeks} of the last ${windowWeeks} weeks have a log.`,
    mentor:
      'Reaching a mentor in 2 different weeks of a year reads as talking a few times a year. In 3 weeks of the last 91 days it reads as at least monthly. It replaces your check answer only upward.',
    halt: (days: number) => `Network is halted after ${days} days without a People Nudge.`,
  },
  halted: (day: string, days: number) =>
    `Network has been halted since ${day}: no People Nudge for ${days} days. Its price holds still. Log this week to resume.`,
} as const;

// ---------------------------------------------------------------- the hub

export const hub = {
  title: 'Log',
  lead: 'The records that keep Wealth, Capability and Network current, and every move of your price.',
  appsTitle: 'This week and this payday',
  appsLabel: 'Micro apps',
  status: {
    closed: 'Not open yet',
    notOffered: 'Not offered',
    doneToday: 'Done today',
    doneThisWeek: 'Done this week',
    due: 'Due this week',
    setUp: 'Set up',
    halted: 'Halted',
  },
  payday: {
    never: 'Three numbers each payday. Amounts stay on this device.',
    next: (day: string) => `Next payday around ${day}.`,
    dueNow: (day: string) => `A payday was due around ${day}.`,
    last: (day: string) => `Last recorded ${day}.`,
    notOffered: 'Offered to people who live on their own earnings.',
  },
  weekly: {
    win: 'One course, certificate or skill a week.',
    people: 'Three people to reconnect with, and who you reached.',
    nextWeek: (day: string) => `Next week starts ${day}.`,
    last: (day: string) => `Last logged ${day}.`,
  },
  dailyOpen: {
    title: 'Daily Open',
    detail: 'Body and Mind, three taps a day.',
    doneToday: 'Done today',
    due: 'Open today',
  },
  movesTitle: 'Recent moves',
  movesLead: 'Days on which your overall price moved. Tap one to see what caused it.',
  movesLabel: 'Days with a move of the overall price',
  moveRow: (day: string) => `Moves on ${day}`,
  fullCheck: 'Full check',
  versionChange: 'Version change',
  emptyTitle: 'No moves yet',
  empty: 'Your price moves when a Daily Open, a payday, a win or a people log changes what your answers say. The first move shows up here.',
  moreMoves: (count: number) => `Showing the latest ${count} days with a move.`,
} as const;
