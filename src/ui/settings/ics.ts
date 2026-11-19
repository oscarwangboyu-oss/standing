/**
 * The calendar file for the Daily Open reminder (PROMPT.md section 9: no push in this
 * version, "add to calendar" in its place). One event that repeats every day at the time the
 * person picked, with a link back to the Daily Open. Pure: no DOM, no clock.
 *
 * The start has no time zone ("floating" time in RFC 5545), so the reminder rings at the
 * same wall-clock time wherever the person is.
 */

export interface DailyOpenEvent {
  /** "HH:MM", 24 hours, as an <input type="time"> gives it. */
  time: string;
  /** The first day, YYYY-MM-DD, in the person's own calendar. */
  startDay: string;
  /** The address of the Daily Open. */
  url: string;
  /** Unique id of the event. */
  uid: string;
  /** The moment the file is made. */
  stamp: Date;
  title: string;
  text: string;
}

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DEFAULT_REMINDER_TIME = '08:00';

/** Text values escape backslash, semicolon, comma and line breaks (RFC 5545, 3.3.11). */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets are folded: a line break followed by one space. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const width = bytes.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + width > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const two = (n: number): string => String(n).padStart(2, '0');

function utcStamp(at: Date): string {
  return `${at.getUTCFullYear()}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}T${two(at.getUTCHours())}${two(at.getUTCMinutes())}${two(at.getUTCSeconds())}Z`;
}

/** The text of the .ics file, or null when the time or the day is not valid. */
export function dailyOpenIcs(event: DailyOpenEvent): string | null {
  const time = TIME_PATTERN.exec(event.time);
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(event.startDay);
  if (!time || !day) return null;
  const start = `${day[1]}${day[2]}${day[3]}T${time[1]}${time[2]}00`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bayu Technology//Standing//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(event.stamp)}`,
    `DTSTART:${start}`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(`${event.text}\n${event.url}`)}`,
    `URL:${event.url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.title)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
