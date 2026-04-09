// middleware.js
import { NextResponse } from 'next/server';

export function middleware(req) {
  // Check header for fetch() calls, or query parameter for EventSource (SSE stream)
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
  matcher: ['/api/chat/:path*', '/api/messages/:path*'],
};