// lib/config.js
//
// Client + server safe runtime flags. Do NOT put secrets in here: everything in
// this file can be read from the browser bundle.

// `next dev` sets NODE_ENV=development, `next build`/`next start` sets production.
export const IS_DEV = process.env.NODE_ENV !== 'production';

// In development the app does not ask for a password: this token is sent by the
// browser and accepted by lib/auth.js. Set DEV_REQUIRE_AUTH=true to test the
// real login flow while still running in development.
export const DEV_ACCESS_TOKEN = 'dev-no-auth';

// Default model when no mode specific model is configured (see .env.example).
export const FALLBACK_MODEL = 'gemini-3.8-flash';
