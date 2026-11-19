/**
 * The "Add to calendar" file of the Daily Open: one event that repeats every day at the time
 * the person picks, with a link back to /open. Pure: the caller passes the clock and the id.
 * The time is written without a zone ("floating"), so it stays at that hour wherever the
 * person is. Standing sends no notifications; the calendar on the device does the reminding.
 */

export interface DailyReminder {
  /** "HH:MM" on a 24-hour clock, as an <input type="time"> gives it. */
  time: string;
  /** The first day of the event, YYYY-MM-DD: the person's own today. */
  startDay: string;
  /** Where the event links to: the address of /open on this site. */
  url: string;
  summary: string;
  description: string;
  /** Unique id of the event. */
  uid: string;
  /** When the file is made, for DTSTAMP. */
  now: Date;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a time an <input type="time"> can hold. */
export function isReminderTime(value: string): boolean {
  return TIME.test(value);
}

/** Escapes text for a calendar property (RFC 5545, 3.3.11). */
function text(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a line at 75 octets. Continuation lines start with one space. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const width = bytes.encode(char).length;
    if (size + width > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += width;
  }
  out.push(current);
  return out.join('\r\n ');
}

const two = (n: number): string => String(n).padStart(2, '0');

/** The text of the .ics file. Throws for a time or a day that is not valid. */
export function dailyReminderIcs(reminder: DailyReminder): string {
  const time = TIME.exec(reminder.time);
  const day = DAY.exec(reminder.startDay);
  if (!time || !day) throw new Error('a daily reminder needs a time as HH:MM and a day as YYYY-MM-DD');
  const n = reminder.now;
  const stamp = `${n.getUTCFullYear()}${two(n.getUTCMonth() + 1)}${two(n.getUTCDate())}T${two(n.getUTCHours())}${two(n.getUTCMinutes())}${two(n.getUTCSeconds())}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bayu Technology//Standing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reminder.uid}@standing`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${day[1]}${day[2]}${day[3]}T${time[1]}${time[2]}00`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${text(reminder.summary)}`,
    `DESCRIPTION:${text(reminder.description)}`,
    `URL:${reminder.url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(reminder.summary)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
