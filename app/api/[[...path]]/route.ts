import { handleApi } from '@/server/router';

// The API needs Node (Postgres driver, embedded Postgres locally) and is never cached.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handler(request: Request): Promise<Response> {
  return handleApi(request);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
