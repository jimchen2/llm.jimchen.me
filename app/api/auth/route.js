import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { password } = await req.json();
  if (password === process.env.APP_PASSWORD) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ auth: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(secret);
    
    const res = NextResponse.json({ success: true });
    res.cookies.set('auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
    return res;
  }
  return NextResponse.json({ success: false }, { status: 401 });
}