import { NextResponse } from 'next/server';

// NOTE: this file must live in the project root (or src/) — Next.js does not
// pick it up from lib/. In Next.js 16 the convention is `proxy.js`.
export function proxy(req) {
  // Development test runs are open: no access password required.
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  const token = req.headers.get('x-db-token') || req.nextUrl.searchParams.get('dbToken');
  const validToken = process.env.APP_PASSWORD; 

  if (!token || token !== validToken) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized. Check your Database Token in settings.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return NextResponse.next();
}

export const config = {
  // /api/chatstream is matched too — the EventSource passes dbToken as a query param.
  matcher: ['/api/chat/:path*', '/api/chatstream/:path*', '/api/messages/:path*', '/api/conversations/:path*'],
};
