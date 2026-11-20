/**
 * How the text of a check question is set. Pure functions, so they can be tested directly.
 */

/** A question longer than this many characters is set a size smaller, so its answers start higher on a phone. Interface setting. */
export const LONG_QUESTION = 90;

/**
 * A question with a closing parenthetical, such as "...required an exam (for example CPA, RN)?"
 * or "...nowadays? (0 is not at all, 10 is completely)": the main text with its question mark,
 * and the parenthetical, to be set apart and smaller. A question without one comes back whole.
 */
export function splitQuestion(text: string): { main: string; aside: string | null } {
  const m = /^(.*\S)\s(\([^()]*\))(\?)?$/s.exec(text);
  if (!m) return { main: text, aside: null };
  const [, head = '', aside = '', mark = ''] = m;
  return { main: `${head}${mark}`, aside };
}

/** True for a question whose main text is long enough to be set a size smaller. */
export function isLongQuestion(main: string): boolean {
  return main.length > LONG_QUESTION;
}
