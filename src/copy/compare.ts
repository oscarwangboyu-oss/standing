/**
 * Text of friend compare: /compare (my comparisons, making an invite, one comparison side by
 * side) and /i/[code] (the page a person opens from an invite link).
 *
 * A comparison has no winner and no ranking. The difference of two prices is stated as a plain
 * number, never as a gain or a loss.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const list = {
  title: 'Compare with a friend',
  lead: 'Send a link. When your friend finishes the check and accepts, both of you see two skylines side by side.',
  create: 'Create an invite link',
  creating: 'Creating the link',
  again: 'Create another link',
  /** The server keeps at most this many unused invites per person. */
  limit: (max: number | null) =>
    max ? `You have ${max} unused invites. Wait for one to be accepted or to expire.` : 'You have too many unused invites. Wait for one to be accepted or to expire.',
  createFailed: 'The link could not be created. Try again.',
  loadFailed: 'Your comparisons could not be loaded.',
  retry: 'Try again',

  linkTitle: 'Your invite link',
  linkNote: (day: string) => `It works once and expires on ${day}. It is shown on this device only.`,
  copy: 'Copy link',
  share: 'Share link',
  copied: 'Link copied',
  copyFailed: 'The link could not be copied.',
  shareTitle: 'Standing',
  shareText: 'Compare skylines with me on Standing.',

  comparisons: 'Comparisons',
  comparisonsLabel: 'Your comparisons',
  none: 'No comparisons yet.',
  noneLine: 'A comparison appears here when a friend accepts your link.',
  /** One row of the list. */
  rowDetail: (overall: string | null, type: string | null) =>
    [overall ? `Overall ${overall}` : 'No overall price', type].filter(Boolean).join('. ') + '.',
  since: (day: string) => `Since ${day}`,

  pending: 'Waiting for a friend',
  pendingLabel: 'Invites that were not accepted yet',
  pendingRow: (made: string, expires: string) => `Made ${made}. Expires ${expires}.`,
  pendingElsewhere: 'The link was shown once, on the device that made it.',
  pendingCount: (n: number) => `${n} ${plural(n, 'invite', 'invites')} waiting`,
} as const;

/** What the other person can see. Shown wherever a link is made or accepted. */
export const privacy = {
  title: 'What a friend sees',
  line: 'Your ticker, your prices and your type. Never your answers, and never your group.',
} as const;

export const view = {
  title: 'Side by side',
  lead: 'Two skylines on one scale. Both use the same horizon: 100.',
  back: 'All comparisons',
  invite: 'Invite',
  you: 'You',
  /** On the chip when a person gave no ticker. */
  noTickerMe: 'YOU',
  noTickerOther: 'FRIEND',
  noOverall: 'No overall price',
  noPrice: 'No price',
  noType: 'No type',
  noTypeLine: 'A type needs two sectors that lead.',
  sectors: 'Sector by sector',
  sectorHeading: 'Sector',
  tableCaption: (a: string, b: string) =>
    `The middle column is ${a} minus ${b}, in points. Bars run from 70 to 130. The tick is 100.`,
  shapes: 'Two shapes',
  shapesCaption: (a: string, b: string) => `Solid line: ${a}. Dotted line: ${b}. The dashed ring is 100.`,
  personLabel: (ticker: string, overall: string | null) =>
    overall ? `${ticker}, overall ${overall}` : `${ticker}, no overall price`,
  fresh: 'Prices are read from the latest check of each of you.',
  remove: 'Delete this comparison',
  removeTitle: 'Delete this comparison?',
  removeLine: 'It is removed for both of you. Your results stay as they are.',
  removeConfirm: 'Delete',
  removeCancel: 'Keep it',
  removed: 'Comparison deleted',
  removeFailed: 'The comparison could not be deleted. Try again.',
  missing: 'This comparison does not exist any more.',
  failed: 'This comparison could not be loaded.',
  retry: 'Try again',
} as const;

export const invite = {
  /** The heading. The inviter is named by ticker only. */
  title: (ticker: string | null) => (ticker ? `${ticker} invited you to compare` : 'You are invited to compare'),
  lead: 'Standing prices five sectors of a person like stocks: capability, wealth, network, body and mind. 100 is the median of people in the same age band and situation.',
  showsTitle: 'What comparing shows',
  shows: ['Both tickers', 'Both overall prices', 'The five sector prices of each of you', 'Both types'],
  hidesTitle: 'What it never shows',
  hides: ['Any answer to any question', 'Your age band or situation', 'Your history or your data grade', 'A winner or a ranking'],
  start: 'Start the check',
  startNote: 'The check takes a few minutes. The invite is kept on this device and accepted when you finish.',
  resume: 'Continue the check',
  resumeNote: 'You have a check in progress. The invite is accepted when you finish.',
  accept: 'Accept',
  accepting: 'Accepting',
  acceptNote: 'You already have a result. Accepting shows your latest prices to the person who invited you, and theirs to you.',
  expires: (day: string) => `This link works once and expires on ${day}.`,
  acceptFailed: 'The invite could not be accepted. Try again.',

  loading: 'Loading the invite',
  invalidTitle: 'This link does not work',
  invalid: 'The invite was not found. Ask your friend for a new link.',
  expiredTitle: 'This invite has expired',
  expired: (day: string) => `It expired on ${day}. Ask your friend for a new link.`,
  usedTitle: 'This invite was already used',
  used: 'Each link works once. Ask your friend for a new one.',
  ownTitle: 'This is your own invite',
  own: 'Send this link to a friend. It opens when they finish the check and accept.',
  failedTitle: 'The invite could not be loaded',
  failed: 'Check your connection and try again.',
  retry: 'Try again',
  toCompare: 'Go to your comparisons',
  toStart: 'Take the check yourself',
  toFront: 'About Standing',
} as const;
