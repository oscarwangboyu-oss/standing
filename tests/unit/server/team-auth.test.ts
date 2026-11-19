// The team dashboard API is protected by ADMIN_PASSPHRASE, is read only, and is closed when no
// passphrase is configured.

import { describe, expect, it } from 'vitest';
import { constantTimeEqual } from '@/server/crypto';
import { makeApi, newUser, TEAM_PASSPHRASE } from './helpers/api';

const TABLES = ['overview', 'items', 'prices', 'norms', 'returns', 'report'];

describe('team passphrase', () => {
  it('opens every table with the right passphrase', async () => {
    const api = await makeApi();
    for (const table of TABLES) {
      const res = await api.call('GET', `/api/team/${table}`, { token: TEAM_PASSPHRASE });
      expect(res.status, table).toBe(200);
      expect(res.body.generatedAt, table).toBe('2026-03-01T12:00:00.000Z');
    }
  });

  it('rejects a missing or wrong passphrase with the same answer', async () => {
    const api = await makeApi();
    const user = await newUser(api);
    for (const table of TABLES) {
      const none = await api.call('GET', `/api/team/${table}`);
      const wrong = await api.call('GET', `/api/team/${table}`, { token: `${TEAM_PASSPHRASE}x` });
      const prefix = await api.call('GET', `/api/team/${table}`, { token: TEAM_PASSPHRASE.slice(0, -1) });
      // A signed-in user is not a team member.
      const device = await api.call('GET', `/api/team/${table}`, { token: user.deviceToken });
      for (const res of [none, wrong, prefix, device]) {
        expect(res.status, table).toBe(401);
        expect(res.body).toEqual({ error: { code: 'team_unauthorized', message: 'wrong team passphrase' } });
      }
    }
    // The passphrase in the query string is not accepted: it must not end up in URLs.
    const inUrl = await api.call('GET', `/api/team/overview?passphrase=${encodeURIComponent(TEAM_PASSPHRASE)}`);
    expect(inUrl.status).toBe(401);
  });

  it('is closed, not open, when no passphrase is configured', async () => {
    for (const environment of ['production', 'preview', 'local']) {
      const api = await makeApi({ vars: { STANDING_ENV: environment, ADMIN_PASSPHRASE: undefined } });
      expect(api.env.adminPassphrase).toBeNull();
      for (const token of [undefined, '', 'anything', 'undefined', 'null']) {
        const res = await api.call('GET', '/api/team/overview', { token });
        expect(res.status, environment).toBe(403);
        expect(res.body.error.code, environment).toBe('team_closed');
      }
    }
    // An empty passphrase counts as none.
    const empty = await makeApi({ vars: { STANDING_ENV: 'production', ADMIN_PASSPHRASE: '' } });
    expect((await empty.call('GET', '/api/team/overview', { token: '' })).status).toBe(403);
  });

  it('is read only', async () => {
    const api = await makeApi();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await api.call(method, '/api/team/overview', { token: TEAM_PASSPHRASE, body: method === 'DELETE' ? undefined : {} });
      expect(res.status, method).toBe(405);
    }
    expect((await api.call('GET', '/api/team/users', { token: TEAM_PASSPHRASE })).status).toBe(404);
    expect((await api.call('GET', '/api/team/items?role=king', { token: TEAM_PASSPHRASE })).status).toBe(400);
    expect((await api.call('GET', '/api/team/items?format=xml', { token: TEAM_PASSPHRASE })).status).toBe(400);
  });

  it('compares secrets in constant time form: equal only when identical', async () => {
    expect(await constantTimeEqual('correct horse', 'correct horse')).toBe(true);
    expect(await constantTimeEqual('correct horse', 'correct horsf')).toBe(false);
    expect(await constantTimeEqual('correct horse', 'correct hors')).toBe(false);
    expect(await constantTimeEqual('', 'correct horse')).toBe(false);
    expect(await constantTimeEqual('', '')).toBe(true);
  });
});
