/**
 * Text of the settings screen (/settings).
 * Rules (CLAUDE.md): short declarative sentences, concrete numbers, one market vocabulary,
 * no em dashes, no exclamation marks, nothing invented.
 */

export const settings = {
  metaTitle: 'Settings',
  title: 'Settings',
  lead: 'Your record, your consent and your data.',
  loading: 'Loading your settings',

  /** A device that holds no record. */
  empty: {
    title: 'This device holds no record',
    text: 'Take the check to start one. If you already have a record, connect this device with its recovery code.',
    start: 'Start the check',
  },

  ticker: {
    title: 'Ticker',
    none: 'No ticker',
    with: 'Your prices are shown under this code. It is not unique and it is not a name.',
    without: 'You did not pick a ticker. Your prices are shown without a code.',
    how: 'A ticker is 2 to 6 letters or digits. It is set when a check starts, so you can pick another one at your next check.',
    retake: 'Start a new check',
  },

  recovery: {
    title: 'Recovery code',
    what: 'Standing has no sign-up, no email and no password. This code is the only way to reach your record from another phone or computer, or after this browser is cleared. Write it down and keep it private.',
    codeLabel: 'Your recovery code',
    hidden: 'Hidden',
    show: 'Show code',
    hide: 'Hide code',
    copy: 'Copy',
    copied: 'Recovery code copied',
    copyFailed: 'The code could not be copied. Select it and copy it by hand.',
    notHere:
      'This device does not hold the code. The server keeps only a hash of it and cannot show it again. Make a new code to have one.',
    rotate: 'Make a new code',
    rotateTitle: 'Make a new recovery code',
    rotateText: 'The current code stops working at once. Devices that are already connected stay connected, unless you sign them out here.',
    disconnectOthers: 'Also sign out every other device',
    disconnectHint: 'Use this if someone else may have seen your code. This device stays connected.',
    rotateConfirm: 'Make a new code',
    rotated: 'New recovery code made. The old one no longer works.',
    /** "New recovery code made. 2 other devices were signed out." */
    rotatedAndOut: (n: number) =>
      n === 0
        ? 'New recovery code made. No other device was connected.'
        : `New recovery code made. ${n} other ${n === 1 ? 'device was' : 'devices were'} signed out.`,
  },

  restore: {
    title: 'Use a recovery code',
    text: 'Connect this device to a record that already exists.',
    open: 'Enter a recovery code',
    sheetTitle: 'Connect this device',
    label: 'Recovery code',
    hint: 'Capitals, spaces and dashes do not matter.',
    submit: 'Connect this device',
    replaces:
      'This device already holds a record. If the code belongs to another record, this device switches to it, and what is kept only here (payday amounts, win titles, names of people) is cleared. The current record stays on the server and can be reached with its own recovery code.',
    empty: 'Enter the recovery code.',
    invalid: 'No record has this code. Check it and try again.',
    done: 'This device is connected to the record.',
  },

  consent: {
    title: 'Consent',
    general: 'Use of your answers',
    generalText: 'You agreed to what Standing collects, why, where it is kept and how to delete it. To take this back, delete your data.',
    health: 'Body and Mind answers',
    healthText:
      'Answers about your body and your mind are more sensitive than the rest, and some US states treat them as protected health data. They need a separate consent.',
    /** "Agreed on Nov 19, 2026" */
    agreed: (day: string) => `Agreed on ${day}`,
    given: (day: string) => `Given on ${day}`,
    notGiven: 'Not given',
    unknown: 'Not loaded yet',
    give: 'Give consent',
    withdraw: 'Withdraw',
    giveTitle: 'Body and Mind consent',
    giveText: [
      'You agree that Standing collects your answers to the Body and Mind questions and your Daily Open records, stores them with your record, and uses them to work out your BODY and MIND prices.',
      'The team sees totals per question, never the answers of one person.',
      'You can withdraw at any time on this screen, and you can delete everything under Delete my data.',
    ],
    giveEffect: 'BODY and MIND get a price at your next check. The Daily Open needs this consent.',
    giveConfirm: 'I agree',
    withdrawTitle: 'Withdraw the Body and Mind consent',
    withdrawText: [
      'Standing stops accepting Body and Mind answers from you. The Daily Open closes.',
      'From now on, BODY and MIND read "Not listed" on your market and in comparisons, and the overall price is the mean of the other three sectors. Results already recorded stay as they were.',
      'Nothing is deleted by this. Answers you already gave stay in your record until you delete your data.',
    ],
    withdrawConfirm: 'Withdraw consent',
    givenToast: 'Consent recorded.',
    withdrawnToast: 'Consent withdrawn.',
  },

  data: {
    title: 'Your data',
    export: 'Export my data',
    exportText: 'A JSON file with every row the server keeps about you, and what is kept only on this device.',
    exporting: 'Preparing the file',
    exported: 'File saved.',
    /** "standing-export-2026-11-19.json" */
    fileName: (day: string) => `standing-export-${day}.json`,
    delete: 'Delete my data',
    deleteText: 'Removes your record from the server and clears this device.',
    deleteTitle: 'Delete my data',
    deleteLead: 'This deletes for good:',
    deleteItems: [
      'Every check, every answer and every result.',
      'Your Daily Open, Payday Check, Weekly Win and People Nudge records.',
      'Your comparisons with friends and your open invites.',
      'Your consent record, your ticker and your recovery code.',
      'Everything kept on this device, including payday amounts.',
    ],
    deleteNoUndo: 'It cannot be undone and there is no backup to restore from. Export first if you want a copy.',
    deleteCheck: 'I understand that this cannot be undone.',
    deleteConfirm: 'Delete everything',
    deleting: 'Deleting',
    cancel: 'Cancel',
  },

  calendar: {
    title: 'Daily Open reminder',
    text: 'Standing sends no notifications. You can add an event to your own calendar that repeats every day and links back to the Daily Open.',
    time: 'Time of day',
    add: 'Add to calendar',
    added: 'Calendar file saved. Open it to add the event.',
    needsConsent: 'The Daily Open needs the Body and Mind consent.',
    fileName: 'standing-daily-open.ics',
    eventTitle: 'Standing: Daily Open',
    eventText: 'Three questions about sleep, movement and how you feel. About 15 seconds.',
  },

  about: {
    title: 'About',
    label: 'Documents',
    method: 'How scoring works',
    methodText: 'From answers to a price, step by step.',
    privacy: 'Privacy notice',
    privacyText: 'What is collected and what is not. A draft.',
    terms: 'Terms',
    termsText: 'The terms of use. A draft.',
    /** "Algorithm 1. Question bank 2.1. Norm provisional-1." */
    versions: (algo: number | string, bank: string, norm: string) => `Algorithm ${algo}. Question bank ${bank}. Norm ${norm}.`,
    versionsLabel: 'Versions',
  },

  errors: {
    offline: 'No connection. Nothing was changed. Try again when you are back online.',
    server: 'The server did not answer. Nothing was changed. Try again in a minute.',
    gone: 'The server no longer knows this device. The record may have been deleted from another device.',
    generic: 'That did not work. Nothing was changed.',
    load: 'Your settings could not be loaded. What is kept on this device is shown.',
    retry: 'Try again',
  },
} as const;
