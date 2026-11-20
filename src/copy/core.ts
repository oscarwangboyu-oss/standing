/**
 * Text of the app frame (app/(app)/layout.tsx): the placeholder screens and the developer panel.
 * The developer panel is seen by the team only, in development or with ?debug=1 in the address.
 */

/** Screens that are not built yet. Each placeholder is replaced by its screen. */
export const placeholder = {
  line: 'This screen is not built yet.',
  titles: {
    start: 'Start',
    check: 'Check',
    result: 'Result',
    market: 'Market',
    open: 'Daily Open',
    log: 'Log',
    payday: 'Payday Check',
    win: 'Weekly Win',
    people: 'People Nudge',
    compare: 'Compare',
    invite: 'Invite',
    settings: 'Settings',
    team: 'Team dashboard',
  },
} as const;

export type PlaceholderScreen = keyof typeof placeholder.titles;

/** Shown on every app screen while the device holds a record made by `npm run seed:demo`. Local only. */
export const simulated = {
  title: 'Simulated data',
  text: 'This record was made by the demo script on this computer. It is not a real person, and none of its numbers are real.',
} as const;

export const dev = {
  open: 'Developer panel',
  title: 'Developer panel',
  note: 'For the team. Shown in development and when the address carries ?debug=1.',
  start: 'Start a random check',
  answer: 'Answer randomly to the end',
  forget: 'Forget this device',
  forgetHint: 'Clears what this browser stores. The server keeps its records.',
  /** "Answered 12 of 34" */
  progress: (done: number, total: number) => `Answered ${done} of ${total}`,
  completing: 'Sending the answers and computing the result',
  done: 'The check is complete.',
  failed: 'That did not work. The error is in the data below.',
  noCheck: 'No check is in progress.',
  status: 'Status',
  data: 'Internal data',
  copy: 'Copy as JSON',
  copied: 'Copied',
} as const;
