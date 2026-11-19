/**
 * Accounts and consent (PROMPT.md section 11). There is no sign-up and no name, email or phone.
 * The first save creates a record with a random id. The device keeps a token; a recovery code
 * connects another device to the same record. Only hashes of both are stored.
 */
import {
  ACCEPTED_CONSENT_VERSIONS,
  CONSENT_KINDS,
  type ConsentRequest,
  type ConsentResponse,
  type CreateUserResponse,
  type OkResponse,
  type RestoreResponse,
  type RotateRecoveryResponse,
} from '../../shared/api';
import { consentOf, loadUser, requireUser } from '../auth';
import { newDeviceToken, newRecoveryCode, normalizeRecoveryCode, randomId, sha256Hex } from '../crypto';
import { first } from '../db';
import { ApiError, bearer, invalid, isOneOf, isRecord, json, readBody, type Deps } from '../http';

function checkConsentVersion(kind: 'general' | 'health', version: unknown): string {
  if (typeof version !== 'string' || !ACCEPTED_CONSENT_VERSIONS[kind].includes(version)) {
    throw new ApiError(400, 'consent_version_unknown', `unknown ${kind} consent text version`, {
      kind,
      accepted: ACCEPTED_CONSENT_VERSIONS[kind],
    });
  }
  return version;
}

async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new ApiError(400, 'recovery_code_invalid', 'this is not a recovery code');
  return sha256Hex(normalized);
}

/** POST /api/users */
export async function createUser(request: Request, deps: Deps): Promise<Response> {
  const body = await readBody(request);
  if (!isOneOf(body.lang, ['zh', 'en'] as const)) throw invalid('lang must be "zh" or "en"');
  if (!isRecord(body.consent)) throw invalid('consent is required');
  if (body.consent.general === undefined || body.consent.general === null) {
    throw new ApiError(403, 'consent_required', 'nothing is saved without the general consent');
  }
  const general = checkConsentVersion('general', body.consent.general);
  const health =
    body.consent.health === null || body.consent.health === undefined
      ? null
      : checkConsentVersion('health', body.consent.health);

  const at = deps.now().toISOString();
  const userId = randomId();
  const deviceToken = newDeviceToken();
  const recoveryCode = newRecoveryCode();
  const [tokenHash, recoveryHash] = await Promise.all([sha256Hex(deviceToken), hashRecoveryCode(recoveryCode)]);

  await deps.db.transaction(async (tx) => {
    await tx.query(
      `insert into users (id, created_at, recovery_hash, recovery_rotated_at, general_consent_version,
         general_consent_at, health_consent_version, health_consent_at, lang)
       values ($1, $2, $3, $2, $4, $2, $5, $6, $7)`,
      [userId, at, recoveryHash, general, health, health ? at : null, body.lang],
    );
    await tx.query(`insert into device_tokens (token_hash, user_id, created_at, origin) values ($1, $2, $3, 'create')`, [
      tokenHash,
      userId,
      at,
    ]);
    await tx.query(
      `insert into consents (id, user_id, kind, granted, text_version, at) values ($1, $2, 'general', true, $3, $4)`,
      [randomId(), userId, general, at],
    );
    if (health) {
      await tx.query(
        `insert into consents (id, user_id, kind, granted, text_version, at) values ($1, $2, 'health', true, $3, $4)`,
        [randomId(), userId, health, at],
      );
    }
  });

  const response: CreateUserResponse = {
    userId,
    deviceToken,
    recoveryCode,
    consent: { general: { version: general, at }, health: health ? { version: health, at } : null },
  };
  return json(response, 201);
}

/** POST /api/restore */
export async function restore(request: Request, deps: Deps): Promise<Response> {
  const body = await readBody(request);
  if (typeof body.recoveryCode !== 'string') throw invalid('recoveryCode is required');
  const hash = await hashRecoveryCode(body.recoveryCode);
  const user = await first<{ id: string }>(deps.db, 'select id from users where recovery_hash = $1', [hash]);
  // The same answer for a malformed code and an unknown one.
  if (!user) throw new ApiError(400, 'recovery_code_invalid', 'this is not a recovery code');
  const deviceToken = newDeviceToken();
  await deps.db.query(
    `insert into device_tokens (token_hash, user_id, created_at, origin) values ($1, $2, $3, 'restore')`,
    [await sha256Hex(deviceToken), user.id, deps.now().toISOString()],
  );
  const response: RestoreResponse = { userId: user.id, deviceToken };
  return json(response);
}

/** POST /api/recovery/rotate */
export async function rotateRecovery(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const recoveryCode = newRecoveryCode();
  await deps.db.query('update users set recovery_hash = $1, recovery_rotated_at = $2 where id = $3', [
    await hashRecoveryCode(recoveryCode),
    deps.now().toISOString(),
    user.id,
  ]);
  const response: RotateRecoveryResponse = { recoveryCode };
  return json(response);
}

/** POST /api/signout: forgets the device token this request was made with. */
export async function signOut(request: Request, deps: Deps): Promise<Response> {
  await requireUser(request, deps);
  await deps.db.query('delete from device_tokens where token_hash = $1', [await sha256Hex(bearer(request) ?? '')]);
  const response: OkResponse = { ok: true };
  return json(response);
}

/** POST /api/consent */
export async function setConsent(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  const body = (await readBody(request)) as Partial<ConsentRequest>;
  if (!isOneOf(body.kind, CONSENT_KINDS)) throw invalid('kind must be "general" or "health"');
  if (typeof body.granted !== 'boolean') throw invalid('granted must be true or false');
  const kind = body.kind;
  const at = deps.now().toISOString();

  if (kind === 'general' && !body.granted) {
    throw invalid('the general consent cannot be withdrawn here: delete the data with POST /api/me/delete');
  }
  // A withdrawal names the version it withdraws when the client knows it; otherwise the stored one.
  const version = body.granted
    ? checkConsentVersion(kind, body.version)
    : typeof body.version === 'string' && body.version !== ''
      ? body.version.slice(0, 64)
      : (user.health_consent_version ?? 'none');

  await deps.db.transaction(async (tx) => {
    await tx.query(
      `insert into consents (id, user_id, kind, granted, text_version, at) values ($1, $2, $3, $4, $5, $6)`,
      [randomId(), user.id, kind, body.granted, version, at],
    );
    if (kind === 'general') {
      await tx.query('update users set general_consent_version = $1, general_consent_at = $2 where id = $3', [
        version,
        at,
        user.id,
      ]);
    } else if (body.granted) {
      await tx.query('update users set health_consent_version = $1, health_consent_at = $2 where id = $3', [
        version,
        at,
        user.id,
      ]);
    } else {
      await tx.query('update users set health_consent_version = null, health_consent_at = null where id = $1', [
        user.id,
      ]);
      // Unfinished checks go on without body and mind. Their stored answers stay as raw
      // records but are no longer on the path, so they are not scored.
      await tx.query(
        'update sessions set health_consent = false where user_id = $1 and completed_at is null and health_consent',
        [user.id],
      );
    }
  });

  const response: ConsentResponse = { consent: consentOf(await loadUser(deps, user.id)) };
  return json(response);
}
