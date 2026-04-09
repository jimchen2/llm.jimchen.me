import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  if (req.nextUrl.pathname === '/api/auth') return NextResponse.next();

  const token = req.cookies.get('auth_token')?.value;
  if (!token) return NextResponse.redirect(new URL('/?login=true', req.url));

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (err) {
    return NextResponse.redirect(new URL('/?login=true', req.url));
  }
}

export const config = {
  matcher: ['/api/chat/:path*', '/api/messages/:path*'],
};