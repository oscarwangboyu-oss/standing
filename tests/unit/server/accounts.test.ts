// Accounts (PROMPT.md section 11): no sign-up, a random id, a device token and a recovery code
// that are stored as hashes only, several devices per record, restore and rotation.

import { describe, expect, it } from 'vitest';
import { CONSENT_VERSIONS } from '@/shared/api';
import { sha256Hex } from '@/server/crypto';
import { makeApi, newUser } from './helpers/api';

describe('first save', () => {
  it('creates a record and returns the token and the recovery code once', async () => {
    const api = await makeApi({ now: '2026-03-01T12:00:00.000Z' });
    const created = await newUser(api);

    expect(created.userId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(created.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // 20 characters of a 32-character alphabet (100 bits) in four groups, without I, L, O, U.
    expect(created.recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    expect(created.consent).toEqual({
      general: { version: CONSENT_VERSIONS.general, at: '2026-03-01T12:00:00.000Z' },
      health: { version: CONSENT_VERSIONS.health, at: '2026-03-01T12:00:00.000Z' },
    });

    const me = await api.call('GET', '/api/me', { token: created.deviceToken });
    expect(me.status).toBe(200);
    expect(me.body.user).toEqual({
      id: created.userId,
      createdAt: '2026-03-01T12:00:00.000Z',
      lang: 'en',
      ticker: null,
      usState: null,
      age: null,
      role: null,
    });
    expect(me.body.latest).toBeNull();
    expect(me.body.history).toEqual([]);
    expect(me.body.allTime).toEqual({ high: null, low: null });
    expect(me.body.openSession).toBeNull();
  });

  it('stores only hashes of the token and of the recovery code', async () => {
    const api = await makeApi();
    const created = await newUser(api);
    const tokens = await api.db.query<{ token_hash: string }>('select token_hash from device_tokens');
    expect(tokens).toEqual([{ token_hash: await sha256Hex(created.deviceToken) }]);
    const users = await api.db.query<{ recovery_hash: string }>('select recovery_hash from users');
    expect(users).toEqual([{ recovery_hash: await sha256Hex(created.recoveryCode.replaceAll('-', '')) }]);
    // Neither secret appears anywhere in the database in clear.
    const dump = JSON.stringify([
      await api.db.query('select * from users'),
      await api.db.query('select * from device_tokens'),
      await api.db.query('select * from consents'),
    ]);
    expect(dump).not.toContain(created.deviceToken);
    expect(dump).not.toContain(created.recoveryCode);
    expect(dump).not.toContain(created.recoveryCode.replaceAll('-', ''));
  });

  it('two saves give two unrelated records', async () => {
    const api = await makeApi();
    const a = await newUser(api);
    const b = await newUser(api);
    expect(a.userId).not.toBe(b.userId);
    expect(a.deviceToken).not.toBe(b.deviceToken);
    expect(a.recoveryCode).not.toBe(b.recoveryCode);
  });

  it('needs a language and a known consent text', async () => {
    const api = await makeApi();
    const noLang = await api.call('POST', '/api/users', { body: { consent: { general: CONSENT_VERSIONS.general, health: null } } });
    expect(noLang.status).toBe(400);
    expect(noLang.body.error.code).toBe('invalid_request');
    const bad = await api.call('POST', '/api/users', { raw: '{not json' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid_json');
  });
});

describe('auth', () => {
  it('rejects a missing or unknown token', async () => {
    const api = await makeApi();
    await newUser(api);
    const none = await api.call('GET', '/api/me');
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: { code: 'unauthorized', message: 'missing device token' } });
    const wrong = await api.call('GET', '/api/me', { token: 'x'.repeat(43) });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('unauthorized');
  });

  it('signing out forgets this device only', async () => {
    const api = await makeApi();
    const created = await newUser(api);
    const second = await api.call('POST', '/api/restore', { body: { recoveryCode: created.recoveryCode } });
    expect((await api.call('POST', '/api/signout', { token: created.deviceToken })).body).toEqual({ ok: true });
    expect((await api.call('GET', '/api/me', { token: created.deviceToken })).status).toBe(401);
    expect((await api.call('GET', '/api/me', { token: second.body.deviceToken })).status).toBe(200);
  });
});

describe('restore with the recovery code', () => {
  it('issues a new device token for the same record; both devices work', async () => {
    const api = await makeApi();
    const created = await newUser(api);
    const restored = await api.call('POST', '/api/restore', { body: { recoveryCode: created.recoveryCode } });
    expect(restored.status).toBe(200);
    expect(restored.body.userId).toBe(created.userId);
    expect(restored.body.deviceToken).not.toBe(created.deviceToken);

    const first = await api.call('GET', '/api/me', { token: created.deviceToken });
    const second = await api.call('GET', '/api/me', { token: restored.body.deviceToken });
    expect(first.body.user.id).toBe(created.userId);
    expect(second.body.user.id).toBe(created.userId);
    const tokens = await api.db.query<{ origin: string }>('select origin from device_tokens order by origin');
    expect(tokens.map((t) => t.origin)).toEqual(['create', 'restore']);
  });

  it('reads the code as a person types it: lower case, spaces, no dashes, O for 0, I and L for 1', async () => {
    const api = await makeApi();
    const created = await newUser(api);
    const typed = created.recoveryCode
      .toLowerCase()
      .replaceAll('-', ' ')
      .replaceAll('0', 'o')
      .replaceAll('1', 'l');
    const restored = await api.call('POST', '/api/restore', { body: { recoveryCode: `  ${typed} ` } });
    expect(restored.status).toBe(200);
    expect(restored.body.userId).toBe(created.userId);
  });

  it('rejects a wrong code and a malformed code with the same answer', async () => {
    const api = await makeApi();
    await newUser(api);
    const wrong = await api.call('POST', '/api/restore', { body: { recoveryCode: '00000-00000-00000-00000' } });
    const malformed = await api.call('POST', '/api/restore', { body: { recoveryCode: 'hello' } });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toEqual(malformed.body);
    expect(wrong.body.error.code).toBe('recovery_code_invalid');
    expect((await api.db.query('select 1 from device_tokens')).length).toBe(1);
  });

  it('rotating the code makes the old one useless', async () => {
    const api = await makeApi();
    const created = await newUser(api);
    const rotated = await api.call('POST', '/api/recovery/rotate', { token: created.deviceToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.recoveryCode).not.toBe(created.recoveryCode);
    expect((await api.call('POST', '/api/restore', { body: { recoveryCode: created.recoveryCode } })).status).toBe(400);
    const again = await api.call('POST', '/api/restore', { body: { recoveryCode: rotated.body.recoveryCode } });
    expect(again.status).toBe(200);
    expect(again.body.userId).toBe(created.userId);
    // Rotation needs a signed-in device.
    expect((await api.call('POST', '/api/recovery/rotate')).status).toBe(401);
  });
});

describe('routing', () => {
  it('answers unknown paths and wrong methods with the error shape', async () => {
    const api = await makeApi();
    const missing = await api.call('GET', '/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');
    const method = await api.call('GET', '/api/users');
    expect(method.status).toBe(405);
    expect(method.body.error.code).toBe('method_not_allowed');
  });

  it('serves health and config without sign-in', async () => {
    const api = await makeApi();
    expect((await api.call('GET', '/api/health')).body).toEqual({ ok: true, environment: 'local' });
    const config = await api.call('GET', '/api/config');
    expect(config.body).toEqual({
      environment: 'local',
      flags: { dailyOpen: true, payday: true, weeklyWin: true, peopleNudge: true },
      versions: { algo: 1, bank: '2.1', norm: 'provisional-1' },
      consentVersions: { general: 'general-1', health: 'health-1' },
      teamOpen: true,
    });
    expect(config.headers.get('cache-control')).toBe('no-store');
  });

  it('turns the stage switches off in production by default', async () => {
    const api = await makeApi({ vars: { STANDING_ENV: 'production', ADMIN_PASSPHRASE: undefined } });
    const config = await api.call('GET', '/api/config');
    expect(config.body.environment).toBe('production');
    expect(config.body.flags).toEqual({ dailyOpen: false, payday: false, weeklyWin: false, peopleNudge: false });
    expect(config.body.teamOpen).toBe(false);
  });
});
