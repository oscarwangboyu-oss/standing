/**
 * Friend compare (docs/roadmap.txt, stage 1: "An invite link. Once both finish, the scores
 * appear side by side", "No public rankings").
 *
 * A person with a completed check makes an invite. The code in the link is random and stored
 * only as a hash. Someone with a completed check accepts it, and from then on each of the two
 * can read the comparison: for both, the ticker, the overall price, the five sector prices and
 * the type. That is what the share card shows. Nothing else about the other person is ever
 * returned: no answers, no history, no data grade, no background, no id.
 *
 * Nothing is copied when an invite is accepted. Each side is read from the person's latest
 * completed check at the moment of the call, so a retake shows up and a deleted account takes
 * its numbers with it.
 */
import {
  CLIENT_ID_PATTERN,
  type AcceptInviteResponse,
  type CompareSide,
  type Comparison,
  type ComparisonResponse,
  type ComparisonsResponse,
  type CreateInviteResponse,
  type DeleteComparisonResponse,
  type InviteLookupResponse,
  type InviteStatus,
} from '../../shared/api';
import { AREA_IDS, CURRENT, type AreaId } from '../../engine';
import { requireUser } from '../auth';
import { COMPARE_INVITE_DAYS, MAX_OPEN_INVITES } from '../config';
import { randomId, sha256Hex } from '../crypto';
import type { Db } from '../db';
import { first } from '../db';
import { ApiError, bearer, json, readBody, type Deps } from '../http';

const DAY_MS = 86_400_000;

interface InviteRow {
  user_id: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

interface SideRow {
  ticker: string | null;
  overall: number | null;
  price_c: number | null;
  price_w: number | null;
  price_n: number | null;
  price_b: number | null;
  price_m: number | null;
  type: unknown;
}

const EMPTY_SIDE: CompareSide = { ticker: null, overall: null, sectors: { C: null, W: null, N: null, B: null, M: null }, type: null };

function typeOf(value: unknown): [AreaId, AreaId] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value as unknown[];
  const known = (x: unknown): x is AreaId => typeof x === 'string' && (AREA_IDS as readonly string[]).includes(x);
  return known(a) && known(b) ? [a, b] : null;
}

/**
 * What one person shows in a comparison: their latest completed check, as computed with the
 * current algorithm and norm when such a row exists, otherwise its newest row. This query is
 * the whole of what is read about the other person.
 */
async function sideOf(db: Db, userId: string): Promise<CompareSide | null> {
  const row = await first<SideRow>(
    db,
    `select s.ticker, r.overall, r.price_c, r.price_w, r.price_n, r.price_b, r.price_m, r.result -> 'type' as type
     from sessions s join results r on r.session_id = s.id
     where s.user_id = $1 and s.completed_at is not null
     order by s.completed_at desc, s.id desc, (r.algo_version = $2 and r.norm_version = $3) desc, r.computed_at desc
     limit 1`,
    [userId, CURRENT.algo, CURRENT.norm],
  );
  if (!row) return null;
  return {
    ticker: row.ticker,
    overall: row.overall,
    sectors: { C: row.price_c, W: row.price_w, N: row.price_n, B: row.price_b, M: row.price_m },
    type: typeOf(row.type),
  };
}

async function requireCompletedCheck(db: Db, userId: string): Promise<CompareSide> {
  const side = await sideOf(db, userId);
  if (!side) throw new ApiError(409, 'check_required', 'complete a check first: there is nothing to compare yet');
  return side;
}

function inviteInvalid(status?: InviteStatus): ApiError {
  // One code for unknown, used and expired. The status is given only for a code that exists.
  return new ApiError(status ? 410 : 404, 'invite_invalid', 'this invite does not exist or can no longer be used', status ? { status } : undefined);
}

/** The code from a request body, hashed. A value that cannot be a code reads as an unknown invite. */
async function codeHashOf(body: Record<string, unknown>): Promise<string> {
  if (typeof body.code !== 'string' || !CLIENT_ID_PATTERN.test(body.code)) throw inviteInvalid();
  return sha256Hex(body.code);
}

function statusOf(invite: InviteRow, now: string): InviteStatus {
  if (invite.accepted_at) return 'accepted';
  return invite.expires_at <= now ? 'expired' : 'open';
}

const INVITE_COLUMNS = 'user_id, created_at, expires_at, accepted_at';

/** POST /api/compare/invites */
export async function createInvite(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  await requireCompletedCheck(deps.db, user.id);
  const now = deps.now();
  const at = now.toISOString();
  const expiresAt = new Date(now.getTime() + COMPARE_INVITE_DAYS * DAY_MS).toISOString();
  const code = randomId();
  const codeHash = await sha256Hex(code);

  await deps.db.transaction(async (tx) => {
    // Invites that ran out unused are of no use to anyone.
    await tx.query('delete from compare_invites where user_id = $1 and accepted_at is null and expires_at <= $2', [
      user.id,
      at,
    ]);
    const open = await first<{ n: number }>(
      tx,
      'select count(*)::int as n from compare_invites where user_id = $1 and accepted_at is null',
      [user.id],
    );
    if ((open?.n ?? 0) >= MAX_OPEN_INVITES) {
      throw new ApiError(429, 'invite_limit', 'too many unused invites: wait for one to be accepted or to expire', {
        limit: MAX_OPEN_INVITES,
      });
    }
    await tx.query('insert into compare_invites (code_hash, user_id, created_at, expires_at) values ($1, $2, $3, $4)', [
      codeHash,
      user.id,
      at,
      expiresAt,
    ]);
  });

  const response: CreateInviteResponse = { code, expiresAt };
  return json(response, 201);
}

