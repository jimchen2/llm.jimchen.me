import { NextResponse } from 'next/server';

// NOTE: this file must live at the project root for Next.js to pick it up.
// The previous lib/middleware.js was never executed.

export function proxy(req) {
  const token =
    req.headers.get('x-db-token') || req.nextUrl.searchParams.get('dbToken');
  const validToken = process.env.APP_PASSWORD;

  if (!validToken) {
    return new NextResponse(
      JSON.stringify({ error: 'APP_PASSWORD is not configured on the server.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!token || token !== validToken) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized. Check your Database Token in settings.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/chat/:path*',
    '/api/messages/:path*',
    '/api/conversations/:path*',
    '/api/chatstream/:path*',
  ],
};
