// lib/auth.js
//
// Single-user password authentication, enforced inside the API routes (Node
// runtime, so the password is read from the environment at request time).
//
// Development: authentication is skipped so the app can be started without any
// configuration at all. Set DEV_REQUIRE_AUTH=true to exercise the real login
// flow in development.

import { NextResponse } from 'next/server';
import { IS_DEV } from './config';

export function getToken(request) {
  const header = request.headers.get('x-db-token');
  if (header) return header;
  try {
    return new URL(request.url).searchParams.get('dbToken');
  } catch {
    return null;
  }
}

let warnedAboutPassword = false;

export function isAuthorized(request) {
  const expected = process.env.APP_PASSWORD;
  if (IS_DEV && process.env.DEV_REQUIRE_AUTH !== 'true') return true;
  if (!expected) {
    // Fail closed: without a password every request is rejected, so say why.
    if (!warnedAboutPassword) {
      warnedAboutPassword = true;
      console.error('[auth] APP_PASSWORD is not set: every API request is rejected. See .env.example.');
    }
    return false;
  }
  return getToken(request) === expected;
}

export function unauthorized() {
  return NextResponse.json(
    { error: 'Unauthorized. Check your access password in settings.' },
    { status: 401 }
  );
}