/** POST /api/compare/invites/lookup. No sign-in needed: the page behind the link calls it first. */
export async function lookupInvite(request: Request, deps: Deps): Promise<Response> {
  const body = await readBody(request);
  const invite = await first<InviteRow>(deps.db, `select ${INVITE_COLUMNS} from compare_invites where code_hash = $1`, [
    await codeHashOf(body),
  ]);
  if (!invite) throw inviteInvalid();

  // A device token is optional here. With one, the answer says whether the invite is the caller's own.
  let own = false;
  const token = bearer(request);
  if (token) {
    const caller = await first<{ user_id: string }>(deps.db, 'select user_id from device_tokens where token_hash = $1', [
      await sha256Hex(token),
    ]);
    own = caller?.user_id === invite.user_id;
  }
  const from = await sideOf(deps.db, invite.user_id);
  const response: InviteLookupResponse = {
    status: statusOf(invite, deps.now().toISOString()),
    expiresAt: invite.expires_at,
    fromTicker: from?.ticker ?? null,
    own,
  };
  return json(response);
}

async function comparisonOf(db: Db, pairId: string, createdAt: string, me: CompareSide, otherId: string): Promise<Comparison> {
  return { id: pairId, createdAt, me, other: (await sideOf(db, otherId)) ?? EMPTY_SIDE };
}

/** POST /api/compare/accept */
export async function acceptInvite(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = await readBody(request);
  const codeHash = await codeHashOf(body);
  const invite = await first<InviteRow>(deps.db, `select ${INVITE_COLUMNS} from compare_invites where code_hash = $1`, [
    codeHash,
  ]);
  if (!invite) throw inviteInvalid();
  const at = deps.now().toISOString();
  const status = statusOf(invite, at);
  if (status !== 'open') throw inviteInvalid(status);
  if (invite.user_id === user.id) throw new ApiError(409, 'invite_own', 'this is your own invite: send the link to a friend');
  const me = await requireCompletedCheck(deps.db, user.id);

  const pair = await deps.db.transaction(async (tx) => {
    const existing = await first<{ pair_id: string; created_at: string }>(
      tx,
      'select pair_id, created_at from comparisons where user_id = $1 and other_user_id = $2',
      [user.id, invite.user_id],
    );
    const pairId = existing?.pair_id ?? randomId();
    // The invite is used once. A second request with the same code finds nothing to update.
    const used = await tx.query(
      `update compare_invites set accepted_at = $1, pair_id = $2
       where code_hash = $3 and accepted_at is null and expires_at > $1 returning code_hash`,
      [at, pairId, codeHash],
    );
    if (used.length === 0) throw inviteInvalid('accepted');
    if (existing) return { id: pairId, createdAt: existing.created_at, created: false };
    await tx.query(
      `insert into comparisons (pair_id, user_id, other_user_id, created_at) values ($1, $2, $3, $4), ($1, $3, $2, $4)`,
      [pairId, user.id, invite.user_id, at],
    );
    return { id: pairId, createdAt: at, created: true };
  });

  const response: AcceptInviteResponse = {
    comparison: await comparisonOf(deps.db, pair.id, pair.createdAt, me, invite.user_id),
    created: pair.created,
  };
  return json(response, pair.created ? 201 : 200);
}

interface PairRow {
  pair_id: string;
  other_user_id: string;
  created_at: string;
}

/** GET /api/compare */
export async function listComparisons(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const pairs = await deps.db.query<PairRow>(
    'select pair_id, other_user_id, created_at from comparisons where user_id = $1 order by created_at desc, pair_id',
    [user.id],
  );
  const me = (await sideOf(deps.db, user.id)) ?? EMPTY_SIDE;
  const comparisons: Comparison[] = [];
  for (const pair of pairs) comparisons.push(await comparisonOf(deps.db, pair.pair_id, pair.created_at, me, pair.other_user_id));
  const openInvites = await deps.db.query<{ created_at: string; expires_at: string }>(
    `select created_at, expires_at from compare_invites
     where user_id = $1 and accepted_at is null and expires_at > $2 order by created_at desc`,
    [user.id, deps.now().toISOString()],
  );
  const response: ComparisonsResponse = {
    comparisons,
    openInvites: openInvites.map((i) => ({ createdAt: i.created_at, expiresAt: i.expires_at })),
  };
  return json(response);
}

/** The caller's row of a comparison. Someone else's comparison reads as not found. */
async function loadPair(db: Db, userId: string, pairId: string): Promise<PairRow> {
  const pair = await first<PairRow>(
    db,
    'select pair_id, other_user_id, created_at from comparisons where pair_id = $1 and user_id = $2',
    [pairId, userId],
  );
  if (!pair) throw new ApiError(404, 'not_found', 'no such comparison');
  return pair;
}

/** GET /api/compare/:id */
export async function getComparison(request: Request, deps: Deps, pairId: string): Promise<Response> {
  const user = await requireUser(request, deps);
  const pair = await loadPair(deps.db, user.id, pairId);
  const me = (await sideOf(deps.db, user.id)) ?? EMPTY_SIDE;
  const response: ComparisonResponse = {
    comparison: await comparisonOf(deps.db, pair.pair_id, pair.created_at, me, pair.other_user_id),
  };
  return json(response);
}

/** POST /api/compare/:id/delete. Removes the comparison for both people, and the invite that led to it. */
export async function deleteComparison(request: Request, deps: Deps, pairId: string): Promise<Response> {
  const user = await requireUser(request, deps);
  const pair = await loadPair(deps.db, user.id, pairId);
  await deps.db.transaction(async (tx) => {
    await tx.query('delete from comparisons where pair_id = $1', [pair.pair_id]);
    await tx.query('delete from compare_invites where pair_id = $1', [pair.pair_id]);
  });
  const response: DeleteComparisonResponse = { deleted: true };
  return json(response);
}
