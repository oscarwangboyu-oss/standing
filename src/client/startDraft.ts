/**
 * The steps of /start that a person has passed, kept for the life of the browser tab.
 *
 * A phone may reload a tab that was in the background. Without this, a person who had chosen
 * an age band, a situation and the background answers would start again at the introduction.
 * The draft lives in sessionStorage only: it is gone when the tab closes, it never reaches the
 * server, and it is removed as soon as the check starts. Nothing here is a secret or an answer
 * to a scored question.
 */
import { ROLE_IDS, type RoleId } from '../engine';

const KEY = 'standing.v1.start-draft';

export interface StartDraft {
  /** The step on screen. */
  at: string;
  age: number | null;
  role: RoleId | null;
  extra: Record<string, number>;
  usState: string;
  ticker: string;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const isRole = (value: unknown): value is RoleId => typeof value === 'string' && (ROLE_IDS as readonly string[]).includes(value);
const isIndex = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100;

/** The draft of this tab, or null. A draft of the wrong shape is dropped. */
export function readStartDraft(): StartDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StartDraft>;
    if (typeof value.at !== 'string' || value.at === '' || value.at === 'intro') return null;
    const extra: Record<string, number> = {};
    if (value.extra && typeof value.extra === 'object') {
      for (const [id, k] of Object.entries(value.extra)) if (/^[a-z]{1,12}$/.test(id) && isIndex(k)) extra[id] = k;
    }
    return {
      at: value.at,
      age: isIndex(value.age) ? value.age : null,
      role: isRole(value.role) ? value.role : null,
      extra,
      usState: typeof value.usState === 'string' ? value.usState : '',
      ticker: typeof value.ticker === 'string' ? value.ticker.slice(0, 12) : '',
    };
  } catch {
    return null;
  }
}

export function writeStartDraft(draft: StartDraft): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage is full or blocked: the steps are simply not kept.
  }
}

export function clearStartDraft(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
