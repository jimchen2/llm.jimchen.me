// proxy.js — Next.js 16 proxy (formerly middleware).
// NOTE: this file MUST stay at the project root (not in lib/), or Next.js
// will not detect it and the auth below will silently never run.
import { NextResponse } from 'next/server';

export function proxy(req) {
  const token = req.headers.get('x-db-token') || req.nextUrl.searchParams.get('dbToken');
  const validToken = process.env.APP_PASSWORD || 'your-default-password';

  if (!token || token !== validToken) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized. Check your Database Token in settings.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return NextResponse.next();
}

export const config = {
  // Base paths included explicitly — `:path*` alone does not match them.
  matcher: [
    '/api/chat/:path*',
    '/api/messages',
    '/api/messages/:path*',
    '/api/conversations',
    '/api/conversations/:path*',
    '/api/chatstream',
  ],
};
