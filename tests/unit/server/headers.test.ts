// The security headers of next.config.ts: every response, and a content policy in production
// that allows this site's own origin only (CLAUDE.md: no third-party resource of any kind).

import { afterEach, describe, expect, it, vi } from 'vitest';

async function headersFor(nodeEnv: string): Promise<Record<string, string>> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  const { default: config } = await import('../../../next.config');
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === '/:path*');
  expect(all, 'a rule for every path').toBeDefined();
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('security headers', () => {
  it('in production: the content policy keeps everything on this site', async () => {
    const h = await headersFor('production');
    const csp = h['Content-Security-Policy'];
    expect(csp).toBeDefined();
    for (const directive of ["default-src 'self'", "connect-src 'self'", "font-src 'self'", "frame-ancestors 'none'", "object-src 'none'"]) {
      expect(csp, directive).toContain(directive);
    }
    // Nothing but this site, data: and blob: may appear as a source.
    expect(csp).not.toMatch(/https?:/);
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  it('in development the content policy is left out, so fast refresh works; the rest stays', async () => {
    const h = await headersFor('development');
    expect(h['Content-Security-Policy']).toBeUndefined();
    expect(h['X-Frame-Options']).toBe('DENY');
  });
});
