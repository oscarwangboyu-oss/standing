/**
 * Who is calling. A user is identified by a device token (stored as a hash). The team
 * dashboard is opened by the admin passphrase.
 */
import type { ConsentState, UserProfile, UsState } from '../shared/api';
import type { Lang, RoleId } from '../engine';
import { constantTimeEqual, sha256Hex } from './crypto';
import { first } from './db';
import { ApiError, bearer, type Deps } from './http';

/** A row of the users table. */
export interface UserRow {
  id: string;
  created_at: string;
  general_consent_version: string;
  general_consent_at: string;
  health_consent_version: string | null;
  health_consent_at: string | null;
  lang: Lang;
  age: number | null;
  role: RoleId | null;
  us_state: UsState | null;
  ticker: string | null;
}

const USER_COLUMNS = `u.id, u.created_at, u.general_consent_version, u.general_consent_at,
  u.health_consent_version, u.health_consent_at, u.lang, u.age, u.role, u.us_state, u.ticker`;

/** The user the device token belongs to. One read. Throws 401 without a valid token. */
export async function requireUser(request: Request, deps: Deps): Promise<UserRow> {
  const token = bearer(request);
  if (!token) throw new ApiError(401, 'unauthorized', 'missing device token');
  const user = await first<UserRow>(
    deps.db,
    `select ${USER_COLUMNS} from device_tokens t join users u on u.id = t.user_id where t.token_hash = $1`,
    [await sha256Hex(token)],
  );
  if (!user) throw new ApiError(401, 'unauthorized', 'unknown device token');
  return user;
}

export async function loadUser(deps: Deps, id: string): Promise<UserRow> {
  const user = await first<UserRow>(deps.db, `select ${USER_COLUMNS} from users u where u.id = $1`, [id]);
  if (!user) throw new ApiError(401, 'unauthorized', 'unknown user');
  return user;
}

export function consentOf(user: UserRow): ConsentState {
  return {
    general: { version: user.general_consent_version, at: user.general_consent_at },
    health:
      user.health_consent_version && user.health_consent_at
        ? { version: user.health_consent_version, at: user.health_consent_at }
        : null,
  };
}

export function profileOf(user: UserRow): UserProfile {
  return {
    id: user.id,
    createdAt: user.created_at,
    lang: user.lang,
    ticker: user.ticker,
    usState: user.us_state,
    age: user.age,
    role: user.role,
  };
}

/**
 * Opens the team dashboard API. Without a configured passphrase the dashboard is closed in
 * every environment: a missing secret never means "open".
 */
export async function requireTeam(request: Request, deps: Deps): Promise<void> {
  const expected = deps.env.adminPassphrase;
  if (!expected) throw new ApiError(403, 'team_closed', 'the team dashboard is closed: no passphrase is configured');
  const given = bearer(request);
  // Compare even when nothing was sent, so both failures take the same time.
  const ok = await constantTimeEqual(given ?? '', expected);
  if (!given || !ok) throw new ApiError(401, 'team_unauthorized', 'wrong team passphrase');
}
